import type { TipoAnexo } from "@/lib/anexos";
import { prisma } from "@/lib/db";

/**
 * Código de identificação do parcelamento: o número (#) da conta original, que vira a parcela 1/N na aprovação.
 * Devolve parcelamentoId → código para as contas informadas.
 */
export async function codigosParcelamento(contas: { parcelamentoId: string | null }[]) {
  const ids = [...new Set(contas.map((c) => c.parcelamentoId).filter((id): id is string => !!id))];
  if (!ids.length) return new Map<string, number>();
  const originais = await prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } });
  return new Map(originais.map((o) => [o.id, o.code]));
}

type AnexoLista = { id: string; kind: TipoAnexo; fileName: string };

/**
 * A nota fiscal é anexada só na 1ª parcela (a conta original), mas aparece em todas as parcelas da conta.
 * Devolve uma função que junta aos anexos da parcela as notas fiscais da 1ª parcela (sem repetir pelo nome do arquivo,
 * já que as parcelas recebem cópias dos anexos do lançamento na aprovação).
 */
export async function comNotasDaPrimeiraParcela(contas: { id: string; parcelamentoId: string | null }[]) {
  const ids = [...new Set(contas.filter((c) => c.parcelamentoId && c.parcelamentoId !== c.id).map((c) => c.parcelamentoId!))];
  const notas = ids.length
    ? await prisma.attachment.findMany({
        where: { accountId: { in: ids }, kind: "NOTA_FISCAL" },
        select: { id: true, kind: true, fileName: true, accountId: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  return <T extends AnexoLista>(conta: { id: string; parcelamentoId: string | null }, anexos: T[]): (T | AnexoLista)[] => {
    if (!conta.parcelamentoId || conta.parcelamentoId === conta.id) return anexos;
    const daPrimeira = notas
      .filter((n) => n.accountId === conta.parcelamentoId)
      .filter((n) => !anexos.some((a) => a.kind === "NOTA_FISCAL" && a.fileName === n.fileName))
      .map(({ id, kind, fileName }) => ({ id, kind, fileName }));
    return [...anexos, ...daPrimeira];
  };
}

/**
 * Quantas parcelas de cada parcelamento ainda existem (não canceladas). Usado para avisar, ao excluir,
 * quando é a última parcela (aí a nota fiscal também é apagada).
 */
export async function parcelasAtivas(contas: { parcelamentoId: string | null }[]) {
  const ids = [...new Set(contas.map((c) => c.parcelamentoId).filter((id): id is string => !!id))];
  if (!ids.length) return new Map<string, number>();
  const grupos = await prisma.account.groupBy({
    by: ["parcelamentoId"],
    where: { parcelamentoId: { in: ids }, status: { not: "CANCELADA" } },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [g.parcelamentoId!, g._count._all]));
}

/** "2/3" a partir da descrição da parcela ("Compra de leite (2/3)"). */
export const numeroParcela = (descricao: string) => descricao.match(/\((\d+\/\d+)\)$/)?.[1] ?? "";
