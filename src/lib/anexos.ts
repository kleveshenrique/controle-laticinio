/** Limites dos anexos (pedido e boletos) de cada conta. */
export const MAX_ANEXOS = 3;
export const MAX_PDF_MB = 5;
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

export type TipoAnexo = "PEDIDO" | "NOTA_FISCAL" | "BOLETO";

type RegraAnexo = { status: "APROVADA" | "PAGA"; admin?: boolean; primeiraParcela: boolean };

/**
 * Quem pode anexar em conta aprovada/paga (mesma regra na tela e no servidor):
 * - Aprovada: pedido não pode mais ser anexado; nota fiscal só na conta sem parcelamento ou na 1ª parcela; boleto sempre.
 * - Paga: só o administrador (que já foi verificado antes), com a mesma regra da nota fiscal.
 */
export function podeAnexar(kind: TipoAnexo, { status, admin, primeiraParcela }: RegraAnexo) {
  if (kind === "PEDIDO") return status === "PAGA" && Boolean(admin);
  if (kind === "NOTA_FISCAL") return primeiraParcela;
  return true;
}

export function motivoNaoAnexa(kind: TipoAnexo, { status, primeiraParcela }: RegraAnexo) {
  if (kind === "NOTA_FISCAL" && !primeiraParcela) return "anexada somente na 1ª parcela";
  if (kind === "PEDIDO" && status === "APROVADA") return "não pode mais ser anexado depois da aprovação";
  return "somente o administrador pode alterar";
}
export const TIPOS_ANEXO: Record<TipoAnexo, { label: string; botao: string; campo: string }> = {
  PEDIDO: { label: "Pedido", botao: "Pedido PDF", campo: "pedido" },
  NOTA_FISCAL: { label: "Nota fiscal", botao: "Nota fiscal PDF", campo: "nota" },
  BOLETO: { label: "Boletos", botao: "Boleto PDF", campo: "boleto" },
};
