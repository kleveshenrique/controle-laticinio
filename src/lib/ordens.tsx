/** Situações da ordem de compra e da cotação (rótulo e cor), no mesmo padrão de STATUS das contas. */
export const STATUS_ORDEM = {
  PENDENTE: { label: "Aguardando aprovação", tab: "Aprovar", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  APROVADA: { label: "Aprovada, em cotação", tab: "Em cotação", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  REJEITADA: { label: "Rejeitada", tab: "Rejeitadas", cls: "bg-red-50 text-red-800 border-red-200" },
  CONCLUIDA: { label: "Concluída", tab: "Concluídas", cls: "bg-brand-50 text-brand-700 border-brand-600/30" },
  CANCELADA: { label: "Cancelada", tab: "Canceladas", cls: "bg-gray-100 text-gray-600 border-gray-200" },
} as const;
export type StatusOrdem = keyof typeof STATUS_ORDEM;

export const STATUS_COTACAO = {
  PENDENTE: { label: "Em análise", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  APROVADA: { label: "Aprovada", cls: "bg-brand-50 text-brand-700 border-brand-600/30" },
  DESCARTADA: { label: "Não escolhida", cls: "bg-gray-100 text-gray-600 border-gray-200" },
} as const;

export function Selo({ s }: { s: { label: string; cls: string } }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs ${s.cls}`}>{s.label}</span>;
}

type OrdemHistorico = {
  status: StatusOrdem;
  reviewedAt: Date | null;
  reviewedBy: { name: string } | null;
  canceledAt: Date | null;
  rejections: { id: string; createdAt: Date; reason: string; user: { name: string }; canceledAt: Date | null; canceledBy: { name: string } | null }[];
  quotes: { id: string; status: string; approvedAt: Date | null; approvedBy: { name: string } | null; supplier: { name: string } }[];
};

/** Rejeições e eventos (aprovação, rejeição cancelada, cotação aprovada, cancelamento) para o balão "Obs". */
export function historicoOrdem(o: OrdemHistorico) {
  const eventos = [
    ...(o.reviewedBy && o.reviewedAt && (o.status === "APROVADA" || o.status === "CONCLUIDA")
      ? [{ key: "aprovada", data: o.reviewedAt, rotulo: "Ordem aprovada", autor: o.reviewedBy.name, cls: "border-emerald-500 text-emerald-800" }]
      : []),
    ...o.rejections
      .filter((r) => r.canceledAt)
      .map((r) => ({
        key: `rc-${r.id}`,
        data: r.canceledAt!,
        rotulo: "Rejeição cancelada",
        autor: r.canceledBy?.name ?? "",
        texto: "Voltou para aprovação.",
        cls: "border-gray-400 text-gray-700",
      })),
    ...o.quotes
      .filter((q) => q.status === "APROVADA" && q.approvedAt)
      .map((q) => ({
        key: `q-${q.id}`,
        data: q.approvedAt!,
        rotulo: "Cotação aprovada",
        autor: q.approvedBy?.name ?? "",
        texto: q.supplier.name,
        cls: "border-violet-400 text-violet-800",
      })),
    ...(o.status === "CANCELADA" && o.canceledAt
      ? [{ key: "cancelada", data: o.canceledAt, rotulo: "Cancelada", autor: "", cls: "border-red-500 text-red-700" }]
      : []),
  ];
  const n = o.rejections.length;
  // Quantidade de rejeições (inclusive as canceladas) no botão "Obs".
  const rotuloObs = n ? `${n} ${n > 1 ? "rejeições" : "rejeição"}` : undefined;
  return { rejeicoes: o.rejections, eventos, rotuloObs };
}
