/** label: etiqueta do status nas listas; tab (opcional): nome mais curto no botão de filtro da tela Contas. */
export const STATUS = {
  PENDENTE: { label: "Aguardando aprovação", tab: "Aprovação", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  APROVADA: { label: "Aprovada, a pagar", tab: "Aprovada", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  REJEITADA: { label: "Rejeitada", cls: "bg-red-50 text-red-800 border-red-200" },
  PAGA: { label: "Paga", cls: "bg-brand-50 text-brand-700 border-brand-600/30" },
  CANCELADA: { label: "Cancelada", cls: "bg-gray-100 text-gray-600 border-gray-200" },
} as const;

export const brl = (v: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const dateBR = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

export const dateTimeBR = (d: Date | null | undefined) =>
  d ? d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" }) : "—";

/** Hoje (YYYY-MM-DD) no fuso do Maranhão. */
export const todayISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });

/** Aceita "1.234,56", "1234,56", "1234.56", "R$ 10". */
export function parseMoney(input: string): number {
  let s = String(input ?? "").replace(/[R$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Uma alteração registrada no histórico de edição de uma conta (valores já formatados para exibição). */
export type AlteracaoConta = { campo: string; de: string; para: string };

/** Máscara de moeda: considera só os dígitos digitados como centavos. Ex.: "123456" -> "R$ 1.234,56". */
export const maskMoney = (v: string) => {
  const digits = v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 13);
  if (!digits) return "";
  const n = Number(digits) / 100;
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
