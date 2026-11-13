"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma, type AccountStatus, type AttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSession, destroySession, requirePermission, requireUser, can } from "@/lib/auth";
import { run } from "@/lib/action";
import { UserError } from "@/lib/errors";
import { PERMISSIONS, type PermissionName } from "@/lib/permissions";
import { TODAS_TELAS } from "@/lib/telas";
import { brl, dateBR, ehPix, lerParcelas, parseMoney, type AlteracaoConta, type ParcelaConta } from "@/lib/format";
import { MAX_ANEXOS, MAX_PDF_BYTES, MAX_PDF_MB, podeAnexar, TIPOS_ANEXO, type TipoAnexo } from "@/lib/anexos";
import { comPdfsNoS3, copiarPdf, enviarAvatar, excluirPdfs, removerPdfs, type TipoAvatar } from "@/lib/storage";
import { documentoValido, soDigitos, telefoneValido, UFS, type TipoPessoa } from "@/lib/documentos";

const ids = (fd: FormData) => fd.getAll("ids").map(String);
const perms = (fd: FormData) =>
  fd.getAll("permissions").map(String).filter((p): p is PermissionName => (PERMISSIONS as readonly string[]).includes(p));
/** Telas e abas marcadas no formulário de usuário (só chaves conhecidas). */
const telas = (fd: FormData) => fd.getAll("telas").map(String).filter((t) => TODAS_TELAS.includes(t));

/* ---------- sessão ---------- */

export async function login(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  const password = String(formData.get("password") ?? "");
  // Nome não é único no banco: testa a senha em cada usuário ativo com esse nome (sem diferenciar maiúsculas).
  const candidatos = nome
    ? await prisma.user.findMany({ where: { name: { equals: nome, mode: "insensitive" }, active: true } })
    : [];
  let user: (typeof candidatos)[number] | undefined;
  for (const c of candidatos) {
    if (await bcrypt.compare(password, c.passwordHash)) { user = c; break; }
  }
  if (!user) redirect("/login?erro=" + encodeURIComponent("Usuário ou senha incorretos."));
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

const MAX_PARCELAS = 60;

const rowSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição."),
  supplier: z.string().trim().min(2, "Informe o fornecedor."),
  category: z.string().trim().min(2, "Informe a categoria."),
  paymentMethod: z.string().trim().min(2, "Informe a forma de pagamento."),
  pixKey: z.string().trim().max(150, "Chave Pix: no máximo 150 caracteres.").optional(),
  amount: z.string(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  notes: z.string().trim().max(1000, "Observações: no máximo 1000 caracteres.").optional(),
  /** Parcelamento: quando há 2 ou mais parcelas, cada uma vira uma conta separada ("Descrição (1/3)"). */
  parcelas: z
    .array(z.object({ amount: z.string(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento de cada parcela.") }))
    .max(MAX_PARCELAS, `No máximo ${MAX_PARCELAS} parcelas.`)
    .optional(),
});

/** Chave Pix é obrigatória quando a forma de pagamento é Pix; nas outras formas é descartada. */
function chavePix(forma: string, pixKey: string | undefined, prefixo = "") {
  if (!ehPix(forma)) return null;
  if (!pixKey || pixKey.length < 3) throw new UserError(`${prefixo}Informe a chave Pix.`);
  return pixKey;
}

/**
 * Fornecedores, categorias e formas de pagamento só são criados pelos próprios formulários de cadastro.
 * Aqui apenas localiza os já cadastrados (sem diferenciar maiúsculas) e devolve nome digitado → id.
 * Nome inexistente ou cadastro inativo gera erro.
 */
async function buscarCadastros(fornecedores: string[], categorias: string[], formas: string[] = []) {
  const unicos = (l: string[]) => [...new Set(l)];
  const porNome = (l: string[]) => ({ OR: unicos(l).map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) });
  const select = { id: true, name: true, active: true };
  const [forns, cats, fps] = await Promise.all([
    fornecedores.length ? prisma.supplier.findMany({ where: porNome(fornecedores), select }) : [],
    categorias.length ? prisma.category.findMany({ where: porNome(categorias), select }) : [],
    formas.length ? prisma.paymentMethod.findMany({ where: porNome(formas), select }) : [],
  ]);
  const textos = {
    fornecedor: { naoCadastrado: (n: string) => `O fornecedor "${n}" não está cadastrado. Cadastre-o em Fornecedores (botão "+") antes de lançar.`, inativo: "O fornecedor", genero: "o" },
    categoria: { naoCadastrado: (n: string) => `A categoria "${n}" não está cadastrada. Cadastre-a em Categorias (botão "+") antes de lançar.`, inativo: "A categoria", genero: "a" },
    forma: { naoCadastrado: (n: string) => `A forma de pagamento "${n}" não está cadastrada. Cadastre-a em Formas de pagamento antes de lançar.`, inativo: "A forma de pagamento", genero: "a" },
  };
  const mapa = (nomes: string[], achados: { id: string; name: string; active: boolean }[], tipo: keyof typeof textos) => {
    const t = textos[tipo];
    const m = new Map<string, { id: string; name: string }>();
    for (const nome of unicos(nomes)) {
      const c = achados.find((a) => a.name === nome) ?? achados.find((a) => a.name.toLowerCase() === nome.toLowerCase());
      if (!c) throw new UserError(t.naoCadastrado(nome));
      if (!c.active) throw new UserError(`${t.inativo} "${c.name}" está inativ${t.genero} no cadastro.`);
      m.set(nome, { id: c.id, name: c.name });
    }
    return m;
  };
  return {
    fornecedores: mapa(fornecedores, forns, "fornecedor"),
    categorias: mapa(categorias, cats, "categoria"),
    formas: mapa(formas, fps, "forma"),
  };
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

/** Tipo real do arquivo pela assinatura (primeiros bytes): PDF, JPG ou PNG. */
function tipoDoArquivo(data: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

/** Lê os anexos enviados num campo do formulário, validando quantidade, tamanho e tipo (PDF, JPG ou PNG). */
async function lerPdfs(formData: FormData, field: string, kind: AttachmentKind, label: string, max = MAX_ANEXOS) {
  const files = formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > max) throw new UserError(`${label}: no máximo ${max} arquivo(s).`);
  return Promise.all(
    files.map(async (f) => {
      if (f.size > MAX_PDF_BYTES) throw new UserError(`${label}: "${f.name}" passa de ${MAX_PDF_MB} MB.`);
      const data = Buffer.from(await f.arrayBuffer());
      const contentType = tipoDoArquivo(data);
      if (!contentType) throw new UserError(`${label}: "${f.name}" não é PDF, JPG ou PNG.`);
      return { kind, fileName: f.name.slice(0, 200), size: f.size, contentType, data };
    }),
  );
}

export async function lancarContas(formData: FormData) {
  // Volta para a tela de onde o modal "Lançar contas" foi aberto (Ordens de compra ou Contas).
  const v = String(formData.get("volta") ?? "");
  const volta = v === "/ordens" || v.startsWith("/ordens?") || v === "/contas" || v.startsWith("/contas?") ? v : "/ordens";
  await run(volta, volta, async () => {
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
    const rows = parsed.data.map((r, i) => {
      const amount = parseMoney(r.amount);
      if (!(amount > 0)) throw new UserError(`Linha ${i + 1}: valor inválido.`);
      const pixKey = chavePix(r.paymentMethod, r.pixKey, `Linha ${i + 1}: `);
      // Sem parcelamento (ou com 1 parcela) a conta usa o valor e o vencimento da própria linha.
      if (!r.parcelas || r.parcelas.length < 2) return { ...r, amount, pixKey, parcelas: null };
      // Parcelada: vai para aprovação como uma conta só (valor total, vencimento da 1ª parcela);
      // na aprovação é desmembrada em uma conta por parcela.
      const parcelas: ParcelaConta[] = r.parcelas.map((p, k) => {
        const valor = parseMoney(p.amount);
        if (!(valor > 0)) throw new UserError(`Linha ${i + 1}: valor inválido na parcela ${k + 1}.`);
        return { amount: valor, dueDate: p.dueDate };
      });
      const soma = parcelas.reduce((s, p) => s + Math.round(p.amount * 100), 0);
      if (soma !== Math.round(amount * 100))
        throw new UserError(`Linha ${i + 1}: a soma das parcelas (${brl(soma / 100)}) difere do valor da conta (${brl(amount)}).`);
      return { ...r, amount, pixKey, dueDate: parcelas[0].dueDate, parcelas };
    });
    const cadastros = await buscarCadastros(rows.map((r) => r.supplier), rows.map((r) => r.category), rows.map((r) => r.paymentMethod));
    const pdfs = (
      await Promise.all(
        rows.map(async (_, i) =>
          [
            ...(await lerPdfs(formData, `pedido_${i}`, "PEDIDO", `Linha ${i + 1}, Pedido`)),
            ...(await lerPdfs(formData, `nota_${i}`, "NOTA_FISCAL", `Linha ${i + 1}, Nota fiscal`)),
            // No máximo um boleto por parcela.
            ...(await lerPdfs(formData, `boleto_${i}`, "BOLETO", `Linha ${i + 1}, Boletos (um por parcela)`, rows[i].parcelas?.length ?? 1)),
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
              paymentMethodId: cadastros.formas.get(r.paymentMethod)!.id,
              pixKey: r.pixKey,
              amount: r.amount,
              dueDate: new Date(r.dueDate + "T00:00:00.000Z"),
              notes: r.notes || null,
              parcelas: r.parcelas ?? undefined,
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
  const volta = telaAprovacao(formData, "/contas", "voltaTela");
  await run(volta, volta, async () => {
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

/**
 * Exclui uma parcela/conta aprovada (ainda não paga): sai de Aprovadas e Pagamentos e vai para Canceladas,
 * mantendo o histórico. O boleto é apagado do S3 (último passo da transação: se o S3 falhar, nada muda).
 * Quem lança, quem aprova ou o administrador.
 */
export async function excluirAprovada(formData: FormData) {
  const volta = telaAprovacao(formData, "/contas?status=APROVADA", "voltaTela");
  await run(volta, volta, async () => {
    const user = await requireUser();
    const acc = await prisma.account.findUnique({
      where: { id: String(formData.get("id")) },
      include: { attachments: { where: { kind: "BOLETO" }, select: { id: true, storageKey: true } } },
    });
    if (!acc) throw new UserError("Conta não encontrada.");
    if (!can(user, "ADMIN") && !can(user, "LANCAR") && !can(user, "APROVAR")) throw new UserError("Você não tem permissão para excluir contas aprovadas.");
    let ultima = false;
    let notasApagadas = 0;
    await prisma.$transaction(async (tx) => {
      const res = await tx.account.updateMany({
        where: { id: acc.id, status: "APROVADA" },
        data: { status: "CANCELADA", canceledById: user.id, canceledAt: new Date(), cancelReason: "Excluída em Aprovadas." },
      });
      if (!res.count) throw new UserError(`Conta #${acc.code} não está mais aprovada (pode já ter sido paga) e não pode ser excluída.`);

      // Se era a última parcela da conta (nenhuma outra aguardando, aprovada ou paga), a nota fiscal também é apagada:
      // a original (1ª parcela) e as cópias que as parcelas receberam na aprovação.
      const grupo = acc.parcelamentoId ?? acc.id;
      const restantes = await tx.account.count({
        where: { OR: [{ id: grupo }, { parcelamentoId: grupo }], id: { not: acc.id }, status: { not: "CANCELADA" } },
      });
      const notas = restantes
        ? []
        : await tx.attachment.findMany({
            where: { kind: "NOTA_FISCAL", account: { OR: [{ id: grupo }, { parcelamentoId: grupo }] } },
            select: { id: true, storageKey: true },
          });
      ultima = !restantes;
      notasApagadas = notas.length;

      const apagar = [...acc.attachments, ...notas];
      await tx.attachment.deleteMany({ where: { id: { in: apagar.map((a) => a.id) } } });
      // Por último: exclui no S3 e só então a transação confirma no banco.
      await excluirDoS3(apagar.map((a) => a.storageKey));
    }, { timeout: 30000 });
    const apagados = [acc.attachments.length ? "boleto" : "", notasApagadas ? "nota fiscal" : ""].filter(Boolean);
    return `Conta #${acc.code} excluída${apagados.length ? ` (${apagados.join(" e ")} apagado${apagados.length > 1 ? "s" : ""})` : ""}.` +
      (ultima && acc.parcelamentoId ? " Era a última parcela da conta." : "");
  });
}

/** Cancela uma conta pendente na tela de aprovações, exigindo motivo. */
export async function cancelarAprovacao(formData: FormData) {
  const volta = telaAprovacao(formData, "/contas?status=PENDENTE", "voltaTela");
  await run(volta, volta, async () => {
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
  regras: {
    podeAlterar: (k: TipoAnexo) => boolean;
    podeRemover: boolean;
    negado: (k: TipoAnexo) => string;
    /** Limite por tipo quando diferente de MAX_ANEXOS (ex.: boletos = quantidade de parcelas). */
    limites?: Partial<Record<TipoAnexo, number>>;
  },
) {
  const remover = formData.getAll("remover").map(String).filter((id) => existentes.some((a) => a.id === id));
  if (remover.length && !regras.podeRemover) throw new UserError(regras.negado(existentes.find((a) => a.id === remover[0])!.kind));
  const novos = [];
  for (const kind of Object.keys(TIPOS_ANEXO) as TipoAnexo[]) {
    const { label, campo } = TIPOS_ANEXO[kind];
    const limite = regras.limites?.[kind] ?? MAX_ANEXOS;
    const files = await lerPdfs(formData, campo, kind, label);
    if (files.length && !regras.podeAlterar(kind)) throw new UserError(regras.negado(kind));
    const ficam = existentes.filter((a) => a.kind === kind && !remover.includes(a.id)).length;
    // Só barra quando há arquivos novos do tipo: contas antigas acima do limite continuam podendo receber outros anexos.
    if (files.length && ficam + files.length > limite) {
      throw new UserError(
        kind === "BOLETO" && regras.limites?.BOLETO !== undefined
          ? `${label}: no máximo um boleto por parcela (${limite}).`
          : `${label}: no máximo ${limite} arquivo(s) por conta.`,
      );
    }
    novos.push(...files);
  }
  return { remover, novos };
}

/**
 * Edita uma conta aguardando aprovação ou rejeitada: dados e anexos (pedido e boletos). Só quem lançou ou o administrador.
 * Nas rejeitadas, cada alteração fica registrada (AccountEdit) para quem for aprovar ver o que mudou.
 */
export async function editarConta(formData: FormData) {
  const v = formData.get("volta");
  const volta = telaAprovacao(formData, v === "REJEITADA" ? "/contas?status=REJEITADA" : v === "APROVADA" ? "/contas?status=APROVADA" : "/contas?status=PENDENTE", "voltaTela");
  await run(volta, volta, async () => {
    const user = await requireUser();
    const acc = await prisma.account.findUnique({
      where: { id: String(formData.get("id")) },
      include: { supplier: true, category: true, paymentMethod: true, attachments: { select: { id: true, kind: true, fileName: true, storageKey: true } } },
    });
    if (!acc) throw new UserError("Conta não encontrada.");
    // Aprovada: quem lança, quem aprova ou o administrador. Aguardando/rejeitada: só quem lançou ou o administrador.
    if (acc.status === "APROVADA") {
      if (!can(user, "ADMIN") && !can(user, "LANCAR") && !can(user, "APROVAR")) throw new UserError("Você não tem permissão para editar contas aprovadas.");
    } else if (acc.createdById !== user.id && !can(user, "ADMIN")) throw new UserError("Só quem lançou (ou o administrador) pode editar a conta.");
    const naoEditavel = `Conta #${acc.code} já foi paga ou cancelada e não pode ser editada.`;
    if (acc.status !== "PENDENTE" && acc.status !== "REJEITADA" && acc.status !== "APROVADA") throw new UserError(naoEditavel);
    const status = acc.status;
    // Aprovada (parcela ou conta): edita só os dados; parcelamento e anexos não mudam por aqui.
    const aprovada = status === "APROVADA";

    const parsed = rowSchema.safeParse({
      description: formData.get("description") ?? "",
      supplier: formData.get("supplier") ?? "",
      category: formData.get("category") ?? "",
      paymentMethod: formData.get("paymentMethod") ?? "",
      pixKey: formData.get("pixKey") ?? "",
      amount: formData.get("amount") ?? "",
      dueDate: formData.get("dueDate") ?? "",
      notes: formData.get("notes") ?? "",
      parcelas: (() => {
        const v = formData.get("parcelas");
        try {
          return v ? JSON.parse(String(v)) : undefined;
        } catch {
          throw new UserError("Parcelas inválidas.");
        }
      })(),
    });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    const r = parsed.data;
    const amount = parseMoney(r.amount);
    if (!(amount > 0)) throw new UserError("Informe um valor válido.");
    // Parcelas editadas no modal (com 2 ou mais a conta fica parcelada; com 1 deixa de ser).
    const parcelas: ParcelaConta[] =
      !aprovada && r.parcelas && r.parcelas.length >= 2
        ? r.parcelas.map((p, k) => {
            const valor = parseMoney(p.amount);
            if (!(valor > 0)) throw new UserError(`Valor inválido na parcela ${k + 1}.`);
            return { amount: valor, dueDate: p.dueDate };
          })
        : [];
    if (parcelas.length) {
      const soma = parcelas.reduce((s, p) => s + Math.round(p.amount * 100), 0);
      if (soma !== Math.round(amount * 100))
        throw new UserError(`A soma das parcelas (${brl(soma / 100)}) difere do valor da conta (${brl(amount)}).`);
      r.dueDate = parcelas[0].dueDate;
    }
    // O que não mudou fica como está (mesmo que o cadastro tenha sido inativado depois); o que mudou precisa estar cadastrado e ativo.
    const mudouForn = r.supplier !== acc.supplier.name;
    const mudouCat = !acc.category || r.category !== acc.category.name;
    const mudouForma = !acc.paymentMethod || r.paymentMethod !== acc.paymentMethod.name;
    const cadastros = await buscarCadastros(mudouForn ? [r.supplier] : [], mudouCat ? [r.category] : [], mudouForma ? [r.paymentMethod] : []);
    const supplier = mudouForn ? cadastros.fornecedores.get(r.supplier)! : { id: acc.supplierId, name: acc.supplier.name };
    const category = mudouCat || !acc.category ? cadastros.categorias.get(r.category)! : { id: acc.category.id, name: acc.category.name };
    const forma = mudouForma || !acc.paymentMethod ? cadastros.formas.get(r.paymentMethod)! : { id: acc.paymentMethod.id, name: acc.paymentMethod.name };
    const pixKey = chavePix(forma.name, r.pixKey);

    const { remover, novos } = aprovada
      ? { remover: [] as string[], novos: [] as Awaited<ReturnType<typeof lerPdfs>> }
      : await lerAlteracoesAnexos(formData, acc.attachments, {
          podeAlterar: (k) => k === "PEDIDO" || k === "BOLETO",
          podeRemover: true,
          negado: (k) =>
            k === "COMPROVANTE"
              ? "O comprovante de pagamento só pode ser anexado ao pagar a conta."
              : "A nota fiscal só pode ser anexada depois que a conta for aprovada.",
          limites: { BOLETO: Math.max(1, parcelas.length) },
        });
    // Antes da aprovação o limite vale sempre (inclusive ao diminuir as parcelas): um boleto por parcela.
    const qtdBoletos =
      acc.attachments.filter((a) => a.kind === "BOLETO" && !remover.includes(a.id)).length + novos.filter((a) => a.kind === "BOLETO").length;
    if (!aprovada && qtdBoletos > Math.max(1, parcelas.length))
      throw new UserError(`São ${qtdBoletos} boletos para ${Math.max(1, parcelas.length)} parcela(s): no máximo um boleto por parcela.`);

    // O que mudou, no formato exibido no histórico.
    const dueDate = new Date(r.dueDate + "T00:00:00.000Z");
    const parcelasAntes = lerParcelas(acc.parcelas);
    const textoParcelas = (l: ParcelaConta[]) => l.map((p, k) => `${k + 1}/${l.length} ${brl(p.amount)} em ${dateBR(new Date(p.dueDate + "T00:00:00.000Z"))}`).join("; ");
    const mudancas: AlteracaoConta[] = [];
    const comparar = (campo: string, de: string, para: string) => de !== para && mudancas.push({ campo, de, para });
    comparar("Descrição", acc.description, r.description);
    comparar("Fornecedor", acc.supplier.name, supplier.name);
    comparar("Categoria", acc.category?.name ?? "", category.name);
    comparar("Forma de pagamento", acc.paymentMethod?.name ?? "", forma.name);
    comparar("Chave Pix", acc.pixKey ?? "", pixKey ?? "");
    comparar("Valor", brl(acc.amount), brl(amount));
    comparar("Vencimento", dateBR(acc.dueDate), dateBR(dueDate));
    comparar("Parcelas", textoParcelas(parcelasAntes), textoParcelas(parcelas));
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
          paymentMethodId: forma.id,
          pixKey,
          amount,
          dueDate,
          notes: r.notes || null,
          parcelas: parcelas.length ? parcelas : Prisma.DbNull,
          // Rejeitada: ao salvar a correção, a conta volta automaticamente para aprovação.
          ...(status === "REJEITADA" ? { status: "PENDENTE" as const, reviewedById: null, reviewedAt: null, rejectionReason: null } : {}),
        },
      });
      if (!res.count) throw new UserError(naoEditavel);
      await tx.attachment.deleteMany({ where: { id: { in: remover }, accountId: acc.id } });
      if (enviados.length) await tx.attachment.createMany({ data: enviados.map((a) => ({ ...a, accountId: acc.id })) });
      if (status === "REJEITADA" || aprovada) await tx.accountEdit.create({ data: { accountId: acc.id, userId: user.id, changes: mudancas } });
      // Por último: exclui no S3 e só então a transação confirma a exclusão no banco.
      await excluirDoS3(acc.attachments.filter((a) => remover.includes(a.id)).map((a) => a.storageKey));
    }, { timeout: 30000 }));
    return status === "REJEITADA" ? `Conta #${acc.code} corrigida e reenviada para aprovação.` : `Conta #${acc.code} atualizada.`;
  });
}

/**
 * Anexos de uma conta aprovada ou paga (aba Contas).
 * Aprovada: quem lança pode adicionar nota fiscal e boletos; só o administrador mexe no pedido e remove arquivos.
 * Paga: só o administrador pode alterar.
 */
export async function gerenciarAnexos(formData: FormData) {
  const v = formData.get("volta");
  const volta = telaAprovacao(formData, v === "PAGAMENTOS" ? "/pagamentos" : v === "PAGA" ? "/contas?status=PAGA" : "/contas?status=APROVADA", "voltaTela");
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

    // Nota fiscal só na conta sem parcelamento ou na 1ª parcela (a conta original).
    const regra = { status: acc.status, admin, primeiraParcela: !acc.parcelamentoId || acc.parcelamentoId === acc.id };
    const { remover, novos } = await lerAlteracoesAnexos(formData, acc.attachments, {
      podeAlterar: (k) => podeAnexar(k, regra),
      podeRemover: admin,
      negado: (k) =>
        k === "PEDIDO"
          ? "O pedido não pode mais ser anexado depois da aprovação."
          : k === "NOTA_FISCAL"
            ? "A nota fiscal só pode ser anexada na 1ª parcela."
            : k === "COMPROVANTE"
              ? "O comprovante de pagamento é anexado ao pagar a conta."
              : "Só o administrador pode remover anexos.",
      // Depois de aprovada, cada conta é uma parcela: um boleto só.
      limites: { BOLETO: 1 },
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
  const volta = telaAprovacao(formData, "/contas?status=PENDENTE", "voltaTela");
  await run(volta, volta, async () => {
    const user = await requirePermission("APROVAR");
    const accounts = await prisma.account.findMany({
      where: { id: { in: ids(formData) }, status: "PENDENTE" },
      include: {
        attachments: { select: { id: true, kind: true, fileName: true, size: true, contentType: true, storageKey: true, data: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!accounts.length) throw new UserError("Selecione ao menos uma conta pendente.");
    if (!can(user, "ADMIN") && accounts.some((a) => a.createdById === user.id)) {
      throw new UserError("Você não pode aprovar contas que você mesmo lançou.");
    }

    // Contas parceladas são desmembradas: a própria conta vira a 1ª parcela e as demais viram contas novas, já aprovadas.
    // Boletos: o 1º fica na parcela 1/N, o 2º vai para a 2/N e assim por diante (o arquivo é movido, não copiado).
    // Pedido e nota fiscal: cada parcela recebe sua cópia (excluir o anexo de uma parcela não afeta as outras).
    const copias: string[] = [];
    try {
      type Anexo = { kind: AttachmentKind; fileName: string; size: number; contentType: string | null; storageKey: string | null; data: Buffer | null };
      const desmembrar: { a: (typeof accounts)[number]; parcelas: ParcelaConta[]; anexosPorParcela: Anexo[][]; boletos: string[] }[] = [];
      for (const a of accounts) {
        const parcelas = lerParcelas(a.parcelas);
        if (parcelas.length < 2) continue;
        const boletos = a.attachments.filter((x) => x.kind === "BOLETO").map((x) => x.id);
        const anexosPorParcela: Anexo[][] = [];
        for (let k = 1; k < parcelas.length; k++) {
          const anexos: Anexo[] = [];
          for (const x of a.attachments.filter((x) => x.kind !== "BOLETO")) {
            const storageKey = x.storageKey ? await copiarPdf(x.storageKey) : null;
            if (storageKey) copias.push(storageKey);
            anexos.push({ kind: x.kind, fileName: x.fileName, size: x.size, contentType: x.contentType, storageKey, data: storageKey ? null : x.data });
          }
          anexosPorParcela.push(anexos);
        }
        desmembrar.push({ a, parcelas, anexosPorParcela, boletos });
      }

      const criadas = await prisma.$transaction(async (tx) => {
        const revisao = { status: "APROVADA" as const, reviewedById: user.id, reviewedAt: new Date(), rejectionReason: null };
        const res = await tx.account.updateMany({ where: { id: { in: accounts.map((a) => a.id) }, status: "PENDENTE" }, data: revisao });
        if (res.count !== accounts.length) throw new UserError("Algumas contas foram alteradas por outra pessoa. Tente novamente.");
        let criadas = 0;
        for (const { a, parcelas, anexosPorParcela, boletos } of desmembrar) {
          const n = parcelas.length;
          const data = (k: number) => ({
            description: `${a.description} (${k + 1}/${n})`,
            amount: parcelas[k].amount,
            dueDate: new Date(parcelas[k].dueDate + "T00:00:00.000Z"),
          });
          await tx.account.update({ where: { id: a.id }, data: { ...data(0), parcelas: Prisma.DbNull, parcelamentoId: a.id } });
          for (let k = 1; k < n; k++) {
            await tx.account.create({
              data: {
                ...data(k),
                ...revisao,
                supplierId: a.supplierId,
                categoryId: a.categoryId,
                paymentMethodId: a.paymentMethodId,
                pixKey: a.pixKey,
                notes: a.notes,
                createdById: a.createdById,
                createdAt: a.createdAt,
                parcelamentoId: a.id,
                attachments: {
                  create: anexosPorParcela[k - 1],
                  ...(boletos[k] ? { connect: { id: boletos[k] } } : {}),
                },
              },
            });
            criadas++;
          }
        }
        return criadas;
      }, { timeout: 30000 });

      return `${accounts.length} conta(s) aprovada(s).` +
        (desmembrar.length ? ` ${desmembrar.length} parcelada(s), desmembrada(s) em ${desmembrar.length + criadas} conta(s) a pagar.` : "");
    } catch (e) {
      await removerPdfs(copias);
      throw e;
    }
  });
}

export async function rejeitar(formData: FormData) {
  const volta = telaAprovacao(formData, "/contas?status=PENDENTE", "voltaTela");
  await run(volta, volta, async () => {
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

/* ---------- 3. pagar e dar baixa no caixa ---------- */

export async function pagar(formData: FormData) {
  await run("/pagamentos", "/pagamentos", async () => {
    const user = await requirePermission("PAGAR");
    const cashRegisterId = String(formData.get("cashRegisterId") ?? "");
    const reference = String(formData.get("reference") ?? "").trim() || null;
    const selected = ids(formData);
    if (!selected.length) throw new UserError("Selecione ao menos uma conta.");
    if (!cashRegisterId) throw new UserError("Escolha o caixa.");
    // Comprovante de pagamento (opcional): PDF, JPG ou PNG, só no pagamento de uma conta por vez.
    const comprovantes = await lerPdfs(formData, TIPOS_ANEXO.COMPROVANTE.campo, "COMPROVANTE", TIPOS_ANEXO.COMPROVANTE.label);
    if (comprovantes.length && selected.length > 1) throw new UserError("O comprovante só pode ser anexado ao pagar uma conta por vez.");

    // O comprovante vai para o S3 antes; se o pagamento falhar, é removido do bucket.
    await comPdfsNoS3(comprovantes, (enviados) => prisma.$transaction(
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
        if (enviados.length) await tx.attachment.createMany({ data: enviados.map((a) => ({ ...a, accountId: accounts[0].id })) });
      },
      { timeout: 30000 },
    ));
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
    const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (name.length < 2 || !email.includes("@")) throw new UserError("Informe nome e e-mail válidos.");
    if (password.length < 6) throw new UserError("A senha precisa ter ao menos 6 caracteres.");
    if (await prisma.user.findUnique({ where: { email } })) throw new UserError("Já existe um usuário com esse e-mail.");
    // O nome é usado no login, então não pode repetir.
    if (await prisma.user.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }))
      throw new UserError("Já existe um usuário com esse nome.");
    await prisma.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10), permissions: perms(formData), telas: telas(formData) },
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
    const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const permissions = perms(formData);
    const active = formData.get("active") === "on";
    const password = String(formData.get("password") ?? "");
    if (id === admin.id && (!active || !permissions.includes("ADMIN")))
      throw new UserError("Você não pode remover seu próprio acesso de administrador.");
    if (name.length < 2 || !email.includes("@")) throw new UserError("Informe nome e e-mail válidos.");
    if (password && password.length < 6) throw new UserError("A nova senha precisa ter ao menos 6 caracteres.");
    if (await prisma.user.findFirst({ where: { email, id: { not: id } }, select: { id: true } }))
      throw new UserError("Já existe um usuário com esse e-mail.");
    // O nome é usado no login, então não pode repetir.
    if (await prisma.user.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: id } }, select: { id: true } }))
      throw new UserError("Já existe um usuário com esse nome.");
    const u = await prisma.user.update({
      where: { id },
      data: { name, email, permissions, telas: telas(formData), active, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
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

/* ---------- formas de pagamento ---------- */

/** Valida e grava uma forma de pagamento (campo "id" vazio = nova). */
async function gravarFormaPagamento(formData: FormData) {
  await requirePermission("LANCAR");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const active = formData.get("active") === "on";
  if (name.length < 2) throw new UserError("Informe o nome da forma de pagamento.");
  if (name.length > 60) throw new UserError("Nome da forma de pagamento: no máximo 60 caracteres.");
  const mesmoNome = await prisma.paymentMethod.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, id: { not: id || undefined } },
    select: { id: true },
  });
  if (mesmoNome) throw new UserError(`Já existe uma forma de pagamento chamada "${name}".`);
  if (id) {
    const res = await prisma.paymentMethod.updateMany({ where: { id }, data: { name, active } });
    if (!res.count) throw new UserError("Forma de pagamento não encontrada.");
    return `Forma de pagamento "${name}" atualizada.`;
  }
  await prisma.paymentMethod.create({ data: { name, active } });
  return `Forma de pagamento "${name}" cadastrada.`;
}

/** Tela de formas de pagamento: grava e volta para a lista (mantendo aba e busca). */
export async function salvarFormaPagamento(formData: FormData) {
  let volta = "/formas-pagamento";
  try {
    const ref = new URL(headers().get("referer") ?? "");
    if (ref.pathname === "/formas-pagamento") {
      ref.searchParams.delete("ok");
      ref.searchParams.delete("erro");
      volta = `/formas-pagamento?${ref.searchParams.toString()}`;
    }
  } catch {}
  await run(volta, volta, () => gravarFormaPagamento(formData));
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

/* ---------- ordens de compra e cotações ---------- */
// Fluxo: ordem de compra (quem lança) → aprovação da ordem (quem aprova) → cotações (quem lança)
// → aprovação de uma cotação (quem aprova) → a cotação vira conta(s) já aprovada(s) em Pagamentos.

const ordemSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição.").max(300, "Descrição: no máximo 300 caracteres."),
  category: z.string().trim().min(2, "Informe a categoria."),
  notes: z.string().trim().max(1000, "Observações: no máximo 1000 caracteres.").optional(),
});

export async function criarOrdemCompra(formData: FormData) {
  await run("/ordens/nova", "/ordens?status=PENDENTE", async () => {
    const user = await requirePermission("LANCAR");
    const parsed = ordemSchema.safeParse({
      description: formData.get("description") ?? "",
      category: formData.get("category") ?? "",
      notes: formData.get("notes") ?? "",
    });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    const r = parsed.data;
    const { categorias } = await buscarCadastros([], [r.category]);
    const oc = await prisma.purchaseOrder.create({
      data: { description: r.description, categoryId: categorias.get(r.category)!.id, notes: r.notes || null, createdById: user.id },
    });
    return `Ordem de compra #${oc.code} criada, aguardando aprovação.`;
  });
}

/** Busca a ordem e confere se o usuário pode aprová-la/decidir a cotação (quem criou não aprova, exceto o administrador). */
/**
 * Telas que mostram contas fora da tela Contas (abas Aprovar de Contas e de Ordens; Em cotação e Rejeitadas de Ordens):
 * quem age nelas continua nelas.
 */
const TELAS_APROVACAO = ["/contas?status=PENDENTE", "/ordens?status=PENDENTE", "/ordens?status=APROVADA", "/ordens?status=REJEITADA"];
/** Tela de aprovação pedida no campo `campo` do formulário, ou `padrao` se não for uma delas. */
function telaAprovacao(formData: FormData, padrao: string, campo = "volta") {
  const v = String(formData.get(campo) ?? "");
  return TELAS_APROVACAO.includes(v) ? v : padrao;
}

/** Aprovando/rejeitando por uma tela de aprovação, continua nela; senão, fica na ordem. */
function voltaAprovacao(formData: FormData, id: string) {
  return telaAprovacao(formData, `/ordens/${id}`);
}

async function ordemParaAprovar(id: string, user: { id: string; permissions: string[] }) {
  const oc = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!oc) throw new UserError("Ordem de compra não encontrada.");
  if (oc.createdById === user.id && !can(user, "ADMIN")) throw new UserError("Você criou esta ordem de compra; outra pessoa precisa aprovar.");
  return oc;
}

export async function aprovarOrdemCompra(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const volta = voltaAprovacao(formData, id);
  await run(volta, volta, async () => {
    const user = await requirePermission("APROVAR");
    const oc = await ordemParaAprovar(id, user);
    const res = await prisma.purchaseOrder.updateMany({
      where: { id, status: "PENDENTE" },
      data: { status: "APROVADA", reviewedById: user.id, reviewedAt: new Date(), rejectionReason: null },
    });
    if (!res.count) throw new UserError(`Ordem de compra #${oc.code} não está aguardando aprovação.`);
    return `Ordem de compra #${oc.code} aprovada. Já pode receber cotações.`;
  });
}

export async function rejeitarOrdemCompra(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const volta = voltaAprovacao(formData, id);
  await run(volta, volta, async () => {
    const user = await requirePermission("APROVAR");
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (motivo.length < 3) throw new UserError("Informe o motivo da rejeição.");
    const oc = await ordemParaAprovar(id, user);
    const reason = motivo.slice(0, 1000);
    await prisma.$transaction(async (tx) => {
      const agora = new Date();
      const res = await tx.purchaseOrder.updateMany({
        where: { id, status: "PENDENTE" },
        data: { status: "REJEITADA", reviewedById: user.id, reviewedAt: agora, rejectionReason: reason },
      });
      if (!res.count) throw new UserError(`Ordem de compra #${oc.code} não está aguardando aprovação.`);
      // Histórico: a rejeição continua registrada mesmo se for cancelada depois.
      await tx.purchaseOrderRejection.create({ data: { purchaseOrderId: id, userId: user.id, reason, createdAt: agora } });
    });
    return `Ordem de compra #${oc.code} rejeitada.`;
  });
}

/**
 * Lê e valida os dados de uma cotação do formulário (mesmas regras do lançamento de contas;
 * descrição e categoria vêm da própria ordem). Devolve os campos prontos para gravar e os arquivos novos.
 */
async function lerCotacao(formData: FormData, oc: { description: string }) {
  let parcelasRaw: unknown;
  try {
    const v = formData.get("parcelas");
    parcelasRaw = v ? JSON.parse(String(v)) : undefined;
  } catch {
    throw new UserError("Parcelas inválidas.");
  }
  const parsed = rowSchema.safeParse({
    description: oc.description,
    supplier: formData.get("supplier") ?? "",
    category: "ordem",
    paymentMethod: formData.get("paymentMethod") ?? "",
    pixKey: formData.get("pixKey") ?? "",
    amount: formData.get("amount") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    notes: formData.get("notes") ?? "",
    parcelas: parcelasRaw,
  });
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const r = parsed.data;
  const amount = parseMoney(r.amount);
  if (!(amount > 0)) throw new UserError("Informe um valor válido.");
  const parcelas: ParcelaConta[] =
    r.parcelas && r.parcelas.length >= 2
      ? r.parcelas.map((p, k) => {
          const valor = parseMoney(p.amount);
          if (!(valor > 0)) throw new UserError(`Valor inválido na parcela ${k + 1}.`);
          return { amount: valor, dueDate: p.dueDate };
        })
      : [];
  if (parcelas.length) {
    const soma = parcelas.reduce((s, p) => s + Math.round(p.amount * 100), 0);
    if (soma !== Math.round(amount * 100))
      throw new UserError(`A soma das parcelas (${brl(soma / 100)}) difere do valor da cotação (${brl(amount)}).`);
    r.dueDate = parcelas[0].dueDate;
  }
  const { fornecedores, formas } = await buscarCadastros([r.supplier], [], [r.paymentMethod]);
  const forma = formas.get(r.paymentMethod)!;
  const pixKey = chavePix(forma.name, r.pixKey);
  // A proposta usa o tipo PEDIDO só na leitura/validação; na cotação fica em QuoteAttachment.
  const arquivos = await lerPdfs(formData, "anexo", "PEDIDO", "Proposta");
  return {
    dados: {
      supplierId: fornecedores.get(r.supplier)!.id,
      paymentMethodId: forma.id,
      pixKey,
      amount,
      dueDate: new Date(r.dueDate + "T00:00:00.000Z"),
      parcelas: parcelas.length ? (parcelas as Prisma.InputJsonValue) : Prisma.DbNull,
      notes: r.notes || null,
    },
    arquivos,
  };
}

const registroAnexoCotacao = ({ fileName, size, contentType, storageKey }: { fileName: string; size: number; contentType?: string; storageKey: string }) =>
  ({ fileName, size, contentType, storageKey });

/** Inclui uma cotação (fornecedor, valor, vencimento/parcelas, forma de pagamento e proposta anexada) numa ordem aprovada. */
export async function adicionarCotacao(formData: FormData) {
  const id = String(formData.get("purchaseOrderId") ?? "");
  // Incluída pela aba Em cotação (modal), continua nela; senão, fica na ordem.
  const volta = telaAprovacao(formData, `/ordens/${id}`);
  await run(volta, volta, async () => {
    const user = await requirePermission("LANCAR");
    const oc = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!oc) throw new UserError("Ordem de compra não encontrada.");
    if (oc.status !== "APROVADA") throw new UserError(`Ordem de compra #${oc.code} não está recebendo cotações.`);
    const { dados, arquivos } = await lerCotacao(formData, oc);

    await comPdfsNoS3(arquivos, (enviados) =>
      prisma.quote.create({
        data: { ...dados, purchaseOrderId: oc.id, createdById: user.id, attachments: { create: enviados.map(registroAnexoCotacao) } },
      }),
    );
    return `Cotação incluída na ordem de compra #${oc.code}.`;
  });
}

/** Edita uma cotação ainda não decidida (dados e arquivos da proposta). Só quem incluiu ou o administrador. */
export async function editarCotacao(formData: FormData) {
  const quote = await prisma.quote.findUnique({
    where: { id: String(formData.get("id") ?? "") },
    include: { purchaseOrder: true, attachments: { select: { id: true, storageKey: true } } },
  });
  // Editada por uma tela de aprovação/cotação (Aprovar, Em cotação), continua nela; senão, fica na ordem.
  const volta = telaAprovacao(formData, quote ? `/ordens/${quote.purchaseOrderId}` : "/ordens");
  await run(volta, volta, async () => {
    const user = await requirePermission("LANCAR");
    if (!quote) throw new UserError("Cotação não encontrada.");
    if (quote.createdById !== user.id && !can(user, "ADMIN")) throw new UserError("Só quem incluiu (ou o administrador) pode editar a cotação.");
    if (quote.status !== "PENDENTE" || quote.purchaseOrder.status !== "APROVADA") throw new UserError("Esta cotação não pode mais ser editada.");
    const { dados, arquivos } = await lerCotacao(formData, quote.purchaseOrder);
    const remover = quote.attachments.filter((a) => formData.getAll("remover").map(String).includes(a.id));
    if (quote.attachments.length - remover.length + arquivos.length > MAX_ANEXOS)
      throw new UserError(`Proposta: no máximo ${MAX_ANEXOS} arquivo(s) por cotação.`);

    await comPdfsNoS3(arquivos, (enviados) =>
      prisma.$transaction(async (tx) => {
        const res = await tx.quote.updateMany({ where: { id: quote.id, status: "PENDENTE" }, data: dados });
        if (!res.count) throw new UserError("Esta cotação não pode mais ser editada.");
        await tx.quoteAttachment.deleteMany({ where: { id: { in: remover.map((a) => a.id) }, quoteId: quote.id } });
        if (enviados.length) await tx.quoteAttachment.createMany({ data: enviados.map((a) => ({ ...registroAnexoCotacao(a), quoteId: quote.id })) });
        // Por último: exclui no S3 e só então a transação confirma a exclusão no banco.
        await excluirDoS3(remover.map((a) => a.storageKey));
      }, { timeout: 30000 }),
    );
    return `Cotação da ordem de compra #${quote.purchaseOrder.code} atualizada.`;
  });
}

/** Exclui uma cotação ainda não decidida. Só quem incluiu ou o administrador. */
export async function excluirCotacao(formData: FormData) {
  const quote = await prisma.quote.findUnique({
    where: { id: String(formData.get("id") ?? "") },
    include: { purchaseOrder: true, attachments: { select: { storageKey: true } } },
  });
  const volta = quote ? `/ordens/${quote.purchaseOrderId}` : "/ordens";
  await run(volta, volta, async () => {
    const user = await requirePermission("LANCAR");
    if (!quote) throw new UserError("Cotação não encontrada.");
    if (quote.createdById !== user.id && !can(user, "ADMIN")) throw new UserError("Só quem incluiu (ou o administrador) pode excluir a cotação.");
    if (quote.status !== "PENDENTE" || quote.purchaseOrder.status !== "APROVADA") throw new UserError("Esta cotação não pode mais ser excluída.");
    await prisma.$transaction(async (tx) => {
      const res = await tx.quote.deleteMany({ where: { id: quote.id, status: "PENDENTE" } });
      if (!res.count) throw new UserError("Esta cotação não pode mais ser excluída.");
      // Por último: exclui no S3 e só então a transação confirma a exclusão no banco.
      await excluirDoS3(quote.attachments.map((a) => a.storageKey));
    });
    return `Cotação excluída da ordem de compra #${quote.purchaseOrder.code}.`;
  });
}

/**
 * Aprova uma cotação: a ordem é concluída, as demais cotações são descartadas e a cotação vira conta(s) já aprovada(s)
 * (uma por parcela), que vão direto para Pagamentos. A proposta é copiada para cada conta como "Pedido".
 */
export async function aprovarCotacao(formData: FormData) {
  const quote = await prisma.quote.findUnique({
    where: { id: String(formData.get("id") ?? "") },
    include: { attachments: true },
  });
  // Aprovando por uma tela de aprovação (Contas ou Ordens → Aprovar), continua nela (com erro ou sucesso).
  // Pela tela da ordem: com sucesso vai para Ordens de compra → Concluídas; com erro, fica na ordem.
  const daAprovacao = TELAS_APROVACAO.includes(String(formData.get("volta") ?? ""));
  const volta = daAprovacao ? String(formData.get("volta")) : quote ? `/ordens/${quote.purchaseOrderId}` : "/ordens";
  await run(volta, daAprovacao ? volta : "/ordens?status=CONCLUIDA", async () => {
    const user = await requirePermission("APROVAR");
    if (!quote) throw new UserError("Cotação não encontrada.");
    const oc = await ordemParaAprovar(quote.purchaseOrderId, user);
    if (oc.status !== "APROVADA" || quote.status !== "PENDENTE") throw new UserError(`Ordem de compra #${oc.code} não tem esta cotação em aberto.`);

    const lista = lerParcelas(quote.parcelas);
    const parcelas: ParcelaConta[] = lista.length >= 2 ? lista : [{ amount: Number(quote.amount), dueDate: quote.dueDate.toISOString().slice(0, 10) }];
    const n = parcelas.length;

    // Cópia da proposta para cada conta (excluir o anexo de uma conta não afeta as outras).
    const copias: string[] = [];
    try {
      const anexosPorConta: { kind: "PEDIDO"; fileName: string; size: number; contentType: string | null; storageKey: string }[][] = [];
      for (let k = 0; k < n; k++) {
        const anexos = [];
        for (const a of quote.attachments) {
          const storageKey = await copiarPdf(a.storageKey);
          copias.push(storageKey);
          anexos.push({ kind: "PEDIDO" as const, fileName: a.fileName, size: a.size, contentType: a.contentType, storageKey });
        }
        anexosPorConta.push(anexos);
      }

      await prisma.$transaction(async (tx) => {
        const agora = new Date();
        const fechou = await tx.purchaseOrder.updateMany({ where: { id: oc.id, status: "APROVADA" }, data: { status: "CONCLUIDA" } });
        const aprovou = await tx.quote.updateMany({ where: { id: quote.id, status: "PENDENTE" }, data: { status: "APROVADA", approvedById: user.id, approvedAt: agora } });
        if (!fechou.count || !aprovou.count) throw new UserError("A ordem de compra foi alterada por outra pessoa. Tente novamente.");
        await tx.quote.updateMany({ where: { purchaseOrderId: oc.id, id: { not: quote.id }, status: "PENDENTE" }, data: { status: "DESCARTADA" } });

        // Parcelada: as contas compartilham o parcelamentoId (o id da 1ª), como no lançamento normal.
        let parcelamentoId: string | null = null;
        for (let k = 0; k < n; k++) {
          const conta: { id: string } = await tx.account.create({
            data: {
              description: `OC #${oc.code} — ${oc.description}${n > 1 ? ` (${k + 1}/${n})` : ""}`,
              supplierId: quote.supplierId,
              categoryId: oc.categoryId,
              paymentMethodId: quote.paymentMethodId,
              pixKey: quote.pixKey,
              amount: parcelas[k].amount,
              dueDate: new Date(parcelas[k].dueDate + "T00:00:00.000Z"),
              notes: [oc.notes, quote.notes].filter(Boolean).join("\n") || null,
              status: "APROVADA",
              createdById: oc.createdById,
              reviewedById: user.id,
              reviewedAt: agora,
              purchaseOrderId: oc.id,
              parcelamentoId,
              attachments: { create: anexosPorConta[k] },
            },
          });
          if (n > 1 && k === 0) {
            parcelamentoId = conta.id;
            await tx.account.update({ where: { id: conta.id }, data: { parcelamentoId } });
          }
        }
      }, { timeout: 30000 });
    } catch (e) {
      await removerPdfs(copias);
      throw e;
    }
    return `Cotação aprovada: ordem de compra #${oc.code} concluída e ${n > 1 ? `${n} contas enviadas` : "conta enviada"} para pagamento.`;
  });
}

/**
 * Cancela a aprovação de uma cotação, para poder aprovar outra: a cotação e as descartadas voltam a "Em análise",
 * a ordem volta para "Em cotação" e as contas geradas são canceladas (com o motivo). Se alguma conta já foi paga,
 * não é possível cancelar. Mesma regra de quem aprova a cotação.
 */
export async function cancelarAprovacaoCotacao(formData: FormData) {
  const quote = await prisma.quote.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  const volta = quote ? `/ordens/${quote.purchaseOrderId}` : "/ordens";
  await run(volta, volta, async () => {
    const user = await requirePermission("APROVAR");
    if (!quote) throw new UserError("Cotação não encontrada.");
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (motivo.length < 3) throw new UserError("Informe o motivo do cancelamento da aprovação.");
    const oc = await ordemParaAprovar(quote.purchaseOrderId, user);
    if (oc.status !== "CONCLUIDA" || quote.status !== "APROVADA") throw new UserError(`A cotação da ordem de compra #${oc.code} não está aprovada.`);

    let canceladas = 0;
    await prisma.$transaction(async (tx) => {
      const pagas = await tx.account.findMany({ where: { purchaseOrderId: oc.id, status: "PAGA" }, select: { code: true } });
      if (pagas.length)
        throw new UserError(`A ordem de compra #${oc.code} tem conta(s) já paga(s) (${pagas.map((p) => `#${p.code}`).join(", ")}); a aprovação não pode ser cancelada.`);
      const abriu = await tx.purchaseOrder.updateMany({ where: { id: oc.id, status: "CONCLUIDA" }, data: { status: "APROVADA" } });
      const voltou = await tx.quote.updateMany({ where: { id: quote.id, status: "APROVADA" }, data: { status: "PENDENTE", approvedById: null, approvedAt: null } });
      if (!abriu.count || !voltou.count) throw new UserError("A ordem de compra foi alterada por outra pessoa. Tente novamente.");
      await tx.quote.updateMany({ where: { purchaseOrderId: oc.id, status: "DESCARTADA" }, data: { status: "PENDENTE" } });
      const contas = await tx.account.updateMany({
        where: { purchaseOrderId: oc.id, status: { in: ["PENDENTE", "APROVADA", "REJEITADA"] } },
        data: { status: "CANCELADA", canceledById: user.id, canceledAt: new Date(), cancelReason: `Aprovação da cotação cancelada: ${motivo}` },
      });
      canceladas = contas.count;
    });
    return `Aprovação cancelada: ordem de compra #${oc.code} voltou para cotação${canceladas ? ` e ${canceladas} conta(s) a pagar cancelada(s)` : ""}.`;
  });
}

/** Desfaz a rejeição de uma ordem de compra: ela volta a aguardar aprovação. Mesma regra de quem aprova. */
export async function cancelarRejeicaoOrdem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await run(`/ordens/${id}`, `/ordens/${id}`, async () => {
    const user = await requirePermission("APROVAR");
    const oc = await ordemParaAprovar(id, user);
    await prisma.$transaction(async (tx) => {
      const res = await tx.purchaseOrder.updateMany({
        where: { id, status: "REJEITADA" },
        data: { status: "PENDENTE", reviewedById: null, reviewedAt: null, rejectionReason: null },
      });
      if (!res.count) throw new UserError(`Ordem de compra #${oc.code} não está rejeitada.`);
      // Marca a última rejeição como cancelada (fica no histórico, com quem cancelou e quando).
      const ultima = await tx.purchaseOrderRejection.findFirst({ where: { purchaseOrderId: id, canceledAt: null }, orderBy: { createdAt: "desc" } });
      if (ultima) await tx.purchaseOrderRejection.update({ where: { id: ultima.id }, data: { canceledById: user.id, canceledAt: new Date() } });
    });
    return `Rejeição cancelada: ordem de compra #${oc.code} voltou para aprovação.`;
  });
}

/**
 * Altera descrição, categoria e observações de uma ordem de compra (qualquer situação, menos cancelada).
 * Só quem criou ou o administrador. As contas geradas que ainda não foram pagas acompanham a nova descrição e categoria.
 */
export async function editarOrdemCompra(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const volta = voltaOrdem(formData, id);
  await run(volta, volta, async () => {
    const user = await requireUser();
    const oc = await prisma.purchaseOrder.findUnique({ where: { id }, include: { category: true } });
    if (!oc) throw new UserError("Ordem de compra não encontrada.");
    if (oc.createdById !== user.id && !can(user, "ADMIN")) throw new UserError("Só quem criou (ou o administrador) pode alterar a ordem de compra.");
    if (oc.status === "CANCELADA") throw new UserError(`Ordem de compra #${oc.code} está cancelada e não pode ser alterada.`);
    const parsed = ordemSchema.safeParse({
      description: formData.get("description") ?? "",
      category: formData.get("category") ?? "",
      notes: formData.get("notes") ?? "",
    });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    const r = parsed.data;
    const mudouCat = r.category.toLowerCase() !== oc.category.name.toLowerCase();
    const categoryId = mudouCat ? (await buscarCadastros([], [r.category])).categorias.get(r.category)!.id : oc.categoryId;
    if (r.description === oc.description && categoryId === oc.categoryId && (r.notes || null) === oc.notes) throw new UserError("Nenhuma alteração feita.");

    // Rejeitada ou em cotação: ao ser editada, volta a aguardar aprovação (a rejeição continua no histórico;
    // as cotações já incluídas ficam guardadas e voltam a aparecer quando a ordem for aprovada de novo).
    const reenviar = oc.status === "REJEITADA" || oc.status === "APROVADA";
    await prisma.$transaction(async (tx) => {
      const res = await tx.purchaseOrder.updateMany({
        where: { id, status: oc.status },
        data: {
          description: r.description,
          categoryId,
          notes: r.notes || null,
          ...(reenviar ? { status: "PENDENTE" as const, reviewedById: null, reviewedAt: null, rejectionReason: null } : {}),
        },
      });
      if (!res.count) throw new UserError("A ordem de compra foi alterada por outra pessoa. Tente novamente.");
      // Contas ainda a pagar: descrição "OC #N — descrição (k/n)" e categoria acompanham a ordem.
      const contas = await tx.account.findMany({ where: { purchaseOrderId: id, status: "APROVADA" }, select: { id: true, description: true } });
      for (const c of contas) {
        const parcela = /\s\(\d+\/\d+\)$/.exec(c.description)?.[0] ?? "";
        await tx.account.update({ where: { id: c.id }, data: { description: `OC #${oc.code} — ${r.description}${parcela}`, categoryId } });
      }
    });
    return reenviar ? `Ordem de compra #${oc.code} alterada e enviada para aprovação novamente.` : `Ordem de compra #${oc.code} alterada.`;
  });
}

/** Para onde voltar depois de alterar/excluir: a lista de ordens informada pela tela, ou a própria ordem. */
function voltaOrdem(formData: FormData, id: string) {
  const v = String(formData.get("volta") ?? "");
  return v === "/ordens" || v.startsWith("/ordens?") ? v : `/ordens/${id}`;
}

/**
 * Exclui uma ordem de compra: ela fica cancelada (com o histórico).
 * - Concluída: as contas geradas que ainda não foram pagas são canceladas também; se alguma já foi paga, não exclui.
 *   Mesma permissão de excluir conta aprovada: quem lança, quem aprova ou o administrador.
 * - Aguardando aprovação, em cotação ou rejeitada: só quem criou ou o administrador.
 */
export async function excluirOrdemCompra(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await run(voltaOrdem(formData, id), "/ordens?status=CANCELADA", async () => {
    const user = await requireUser();
    const oc = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!oc) throw new UserError("Ordem de compra não encontrada.");
    if (oc.status === "CANCELADA") throw new UserError(`Ordem de compra #${oc.code} já está cancelada.`);
    if (oc.status !== "CONCLUIDA") {
      if (oc.createdById !== user.id && !can(user, "ADMIN")) throw new UserError("Só quem criou (ou o administrador) pode excluir a ordem de compra.");
      const res = await prisma.purchaseOrder.updateMany({
        where: { id, status: { in: ["PENDENTE", "APROVADA", "REJEITADA"] } },
        data: { status: "CANCELADA", canceledAt: new Date() },
      });
      if (!res.count) throw new UserError(`Ordem de compra #${oc.code} foi alterada por outra pessoa. Tente novamente.`);
      return `Ordem de compra #${oc.code} excluída.`;
    }
    if (!can(user, "ADMIN") && !can(user, "LANCAR") && !can(user, "APROVAR")) throw new UserError("Você não tem permissão para excluir ordens de compra.");
    let canceladas = 0;
    await prisma.$transaction(async (tx) => {
      const pagas = await tx.account.findMany({ where: { purchaseOrderId: id, status: "PAGA" }, select: { code: true } });
      if (pagas.length)
        throw new UserError(`Ordem de compra #${oc.code} tem conta(s) já paga(s) (${pagas.map((p) => `#${p.code}`).join(", ")}) e não pode ser excluída.`);
      const res = await tx.purchaseOrder.updateMany({ where: { id, status: "CONCLUIDA" }, data: { status: "CANCELADA", canceledAt: new Date() } });
      if (!res.count) throw new UserError(`Ordem de compra #${oc.code} não está concluída.`);
      const contas = await tx.account.updateMany({
        where: { purchaseOrderId: id, status: { in: ["PENDENTE", "APROVADA", "REJEITADA"] } },
        data: { status: "CANCELADA", canceledById: user.id, canceledAt: new Date(), cancelReason: `Ordem de compra #${oc.code} excluída.` },
      });
      canceladas = contas.count;
    });
    return `Ordem de compra #${oc.code} excluída${canceladas ? ` e ${canceladas} conta(s) a pagar cancelada(s)` : ""}.`;
  });
}
