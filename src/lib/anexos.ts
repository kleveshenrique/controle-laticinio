/** Limites dos anexos (pedido, nota fiscal, boletos e comprovante) de cada conta. */
export const MAX_ANEXOS = 3;
export const MAX_PDF_MB = 5;
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

export type TipoAnexo = "PEDIDO" | "NOTA_FISCAL" | "BOLETO" | "COMPROVANTE";

/** Todos os anexos (pedido, nota fiscal, boleto e comprovante) aceitam PDF, JPG ou PNG. */
export const ACCEPT_ANEXO = "application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png";
export const TIPOS_ACEITOS_TEXTO = "PDF, JPG ou PNG";

/** Confere pelo tipo/extensão (no navegador) se o arquivo é PDF, JPG ou PNG. O servidor confere de novo pelo conteúdo. */
export function arquivoAceito(f: { name: string; type: string }) {
  return ["application/pdf", "image/jpeg", "image/png"].includes(f.type) || /\.(pdf|jpe?g|png)$/.test(f.name.toLowerCase());
}

type RegraAnexo = { status: "APROVADA" | "PAGA"; admin?: boolean; primeiraParcela: boolean };

/**
 * Quem pode anexar em conta aprovada/paga (mesma regra na tela e no servidor):
 * - Aprovada: pedido não pode mais ser anexado; nota fiscal só na conta sem parcelamento ou na 1ª parcela; boleto sempre.
 * - Paga: só o administrador (que já foi verificado antes), com a mesma regra da nota fiscal.
 * - Comprovante de pagamento: só depois de paga (no pagamento ele é anexado pelo modal "Pagar").
 */
export function podeAnexar(kind: TipoAnexo, { status, admin, primeiraParcela }: RegraAnexo) {
  if (kind === "PEDIDO") return status === "PAGA" && Boolean(admin);
  if (kind === "NOTA_FISCAL") return primeiraParcela;
  if (kind === "COMPROVANTE") return status === "PAGA";
  return true;
}

export function motivoNaoAnexa(kind: TipoAnexo, { status, primeiraParcela }: RegraAnexo) {
  if (kind === "NOTA_FISCAL" && !primeiraParcela) return "anexada somente na 1ª parcela";
  if (kind === "PEDIDO" && status === "APROVADA") return "não pode mais ser anexado depois da aprovação";
  if (kind === "COMPROVANTE" && status === "APROVADA") return "anexado ao pagar a conta";
  return "somente o administrador pode alterar";
}
export const TIPOS_ANEXO: Record<TipoAnexo, { label: string; botao: string; campo: string }> = {
  PEDIDO: { label: "Pedido", botao: "Pedido", campo: "pedido" },
  NOTA_FISCAL: { label: "Nota fiscal", botao: "Nota fiscal", campo: "nota" },
  BOLETO: { label: "Boletos", botao: "Boleto", campo: "boleto" },
  COMPROVANTE: { label: "Comprovante de pagamento", botao: "Comprovante", campo: "comprovante" },
};
