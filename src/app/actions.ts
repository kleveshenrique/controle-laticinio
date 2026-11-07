"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { AccountStatus, AttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSession, destroySession, requirePermission, requireUser, can } from "@/lib/auth";
import { run } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { PERMISSIONS, type PermissionName } from "@/lib/permissions";
import { brl, dateBR, parseMoney, type AlteracaoConta } from "@/lib/format";
import { MAX_ANEXOS, MAX_PDF_BYTES, MAX_PDF_MB, TIPOS_ANEXO, type TipoAnexo } from "@/lib/anexos";
import { comPdfsNoS3, excluirPdfs } from "@/lib/storage";
import { refValida, urlCadastroSalvo } from "@/lib/cadastroNovaAba";
import { documentoValido, soDigitos, telefoneValido, UFS, type TipoPessoa } from "@/lib/documentos";

const ids = (fd: FormData) => fd.getAll("ids").map(String);
const perms = (fd: FormData) =>
  fd.getAll("permissions").map(String).filter((p): p is PermissionName => (PERMISSIONS as readonly string[]).includes(p));

/* ---------- sessão ---------- */

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user?.active && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) redirect("/login?erro=" + encodeURIComponent("E-mail ou senha incorretos."));
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  destroySession();
  redirect("/login");
}

/* ---------- 1. lançar ---------- */

const rowSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição."),
  supplier: z.string().trim().min(2, "Informe o fornecedor."),
  category: z.string().trim().min(2, "Informe a categoria."),
  amount: z.string(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  notes: z.string().trim().max(1000, "Observações: no máximo 1000 caracteres.").optional(),
});

/** Impede lançar contas com fornecedores ou categorias marcados como inativos no cadastro. */
async function bloquearInativos(fornecedores: string[], categorias: string[]) {
  const [forn, cat] = await Promise.all([
    fornecedores.length ? prisma.supplier.findFirst({ where: { name: { in: fornecedores }, active: false }, select: { name: true } }) : null,
    categorias.length ? prisma.category.findFirst({ where: { name: { in: categorias }, active: false }, select: { name: true } }) : null,
  ]);
  if (forn) throw new UserError(`O fornecedor "${forn.name}" está inativo no cadastro.`);
  if (cat) throw new UserError(`A categoria "${cat.name}" está inativa no cadastro.`);
}

/**
 * Exclui do S3 os PDFs dos anexos removidos. É chamada como último passo da transação,
 * antes de a exclusão no banco ser confirmada: se o S3 falhar, a transação é desfeita e nada muda no banco.
 */
async function excluirDoS3(keys: (string | null)[]) {
  try {
    await excluirPdfs(keys);
  } catch (e) {
    console.error("Falha ao excluir PDFs do S3:", e);
    throw new UserError("Não foi possível excluir o PDF no armazenamento (S3). Nada foi alterado; tente novamente.");
  }
}

/** Lê os PDFs enviados num campo do formulário, validando quantidade, tamanho e tipo. */
async function lerPdfs(formData: FormData, field: string, kind: AttachmentKind, label: string) {
  const files = formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_ANEXOS) throw new UserError(`${label}: no máximo ${MAX_ANEXOS} arquivos.`);
  return Promise.all(
    files.map(async (f) => {
      if (f.size > MAX_PDF_BYTES) throw new UserError(`${label}: "${f.name}" passa de ${MAX_PDF_MB} MB.`);
      const data = Buffer.from(await f.arrayBuffer());
      if (data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new UserError(`${label}: "${f.name}" não é um PDF.`);
      return { kind, fileName: f.name.slice(0, 200), size: f.size, data };
    }),
  );
}

export async function lancarContas(formData: FormData) {
  await run("/contas/nova", "/contas/nova", async () => {
    const user = await requirePermission("LANCAR");
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("rows") ?? "[]"));
    } catch {
      throw new UserError("Dados inválidos.");
    }
    const parsed = z.array(rowSchema).min(1, "Adicione ao menos uma conta.").max(200).safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const line = typeof issue.path[0] === "number" ? `Linha ${issue.path[0] + 1}: ` : "";
      throw new UserError(line + issue.message);
    }
    const rows = await Promise.all(
      parsed.data.map(async (r, i) => {
        const amount = parseMoney(r.amount);
        if (!(amount > 0)) throw new UserError(`Linha ${i + 1}: valor inválido.`);
        return { ...r, amount };
      }),
    );
    await bloquearInativos(rows.map((r) => r.supplier), rows.map((r) => r.category));
    const pdfs = (
      await Promise.all(
        rows.map(async (_, i) =>
          [
            ...(await lerPdfs(formData, `pedido_${i}`, "PEDIDO", `Linha ${i + 1}, Pedido`)),
            ...(await lerPdfs(formData, `nota_${i}`, "NOTA_FISCAL", `Linha ${i + 1}, Nota fiscal`)),
            ...(await lerPdfs(formData, `boleto_${i}`, "BOLETO", `Linha ${i + 1}, Boletos`)),
          ].map((p) => ({ ...p, linha: i })),
        ),
      )
    ).flat();

    // Os PDFs vão para o S3 antes de gravar as contas; se a gravação falhar, são removidos do bucket.
    await comPdfsNoS3(pdfs, (enviados) => prisma.$transaction(
      async (tx) => {
        for (const [i, r] of rows.entries()) {
          const attachments = enviados.filter((p) => p.linha === i).map(({ linha, ...p }) => p);
          const supplier = await tx.supplier.upsert({ where: { name: r.supplier }, update: {}, create: { name: r.supplier } });
          const category = r.category
            ? await tx.category.upsert({ where: { name: r.category }, update: {}, create: { name: r.category } })
            : null;
          await tx.account.create({
            data: {
              description: r.description,
              supplierId: supplier.id,
              categoryId: category?.id,
              amount: r.amount,
              dueDate: new Date(r.dueDate + "T00:00:00.000Z"),
              notes: r.notes || null,
              createdById: user.id,
              attachments: { create: attachments },
            },
          });
        }
      },
      { timeout: 30000 },
    ));
    return `${rows.length} conta(s) lançada(s), aguardando aprovação.`;
  });
}

export async function cancelar(formData: FormData) {
  await run("/contas", "/contas", async () => {
    const user = await requireUser();
    const acc = await prisma.account.findUnique({ where: { id: String(formData.get("id")) } });
    if (!acc) throw new UserError("Conta não encontrada.");
    if (acc.createdById !== user.id && !can(user, "ADMIN")) throw new UserError("Só quem lançou (ou o administrador) pode cancelar.");
    const res = await prisma.account.updateMany({
      where: { id: acc.id, status: { in: ["PENDENTE", "REJEITADA"] } },
      data: { status: "CANCELADA", canceledById: user.id, canceledAt: new Date() },
    });
    if (!res.count) throw new UserError("Esta conta não pode mais ser cancelada.");
    return `Conta #${acc.code} cancelada.`;
  });
}

/** Cancela uma conta pendente na tela de aprovações, exigindo motivo. */
export async function cancelarAprovacao(formData: FormData) {
  await run("/contas?status=PENDENTE", "/contas?status=PENDENTE", async () => {
    const user = await requirePermission("APROVAR");
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (motivo.length < 3) throw new UserError("Informe o motivo do cancelamento.");
    const acc = await prisma.account.findUnique({ where: { id: String(formData.get("id")) } });
    if (!acc) throw new UserError("Conta não encontrada.");
    const res = await prisma.account.updateMany({
      where: { id: acc.id, status: "PENDENTE" },
      data: { status: "CANCELADA", canceledById: user.id, canceledAt: new Date(), cancelReason: motivo },
    });
    if (!res.count) throw new UserError(`Conta #${acc.code} não está mais aguardando aprovação.`);
    return `Conta #${acc.code} cancelada.`;
  });
}

/**
 * Lê do formulário os anexos a remover (campo "remover") e os PDFs novos (um campo por tipo),
 * aplicando as permissões e o limite de MAX_ANEXOS por tipo, já contando os que ficam.
 */
async function lerAlteracoesAnexos(
  formData: FormData,
  existentes: { id: string; kind: TipoAnexo }[],
  regras: { podeAlterar: (k: TipoAnexo) => boolean; podeRemover: boolean; negado: (k: TipoAnexo) => string },
) {
  const remover = formData.getAll("remover").map(String).filter((id) => existentes.some((a) => a.id === id));
  if (remover.length && !regras.podeRemover) throw new UserError(regras.negado(existentes.find((a) => a.id === remover[0])!.kind));
  const novos = [];
  for (const kind of Object.keys(TIPOS_ANEXO) as TipoAnexo[]) {
    const { label, campo } = TIPOS_ANEXO[kind];
    const files = await lerPdfs(formData, campo, kind, label);
    if (files.length && !regras.podeAlterar(kind)) throw new UserError(regras.negado(kind));
    const ficam = existentes.filter((a) => a.kind === kind && !remover.includes(a.id)).length;
    if (ficam + files.length > MAX_ANEXOS) throw new UserError(`${label}: no máximo ${MAX_ANEXOS} arquivos por conta.`);
    novos.push(...files);
  }
  return { remover, novos };
}

/**
 * Edita uma conta aguardando aprovação ou rejeitada: dados e anexos (pedido e boletos). Só quem lançou ou o administrador.
 * Nas rejeitadas, cada alteração fica registrada (AccountEdit) para quem for aprovar ver o que mudou.
 */
export async function editarConta(formData: FormData) {
  const volta = formData.get("volta") === "REJEITADA" ? "/contas?status=REJEITADA" : "/contas?status=PENDENTE";
  await run(volta, volta, async () => {
    const user = await requireUser();
    const acc = await prisma.account.findUnique({
      where: { id: String(formData.get("id")) },
      include: { supplier: true, category: true, attachments: { select: { id: true, kind: true, fileName: true, storageKey: true } } },
    });
    if (!acc) throw new UserError("Conta não encontrada.");
    if (acc.createdById !== user.id && !can(user, "ADMIN")) throw new UserError("Só quem lançou (ou o administrador) pode editar a conta.");
    const naoEditavel = `Conta #${acc.code} não está mais aguardando aprovação nem rejeitada e não pode ser editada.`;
    if (acc.status !== "PENDENTE" && acc.status !== "REJEITADA") throw new UserError(naoEditavel);
    const status = acc.status;

    const parsed = rowSchema.safeParse({
      description: formData.get("description") ?? "",
      supplier: formData.get("supplier") ?? "",
      category: formData.get("category") ?? "",
      amount: formData.get("amount") ?? "",
      dueDate: formData.get("dueDate") ?? "",
      notes: formData.get("notes") ?? "",
    });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    const r = parsed.data;
    const amount = parseMoney(r.amount);
    if (!(amount > 0)) throw new UserError("Informe um valor válido.");
    await bloquearInativos(
      r.supplier !== acc.supplier.name ? [r.supplier] : [],
      r.category !== (acc.category?.name ?? "") ? [r.category] : [],
    );

    const { remover, novos } = await lerAlteracoesAnexos(formData, acc.attachments, {
      podeAlterar: (k) => k !== "NOTA_FISCAL",
      podeRemover: true,
      negado: () => "A nota fiscal só pode ser anexada depois que a conta for aprovada.",
    });

    // O que mudou, no formato exibido no histórico.
    const dueDate = new Date(r.dueDate + "T00:00:00.000Z");
    const mudancas: AlteracaoConta[] = [];
    const comparar = (campo: string, de: string, para: string) => de !== para && mudancas.push({ campo, de, para });
    comparar("Descrição", acc.description, r.description);
    comparar("Fornecedor", acc.supplier.name, r.supplier);
    comparar("Categoria", acc.category?.name ?? "", r.category);
    comparar("Valor", brl(acc.amount), brl(amount));
    comparar("Vencimento", dateBR(acc.dueDate), dateBR(dueDate));
    comparar("Observações", acc.notes ?? "", r.notes ?? "");
    for (const a of acc.attachments.filter((a) => remover.includes(a.id)))
      mudancas.push({ campo: `${TIPOS_ANEXO[a.kind].label} (removido)`, de: a.fileName, para: "" });
    for (const a of novos) mudancas.push({ campo: `${TIPOS_ANEXO[a.kind].label} (incluído)`, de: "", para: a.fileName });
    if (!mudancas.length) throw new UserError("Nenhuma alteração feita.");

    await comPdfsNoS3(novos, (enviados) => prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.upsert({ where: { name: r.supplier }, update: {}, create: { name: r.supplier } });
      const category = await tx.category.upsert({ where: { name: r.category }, update: {}, create: { name: r.category } });
      const res = await tx.account.updateMany({
        where: { id: acc.id, status },
        data: {
          description: r.description,
          supplierId: supplier.id,
          categoryId: category.id,
          amount,
          dueDate,
          notes: r.notes || null,
        },
      });
      if (!res.count) throw new UserError(naoEditavel);
      await tx.attachment.deleteMany({ where: { id: { in: remover }, accountId: acc.id } });
      if (enviados.length) await tx.attachment.createMany({ data: enviados.map((a) => ({ ...a, accountId: acc.id })) });
      if (status === "REJEITADA") await tx.accountEdit.create({ data: { accountId: acc.id, userId: user.id, changes: mudancas } });
      // Por último: exclui no S3 e só então a transação confirma a exclusão no banco.
      await excluirDoS3(acc.attachments.filter((a) => remover.includes(a.id)).map((a) => a.storageKey));
    }, { timeout: 30000 }));
    return `Conta #${acc.code} atualizada.`;
  });
}

/**
 * Anexos de uma conta aprovada ou paga (aba Contas).
 * Aprovada: quem lança pode adicionar nota fiscal e boletos; só o administrador mexe no pedido e remove arquivos.
 * Paga: só o administrador pode alterar.
 */
export async function gerenciarAnexos(formData: FormData) {
  const v = formData.get("volta");
  const volta = v === "PAGAMENTOS" ? "/pagamentos" : v === "PAGA" ? "/contas?status=PAGA" : "/contas?status=APROVADA";
  await run(volta, volta, async () => {
    // Quem lança ou quem paga pode incluir nota fiscal e boletos.
    const user = await requireUser();
    if (!can(user, "LANCAR") && !can(user, "PAGAR")) throw new UserError("Você não tem permissão para esta ação.");
    const admin = can(user, "ADMIN");
    const acc = await prisma.account.findUnique({
      where: { id: String(formData.get("id")) },
      include: { attachments: { select: { id: true, kind: true, storageKey: true } } },
    });
    if (!acc) throw new UserError("Conta não encontrada.");
    if (acc.status === "PAGA" && !admin) throw new UserError(`Conta #${acc.code} já foi paga; só o administrador pode alterar os anexos.`);
    if (acc.status !== "APROVADA" && acc.status !== "PAGA")
      throw new UserError(`Conta #${acc.code} não está aprovada; os anexos não podem ser alterados.`);

    const { remover, novos } = await lerAlteracoesAnexos(formData, acc.attachments, {
      podeAlterar: (k) => admin || k !== "PEDIDO",
      podeRemover: admin,
      negado: (k) => (k === "PEDIDO" ? "Só o administrador pode alterar o pedido." : "Só o administrador pode remover anexos."),
    });
    if (!novos.length && !remover.length) throw new UserError("Nenhuma alteração nos anexos.");

    await comPdfsNoS3(novos, (enviados) =>
      prisma.$transaction(async (tx) => {
        await tx.attachment.deleteMany({ where: { id: { in: remover }, accountId: acc.id } });
        if (enviados.length) await tx.attachment.createMany({ data: enviados.map((a) => ({ ...a, accountId: acc.id })) });
        // Por último: exclui no S3 e só então a transação confirma a exclusão no banco.
        await excluirDoS3(acc.attachments.filter((a) => remover.includes(a.id)).map((a) => a.storageKey));
      }, { timeout: 30000 }),
    );
    return `Anexos da conta #${acc.code} atualizados.`;
  });
}

/* ---------- 2. validar e autorizar ---------- */

export async function aprovar(formData: FormData) {
  await run("/contas?status=PENDENTE", "/contas?status=PENDENTE", async () => {
    const user = await requirePermission("APROVAR");
    const accounts = await prisma.account.findMany({ where: { id: { in: ids(formData) }, status: "PENDENTE" } });
    if (!accounts.length) throw new UserError("Selecione ao menos uma conta pendente.");
    if (!can(user, "ADMIN") && accounts.some((a) => a.createdById === user.id)) {
      throw new UserError("Você não pode aprovar contas que você mesmo lançou.");
    }
    const res = await prisma.account.updateMany({
      where: {
        id: { in: accounts.map((a) => a.id) },
        status: "PENDENTE",
        ...(can(user, "ADMIN") ? {} : { createdById: { not: user.id } }),
      },
      data: { status: "APROVADA", reviewedById: user.id, reviewedAt: new Date(), rejectionReason: null },
    });
    if (!res.count) throw new UserError("Nenhuma conta pôde ser aprovada.");
    return `${res.count} conta(s) aprovada(s).`;
  });
}

export async function rejeitar(formData: FormData) {
  await run("/contas?status=PENDENTE", "/contas?status=PENDENTE", async () => {
    const user = await requirePermission("APROVAR");
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (motivo.length < 3) throw new UserError("Informe o motivo da rejeição.");
    const count = await prisma.$transaction(async (tx) => {
      const where = { id: { in: ids(formData) }, status: { in: ["PENDENTE", "APROVADA"] as AccountStatus[] } };
      const alvo = await tx.account.findMany({ where, select: { id: true } });
      if (!alvo.length) return 0;
      const now = new Date();
      const res = await tx.account.updateMany({
        where: { ...where, id: { in: alvo.map((a) => a.id) } },
        data: { status: "REJEITADA", reviewedById: user.id, reviewedAt: now, rejectionReason: motivo },
      });
      if (res.count !== alvo.length) throw new UserError("Algumas contas foram alteradas por outra pessoa. Tente novamente.");
      await tx.rejection.createMany({
        data: alvo.map((a) => ({ accountId: a.id, userId: user.id, reason: motivo, createdAt: now })),
      });
      return res.count;
    });
    if (!count) throw new UserError("Selecione ao menos uma conta.");
    return `${count} conta(s) rejeitada(s).`;
  });
}

export async function reenviar(formData: FormData) {
  const user = await requireUser();
  // Continua na lista de rejeitadas (de onde o botão é usado), sem levar para Aprovações.
  await run("/contas?status=REJEITADA", "/contas?status=REJEITADA", async () => {
    const acc = await prisma.account.findUnique({ where: { id: String(formData.get("id")) } });
    if (!acc) throw new UserError("Conta não encontrada.");
    if (acc.createdById !== user.id && !can(user, "ADMIN"))
      throw new UserError("Só quem lançou (ou o administrador) pode reenviar para aprovação.");
    const res = await prisma.account.updateMany({
      where: { id: acc.id, status: "REJEITADA" },
      data: { status: "PENDENTE", reviewedById: null, reviewedAt: null, rejectionReason: null },
    });
    if (!res.count) throw new UserError("Só contas rejeitadas podem ser reenviadas.");
    return `Conta #${acc.code} reenviada para aprovação.`;
  });
}

/* ---------- 3. pagar e dar baixa no caixa ---------- */

export async function pagar(formData: FormData) {
  await run("/pagamentos", "/pagamentos", async () => {
    const user = await requirePermission("PAGAR");
    const cashRegisterId = String(formData.get("cashRegisterId") ?? "");
    const reference = String(formData.get("reference") ?? "").trim() || null;
    const selected = ids(formData);
    if (!selected.length) throw new UserError("Selecione ao menos uma conta.");
    if (!cashRegisterId) throw new UserError("Escolha o caixa.");

    await prisma.$transaction(
      async (tx) => {
        const accounts = await tx.account.findMany({ where: { id: { in: selected } }, orderBy: { dueDate: "asc" } });
        for (const acc of accounts) {
          if (acc.status !== "APROVADA") throw new UserError(`Conta #${acc.code} não está aprovada para pagamento.`);
          if (acc.reviewedById === user.id && !can(user, "ADMIN"))
            throw new UserError(`Você aprovou a conta #${acc.code}; outra pessoa precisa pagá-la.`);

          const claimed = await tx.account.updateMany({
            where: { id: acc.id, status: "APROVADA" },
            data: { status: "PAGA", paidById: user.id, paidAt: new Date(), paymentReference: reference, cashRegisterId },
          });
          if (claimed.count !== 1) throw new UserError(`Conta #${acc.code} já foi paga por outra pessoa.`);

          const debited = await tx.cashRegister.updateMany({
            where: { id: cashRegisterId, active: true },
            data: { balance: { decrement: acc.amount } },
          });
          if (debited.count !== 1) throw new UserError("Caixa não encontrado ou inativo.");

          await tx.cashMovement.create({
            data: {
              type: "SAIDA",
              amount: acc.amount,
              description: `Pagamento #${acc.code} — ${acc.description}`,
              cashRegisterId,
              accountId: acc.id,
              userId: user.id,
            },
          });
        }
        if (!accounts.length) throw new UserError("Contas não encontradas.");
      },
      { timeout: 30000 },
    );
    return `${selected.length} conta(s) paga(s) e baixada(s) no caixa.`;
  });
}

/* ---------- caixa ---------- */

export async function criarCaixa(formData: FormData) {
  await run("/caixa", "/caixa", async () => {
    const user = await requirePermission("CAIXA");
    const name = String(formData.get("name") ?? "").trim();
    const opening = parseMoney(String(formData.get("opening") ?? ""));
    if (name.length < 2) throw new UserError("Informe o nome do caixa.");
    if (await prisma.cashRegister.findUnique({ where: { name } })) throw new UserError("Já existe um caixa com esse nome.");
    await prisma.cashRegister.create({
      data: {
        name,
        balance: opening,
        movements: opening > 0 ? { create: { type: "ENTRADA", amount: opening, description: "Saldo inicial", userId: user.id } } : undefined,
      },
    });
    return `Caixa "${name}" criado.`;
  });
}

export async function movimentarCaixa(formData: FormData) {
  const back = `/caixa?id=${encodeURIComponent(String(formData.get("cashRegisterId") ?? ""))}`;
  await run(back, back, async () => {
    const user = await requirePermission("CAIXA");
    const cashRegisterId = String(formData.get("cashRegisterId") ?? "");
    const type = formData.get("type") === "SAIDA" ? "SAIDA" : "ENTRADA";
    const amount = parseMoney(String(formData.get("amount") ?? ""));
    const description = String(formData.get("description") ?? "").trim();
    if (!(amount > 0)) throw new UserError("Informe um valor válido.");
    if (description.length < 3) throw new UserError("Informe a descrição da movimentação.");

    await prisma.$transaction(async (tx) => {
      const res = await tx.cashRegister.updateMany({
        where: { id: cashRegisterId, active: true, ...(type === "SAIDA" ? { balance: { gte: amount } } : {}) },
        data: { balance: type === "SAIDA" ? { decrement: amount } : { increment: amount } },
      });
      if (res.count !== 1) throw new UserError(type === "SAIDA" ? "Saldo insuficiente." : "Caixa não encontrado.");
      await tx.cashMovement.create({ data: { type, amount, description, cashRegisterId, userId: user.id } });
    });
    return type === "SAIDA" ? "Saída registrada." : "Entrada registrada.";
  });
}

/* ---------- usuários ---------- */

export async function criarUsuario(formData: FormData) {
  await run("/usuarios", "/usuarios", async () => {
    await requirePermission("ADMIN");
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (name.length < 2 || !email.includes("@")) throw new UserError("Informe nome e e-mail válidos.");
    if (password.length < 8) throw new UserError("A senha precisa ter ao menos 8 caracteres.");
    if (await prisma.user.findUnique({ where: { email } })) throw new UserError("Já existe um usuário com esse e-mail.");
    await prisma.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10), permissions: perms(formData) },
    });
    return `Usuário ${name} criado.`;
  });
}

export async function atualizarUsuario(formData: FormData) {
  await run("/usuarios", "/usuarios", async () => {
    const admin = await requirePermission("ADMIN");
    const id = String(formData.get("userId"));
    const permissions = perms(formData);
    const active = formData.get("active") === "on";
    const password = String(formData.get("password") ?? "");
    if (id === admin.id && (!active || !permissions.includes("ADMIN")))
      throw new UserError("Você não pode remover seu próprio acesso de administrador.");
    if (password && password.length < 8) throw new UserError("A nova senha precisa ter ao menos 8 caracteres.");
    await prisma.user.update({
      where: { id },
      data: { permissions, active, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    });
    return "Usuário atualizado.";
  });
}

/* ---------- fornecedores ---------- */

/** Cria ou atualiza um fornecedor (campo "id" vazio = novo). CNPJ/CPF, CEP e telefones são gravados só com dígitos. */
export async function salvarFornecedor(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const campo = (k: string) => String(formData.get(k) ?? "").trim();
  const name = campo("name").replace(/\s+/g, " ");
  // Cadastro aberto em outra aba pelo lançamento de contas: ao salvar, vai para a página que avisa a aba de origem.
  const ref = formData.get("ref");
  const origem = !id && refValida(ref) ? ref : null;
  const form = id ? `/fornecedores/${encodeURIComponent(id)}` : origem ? `/fornecedores/novo?ref=${origem}` : "/fornecedores/novo";
  // Inativo não pode ser usado no lançamento, então não é enviado para a aba de origem.
  const ok = origem && formData.get("active") === "on" ? urlCadastroSalvo("fornecedor", origem, name) : "/fornecedores";
  await run(form, ok, async () => {
    await requirePermission("LANCAR");
    const personType: TipoPessoa = campo("personType") === "CPF" ? "CPF" : "CNPJ";
    const document = soDigitos(campo("document"));
    const zipCode = soDigitos(campo("zipCode"));
    const state = campo("state").toUpperCase();
    const telefones = {
      phoneCompany: soDigitos(campo("phoneCompany")),
      phoneFinance: soDigitos(campo("phoneFinance")),
      phoneCommercial: soDigitos(campo("phoneCommercial")),
    };

    if (!documentoValido(personType, document)) throw new UserError(`${personType} inválido.`);
    if (name.length < 2) throw new UserError(personType === "CPF" ? "Informe o nome." : "Informe a empresa.");
    if (zipCode && zipCode.length !== 8) throw new UserError("CEP inválido.");
    if (state && !(UFS as readonly string[]).includes(state)) throw new UserError("UF inválida.");
    const rotulos = { phoneCompany: "Contato empresa", phoneFinance: "Contato financeiro", phoneCommercial: "Contato comercial" };
    for (const [k, v] of Object.entries(telefones))
      if (!telefoneValido(v)) throw new UserError(`${rotulos[k as keyof typeof rotulos]}: informe DDD + número.`);

    const mesmoDoc = await prisma.supplier.findFirst({ where: { document, id: { not: id || undefined } }, select: { name: true } });
    if (mesmoDoc) throw new UserError(`Este ${personType} já está cadastrado para "${mesmoDoc.name}".`);
    const mesmoNome = await prisma.supplier.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: id || undefined } }, select: { id: true } });
    if (mesmoNome) throw new UserError(`Já existe um fornecedor chamado "${name}".`);

    const data = {
      personType,
      document,
      name,
      active: formData.get("active") === "on",
      zipCode: zipCode || null,
      state: state || null,
      city: campo("city") || null,
      address: campo("address") || null,
      number: campo("number") || null,
      district: campo("district") || null,
      phoneCompany: telefones.phoneCompany || null,
      phoneFinance: telefones.phoneFinance || null,
      phoneCommercial: telefones.phoneCommercial || null,
    };
    if (id) {
      const res = await prisma.supplier.updateMany({ where: { id }, data });
      if (!res.count) throw new UserError("Fornecedor não encontrado.");
      return `Fornecedor "${name}" atualizado.`;
    }
    await prisma.supplier.create({ data });
    return `Fornecedor "${name}" cadastrado.`;
  });
}

/* ---------- categorias ---------- */

/** Cria ou atualiza uma categoria (campo "id" vazio = nova). */
export async function salvarCategoria(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const active = formData.get("active") === "on";
  // Cadastro aberto em outra aba pelo lançamento de contas: ao salvar, vai para a página que avisa a aba de origem.
  const ref = formData.get("ref");
  const origem = !id && refValida(ref) ? ref : null;
  const form = origem ? `/categorias/nova?ref=${origem}` : "/categorias";
  const ok = origem && active ? urlCadastroSalvo("categoria", origem, name) : "/categorias";
  await run(form, ok, async () => {
    await requirePermission("LANCAR");
    if (name.length < 2) throw new UserError("Informe o nome da categoria.");
    if (name.length > 100) throw new UserError("Nome da categoria: no máximo 100 caracteres.");
    const mesmoNome = await prisma.category.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, id: { not: id || undefined } },
      select: { id: true },
    });
    if (mesmoNome) throw new UserError(`Já existe uma categoria chamada "${name}".`);
    if (id) {
      const res = await prisma.category.updateMany({ where: { id }, data: { name, active } });
      if (!res.count) throw new UserError("Categoria não encontrada.");
      return `Categoria "${name}" atualizada.`;
    }
    await prisma.category.create({ data: { name, active } });
    return `Categoria "${name}" cadastrada.`;
  });
}

/* ---------- observações adicionais ---------- */

/** Grava mais uma observação numa conta aprovada (tela Pagamentos). Fica registrado quem gravou e quando. */
export async function adicionarObservacao(formData: FormData) {
  await run("/pagamentos", "/pagamentos", async () => {
    const user = await requirePermission("PAGAR");
    const texto = String(formData.get("texto") ?? "").trim();
    if (texto.length < 3) throw new UserError("Escreva a observação (mínimo 3 caracteres).");
    if (texto.length > 1000) throw new UserError("Observação: no máximo 1000 caracteres.");
    const acc = await prisma.account.findUnique({ where: { id: String(formData.get("id")) }, select: { id: true, code: true, status: true } });
    if (!acc) throw new UserError("Conta não encontrada.");
    if (acc.status !== "APROVADA") throw new UserError(`Conta #${acc.code} não está mais aguardando pagamento.`);
    await prisma.accountNote.create({ data: { accountId: acc.id, userId: user.id, text: texto } });
    return `Observação gravada na conta #${acc.code}.`;
  });
}
