/**
 * Converte as contas já lançadas (todas, menos as canceladas) em ordens de compra, para o fluxo novo.
 *
 * Contas ainda NÃO aprovadas (aguardando aprovação ou rejeitadas):
 * - a conta é CANCELADA (motivo "Convertida na ordem de compra #N"), registrada em nome do administrador;
 * - é criada uma ordem de compra "Em cotação" (já aprovada, em nome de quem lançou a conta, na mesma data),
 *   com uma cotação "Em análise" (fornecedor, forma de pagamento/chave Pix, valor e parcelas da conta);
 * - os anexos da conta (pedido, nota fiscal, boletos) são copiados no S3 para a proposta da cotação.
 * A partir daí segue o fluxo normal: incluir outras cotações, aprovar uma e ela vai para Pagamentos.
 *
 * Contas aprovadas ou pagas: só registra a origem (ordem "Concluída" com a cotação "Aprovada", ligada às contas),
 * sem mudar a situação da conta.
 *
 * Pode ser rodado várias vezes: contas já ligadas a uma ordem são ignoradas.
 * Contas sem categoria ou sem forma de pagamento são ignoradas e listadas no fim (corrija e rode de novo).
 *
 * Uso:  npm run db:converter-ordens              (simulação: só mostra o que seria feito)
 *       npm run db:converter-ordens -- --aplicar (grava no banco)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { copiarPdf, removerPdfs } from "../src/lib/storage";

const prisma = new PrismaClient();
const aplicar = process.argv.includes("--aplicar");

type Parcela = { amount: number; dueDate: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Tira o sufixo " (2/3)" que a aprovação põe na descrição das parcelas. */
const semParcela = (s: string) => s.replace(/\s*\(\d+\/\d+\)\s*$/, "");
/** Mesmo limite de arquivos por cotação da tela (MAX_ANEXOS). */
const MAX_ARQUIVOS_COTACAO = 3;

async function main() {
  const admin = await prisma.user.findFirst({ where: { permissions: { has: "ADMIN" }, active: true }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("Nenhum administrador ativo para registrar o cancelamento das contas.");

  const contas = await prisma.account.findMany({
    where: { purchaseOrderId: null, status: { not: "CANCELADA" } },
    orderBy: [{ createdAt: "asc" }, { dueDate: "asc" }],
    include: { attachments: { where: { storageKey: { not: null } }, orderBy: { createdAt: "asc" } } },
  });

  // Parcelas de uma mesma conta (mesmo parcelamentoId) viram uma única ordem.
  const grupos = new Map<string, typeof contas>();
  for (const c of contas) {
    const chave = c.parcelamentoId ?? c.id;
    grupos.set(chave, [...(grupos.get(chave) ?? []), c]);
  }

  const ignoradas: string[] = [];
  const avisos: string[] = [];
  let emCotacao = 0;
  let concluidas = 0;

  for (const [chave, lista] of grupos) {
    lista.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const base = lista.find((c) => c.id === chave) ?? lista[0];
    const codigos = lista.map((c) => `#${c.code}`).join(", ");
    if (!base.categoryId) { ignoradas.push(`${codigos}: sem categoria`); continue; }
    if (!base.paymentMethodId) { ignoradas.push(`${codigos}: sem forma de pagamento`); continue; }

    // Parcelas: contas desmembradas (uma por parcela) ou a lista da conta parcelada ainda não aprovada.
    const pendentes = Array.isArray(base.parcelas) ? (base.parcelas as Parcela[]) : [];
    const parcelas: Parcela[] =
      lista.length > 1 ? lista.map((c) => ({ amount: Number(c.amount), dueDate: iso(c.dueDate) })) : pendentes.length > 1 ? pendentes : [];
    const total = lista.reduce((s, c) => s + Math.round(Number(c.amount) * 100), 0) / 100;
    const descricao = semParcela(base.description);
    const naoAprovada = lista.every((c) => c.status === "PENDENTE" || c.status === "REJEITADA");
    const resumo = `${codigos} (${base.status}) → OC "${descricao}" · R$ ${total.toFixed(2)}${parcelas.length ? ` em ${parcelas.length}x` : ""}`;

    const cotacao = {
      supplierId: base.supplierId,
      paymentMethodId: base.paymentMethodId!,
      pixKey: base.pixKey,
      amount: total,
      dueDate: parcelas.length ? new Date(parcelas[0].dueDate + "T00:00:00.000Z") : base.dueDate,
      parcelas: parcelas.length ? (parcelas as Prisma.InputJsonValue) : undefined,
      notes: base.notes,
      createdById: base.createdById,
      createdAt: base.createdAt,
    };

    if (naoAprovada) {
      const arquivos = lista.flatMap((c) => c.attachments);
      if (arquivos.length > MAX_ARQUIVOS_COTACAO)
        avisos.push(`${codigos}: ${arquivos.length} anexos; a proposta da cotação ficará com ${arquivos.length} arquivos (acima do limite de ${MAX_ARQUIVOS_COTACAO} da tela).`);
      console.log(`${aplicar ? "Cancelando" : "Cancelaria"} ${resumo} — em cotação, ${arquivos.length} anexo(s) copiado(s) para a cotação`);
      if (!aplicar) { emCotacao++; continue; }

      // Copia os anexos no S3 antes; se a gravação falhar, as cópias são removidas.
      const copias: string[] = [];
      try {
        const anexos: { fileName: string; size: number; contentType: string | null; storageKey: string }[] = [];
        for (const a of arquivos) {
          const storageKey = await copiarPdf(a.storageKey!);
          copias.push(storageKey);
          anexos.push({ fileName: a.fileName, size: a.size, contentType: a.contentType, storageKey });
        }
        await prisma.$transaction(async (tx) => {
          const oc = await tx.purchaseOrder.create({
            data: {
              description: descricao,
              categoryId: base.categoryId!,
              notes: [base.notes, `Criada a partir da(s) conta(s) ${codigos}, canceladas na conversão para o fluxo de ordens de compra.`].filter(Boolean).join("\n"),
              status: "APROVADA",
              createdById: base.createdById,
              createdAt: base.createdAt,
              reviewedById: admin.id,
              reviewedAt: new Date(),
              quotes: { create: { ...cotacao, attachments: { create: anexos } } },
            },
          });
          const res = await tx.account.updateMany({
            where: { id: { in: lista.map((c) => c.id) }, purchaseOrderId: null, status: { in: ["PENDENTE", "REJEITADA"] } },
            data: {
              status: "CANCELADA",
              canceledById: admin.id,
              canceledAt: new Date(),
              cancelReason: `Convertida na ordem de compra #${oc.code}.`,
              purchaseOrderId: oc.id,
            },
          });
          if (res.count !== lista.length) throw new Error(`Contas ${codigos} foram alteradas durante a conversão.`);
          console.log(`  ✔ ordem de compra #${oc.code}`);
        }, { timeout: 30000 });
      } catch (e) {
        await removerPdfs(copias);
        throw e;
      }
      emCotacao++;
    } else {
      // Aprovada ou paga: só registra a origem; a conta continua como está.
      const revisada = lista.find((c) => c.reviewedById);
      console.log(`${aplicar ? "Registrando" : "Registraria"} ${resumo} — ordem concluída, conta mantida`);
      if (!aplicar) { concluidas++; continue; }
      await prisma.$transaction(async (tx) => {
        const oc = await tx.purchaseOrder.create({
          data: {
            description: descricao,
            categoryId: base.categoryId!,
            notes: [base.notes, `Convertida da(s) conta(s) ${codigos}.`].filter(Boolean).join("\n"),
            status: "CONCLUIDA",
            createdById: base.createdById,
            createdAt: base.createdAt,
            reviewedById: revisada?.reviewedById ?? null,
            reviewedAt: revisada?.reviewedAt ?? null,
            quotes: { create: { ...cotacao, status: "APROVADA", approvedById: revisada?.reviewedById ?? null, approvedAt: revisada?.reviewedAt ?? null } },
          },
        });
        const res = await tx.account.updateMany({ where: { id: { in: lista.map((c) => c.id) }, purchaseOrderId: null }, data: { purchaseOrderId: oc.id } });
        if (res.count !== lista.length) throw new Error(`Contas ${codigos} foram alteradas durante a conversão.`);
        console.log(`  ✔ ordem de compra #${oc.code}`);
      });
      concluidas++;
    }
  }

  console.log("");
  console.log(`${aplicar ? "Feito" : "Seria feito"}: ${emCotacao} conta(s) cancelada(s) e recriada(s) como ordem em cotação; ${concluidas} ordem(ns) concluída(s) só para registrar a origem.`);
  console.log(`Cancelamentos registrados em nome de: ${admin.name}.`);
  if (avisos.length) { console.log("Avisos:"); avisos.forEach((l) => console.log(`  - ${l}`)); }
  if (ignoradas.length) {
    console.log(`Ignoradas (${ignoradas.length}) — corrija e rode de novo:`);
    ignoradas.forEach((l) => console.log(`  - ${l}`));
  }
  if (!aplicar) console.log("\nSimulação: nada foi gravado. Para gravar: npm run db:converter-ordens -- --aplicar");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
