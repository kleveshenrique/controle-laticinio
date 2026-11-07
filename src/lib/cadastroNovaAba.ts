/**
 * Cadastro de fornecedor/categoria aberto em outra aba a partir de um formulário (ex.: lançamento de contas),
 * para não perder o que já foi digitado. Ao salvar, a aba do cadastro avisa a de origem pelo BroadcastChannel.
 */

const CANAL = "cadastro-criado";

export type TipoCadastro = "fornecedor" | "categoria";
export type CadastroCriado = { tipo: TipoCadastro; nome: string; ref: string };

const URL_CADASTRO: Record<TipoCadastro, string> = { fornecedor: "/fornecedores/novo", categoria: "/categorias/nova" };

export const tipoValido = (t: unknown): t is TipoCadastro => t === "fornecedor" || t === "categoria";

/** Identificador da origem: só letras, números, "-", "_" e ":" (vai na URL e volta na mensagem). */
export const refValida = (ref: unknown): ref is string => typeof ref === "string" && /^[\w:-]{1,80}$/.test(ref);

/** Página que avisa a aba de origem depois de salvar. */
export const urlCadastroSalvo = (tipo: TipoCadastro, ref: string, nome: string) =>
  `/cadastro-salvo?tipo=${tipo}&ref=${ref}&nome=${encodeURIComponent(nome)}`;

export function abrirCadastroNovaAba(tipo: TipoCadastro, ref: string) {
  window.open(`${URL_CADASTRO[tipo]}?ref=${encodeURIComponent(ref)}`, "_blank");
}

export function avisarCadastroCriado(msg: CadastroCriado) {
  if (typeof BroadcastChannel === "undefined") return;
  const c = new BroadcastChannel(CANAL);
  c.postMessage(msg);
  c.close();
}

/** Escuta cadastros feitos em outras abas; devolve a função que para de escutar. */
export function ouvirCadastroCriado(cb: (msg: CadastroCriado) => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const c = new BroadcastChannel(CANAL);
  c.onmessage = (e: MessageEvent) => {
    const m = e.data as Partial<CadastroCriado> | null;
    if (m && tipoValido(m.tipo) && typeof m.nome === "string" && refValida(m.ref)) cb({ tipo: m.tipo, nome: m.nome, ref: m.ref });
  };
  return () => c.close();
}
