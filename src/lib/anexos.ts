/** Limites dos anexos (pedido e boletos) de cada conta. */
export const MAX_ANEXOS = 3;
export const MAX_PDF_MB = 5;
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

export type TipoAnexo = "PEDIDO" | "NOTA_FISCAL" | "BOLETO";
export const TIPOS_ANEXO: Record<TipoAnexo, { label: string; botao: string; campo: string }> = {
  PEDIDO: { label: "Pedido", botao: "Pedido PDF", campo: "pedido" },
  NOTA_FISCAL: { label: "Nota fiscal", botao: "Nota fiscal PDF", campo: "nota" },
  BOLETO: { label: "Boletos", botao: "Boleto PDF", campo: "boleto" },
};
