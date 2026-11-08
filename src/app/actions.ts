"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
import { comPdfsNoS3, enviarAvatar, excluirPdfs, removerPdfs, type TipoAvatar } from "@/lib/storage";
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

/* ---------- minha conta (menu do avatar) ---------- */

/** Resultado das ações chamadas pelo menu do avatar: o próprio componente mostra o toast. */
export type Resultado = { ok?: string; erro?: string };

async function resultado(fn: () => Promise<string>): Promise<Resultado> {
  try {
    return { ok: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { erro: e.message };
    throw e;
  }
}

export async function alterarSenha(formData: FormData): Promise<Resultado> {
  return resultado(async () => {
    const user = await requireUser();
    const atual = String(formData.get("atual") ?? "");
    const nova = String(formData.get("nova") ?? "");
    const confirmacao = String(formData.get("confirmacao") ?? "");
    if (!(await bcrypt.compare(atual, user.passwordHash))) throw new UserError("A senha atual está incorreta.");
    if (nova.length < 6) throw new UserError("A nova senha precisa ter ao menos 6 caracteres.");
    if (nova !== confirmacao) throw new UserError("A confirmação não confere com a nova senha.");
    if (nova === atual) throw new UserError("A nova senha precisa ser diferente da atual.");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(nova, 10) } });
    return "Senha alterada com sucesso.";
  });
}

const MAX_AVATAR_MB = 2;

/** Identifica JPEG/PNG/WebP pelos primeiros bytes (não confia no tipo informado pelo navegador). */
function tipoDaImagem(b: Buffer): TipoAvatar | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export async function alterarFoto(formData: FormData): Promise<Resultado> {
  const r = await resultado(async () => {
    const user = await requireUser();
    const f = formData.get("foto");
    if (!(f instanceof File) || f.size === 0) throw new UserError("Escolha uma foto.");
    if (f.size > MAX_AVATAR_MB * 1024 * 1024) throw new UserError(`A foto passa de ${MAX_AVATAR_MB} MB.`);
    const data = Buffer.from(await f.arrayBuffer());
    const tipo = tipoDaImagem(data);
    if (!tipo) throw new UserError("Formato não suportado. Use uma foto JPG, PNG ou WebP.");

    let key: string;
    try {
      key = await enviarAvatar(data, tipo);
    } catch (e) {
      console.error("Falha ao enviar avatar ao S3:", e);
      throw new UserError("Não foi possível salvar a foto agora. Tente novamente.");
    }
    try {
      await prisma.user.update({ where: { id: user.id }, data: { avatarKey: key } });
    } catch (e) {
      await removerPdfs([key]);
      throw e;
    }
    await removerPdfs([user.avatarKey]); // foto anterior
    return "Foto atualizada.";
  });
  if (r.ok) revalidatePath("/", "layout");
  return r;
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

/**
 * Fornecedores e categorias só são criados pelos próprios formulários de cadastro.
 * Aqui apenas localiza os já cadastrados (sem diferenciar maiúsculas) e devolve nome digitado → id.
 * Nome inexistente ou cadastro inativo gera erro.
 */
async function buscarCadastros(fornecedores: string[], categorias: string[]) {
  const unicos = (l: string[]) => [...new Set(l)];
  const porNome = (l: string[]) => ({ OR: unicos(l).map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) });
  const [forns, cats] = await Promise.all([
    fornecedores.length ? prisma.supplier.findMany({ where: porNome(fornecedores), select: { id: true, name: true, active: true } }) : [],
    categorias.length ? prisma.category.findMany({ where: porNome(categorias), select: { id: true, name: true, active: true } }) : [],
  ]);
  const mapa = (nomes: string[], achados: { id: string; name: string; active: boolean }[], tipo: "fornecedor" | "categoria") => {
    const m = new Map<string, { id: string; name: string }>();
    for (const nome of unicos(nomes)) {
      const c = achados.find((a) => a.name === nome) ?? achados.find((a) => a.name.toLowerCase() === nome.toLowerCase());
      if (!c)
        throw new UserError(
          tipo === "fornecedor"
            ? `O fornecedor "${nome}" não está cadastrado. Cadastre-o em Fornecedores (botão "+") antes de lançar.`
            : `A categoria "${nome}" não está cadastrada. Cadastre-a em Categorias (botão "+") antes de lançar.`,
        );
      if (!c.active) throw new UserError(`${tipo === "fornecedor" ? "O fornecedor" : "A categoria"} "${c.name}" está inativ${tipo === "fornecedor" ? "o" : "a"} no cadastro.`);
      m.set(nome, { id: c.id, name: c.name });
    }
    return m;
  };
  return { fornecedores: mapa(fornecedores, forns, "fornecedor"), categorias: mapa(categorias, cats, "categoria") };
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
    const cadastros = await buscarCadastros(rows.map((r) => r.supplier), rows.map((r) => r.category));
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
          await tx.account.create({
            data: {
              description: r.description,
              supplierId: cadastros.fornecedores.get(r.supplier)!.id,
              categoryId: cadastros.categorias.get(r.category)!.id,
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
    // O que não mudou fica como está (mesmo que o cadastro tenha sido inativado depois); o que mudou precisa estar cadastrado e ativo.
    const mudouForn = r.supplier !== acc.supplier.name;
    const mudouCat = !acc.category || r.category !== acc.category.name;
    const cadastros = await buscarCadastros(mudouForn ? [r.supplier] : [], mudouCat ? [r.category] : []);
    const supplier = mudouForn ? cadastros.fornecedores.get(r.supplier)! : { id: acc.supplierId, name: acc.supplier.name };
    const category = mudouCat || !acc.category ? cadastros.categorias.get(r.category)! : { id: acc.category.id, name: acc.category.name };

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
    comparar("Fornecedor", acc.supplier.name, supplier.name);
    comparar("Categoria", acc.category?.name ?? "", category.name);
    comparar("Valor", brl(acc.amount), brl(amount));
    comparar("Vencimento", dateBR(acc.dueDate), dateBR(dueDate));
    comparar("Observações", acc.notes ?? "", r.notes ?? "");
    for (const a of acc.attachments.filter((a) => remover.includes(a.id)))
      mudancas.push({ campo: `${TIPOS_ANEXO[a.kind].label} (removido)`, de: a.fileName, para: "" });
    for (const a of novos) mudancas.push({ campo: `${TIPOS_ANEXO[a.kind].label} (incluído)`, de: "", para: a.fileName });
    if (!mudancas.length) throw new UserError("Nenhuma alteração feita.");

    await comPdfsNoS3(novos, (enviados) => prisma.$transaction(async (tx) => {
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
    if (password.length < 6) throw new UserError("A senha precisa ter ao menos 6 caracteres.");
    if (await prisma.user.findUnique({ where: { email } })) throw new UserError("Já existe um usuário com esse e-mail.");
    await prisma.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10), permissions: perms(formData) },
    });
    return `Usuário ${name} criado.`;
  });
}

export async function atualizarUsuario(formData: FormData) {
  const id = String(formData.get("userId"));
  // salvo/t: a tela mostra o resultado no card do usuário e limpa o campo de senha (t muda a cada envio).
  const volta = `/usuarios?salvo=${encodeURIComponent(id)}&t=${Date.now()}`;
  await run(volta, volta, async () => {
    const admin = await requirePermission("ADMIN");
    const permissions = perms(formData);
    const active = formData.get("active") === "on";
    const password = String(formData.get("password") ?? "");
    if (id === admin.id && (!active || !permissions.includes("ADMIN")))
      throw new UserError("Você não pode remover seu próprio acesso de administrador.");
    if (password && password.length < 6) throw new UserError("A nova senha precisa ter ao menos 6 caracteres.");
    const u = await prisma.user.update({
      where: { id },
      data: { permissions, active, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      select: { name: true },
    });
    return `Usuário ${u.name} atualizado com sucesso${password ? " (senha alterada)" : ""}.`;
  });
}

/* ---------- fornecedores ---------- */

/** Valida e grava um fornecedor (campo "id" vazio = novo). CNPJ/CPF, CEP e telefones são gravados só com dígitos. */
async function gravarFornecedor(formData: FormData, forcarAtivo = false) {
  await requirePermission("LANCAR");
  const id = String(formData.get("id") ?? "");
  const campo = (k: string) => String(formData.get(k) ?? "").trim();
  const name = campo("name").replace(/\s+/g, " ");
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
    active: forcarAtivo || formData.get("active") === "on",
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
    return { nome: name, msg: `Fornecedor "${name}" atualizado.` };
  }
  await prisma.supplier.create({ data });
  return { nome: name, msg: `Fornecedor "${name}" cadastrado.` };
}

/** Tela de fornecedores: grava e volta para a lista (ou para o formulário, com o erro). */
export async function salvarFornecedor(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const form = id ? `/fornecedores/${encodeURIComponent(id)}` : "/fornecedores/novo";
  await run(form, "/fornecedores", async () => (await gravarFornecedor(formData)).msg);
}

/* ---------- categorias ---------- */

/** Valida e grava uma categoria (campo "id" vazio = nova). */
async function gravarCategoria(formData: FormData, forcarAtivo = false) {
  await requirePermission("LANCAR");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const active = forcarAtivo || formData.get("active") === "on";
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
    return { nome: name, msg: `Categoria "${name}" atualizada.` };
  }
  await prisma.category.create({ data: { name, active } });
  return { nome: name, msg: `Categoria "${name}" cadastrada.` };
}

/** Tela de categorias: grava e volta para a lista (ou para o formulário, com o erro). */
export async function salvarCategoria(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  // Salvo pela própria lista: volta com a mesma aba e busca (?situacao=&q=), para a lista não sumir.
  let volta: string | null = null;
  try {
    const ref = new URL(headers().get("referer") ?? "");
    if (ref.pathname === "/categorias") {
      ref.searchParams.delete("ok");
      ref.searchParams.delete("erro");
      volta = `/categorias?${ref.searchParams.toString()}`;
    }
  } catch {}
  await run(volta ?? (id ? "/categorias" : "/categorias/nova"), volta ?? "/categorias", async () => (await gravarCategoria(formData)).msg);
}

/* ---------- cadastro rápido (modal no lançamento de contas) ---------- */

export type ResultadoCadastro = { ok: true; nome: string } | { ok: false; erro: string };

/** Cadastra (sempre ativo, para já poder ser usado) sem sair da página; devolve o nome ou o erro. */
async function cadastroRapido(gravar: () => Promise<{ nome: string }>): Promise<ResultadoCadastro> {
  try {
    const { nome } = await gravar();
    revalidatePath("/", "layout");
    return { ok: true, nome };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, erro: e.message };
    throw e;
  }
}

export async function cadastrarFornecedorRapido(formData: FormData) {
  formData.delete("id");
  return cadastroRapido(() => gravarFornecedor(formData, true));
}

export async function cadastrarCategoriaRapido(formData: FormData) {
  formData.delete("id");
  return cadastroRapido(() => gravarCategoria(formData, true));
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
