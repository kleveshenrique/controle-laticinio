/** Ícones (SVG em linha, traço) para os botões de ação. Use com title/aria-label no botão. */

type P = { className?: string };

function Svg({ className = "h-4 w-4", children }: P & { children: React.ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Aprovar */
export const IconeAprovar = (p: P) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;

/** Rejeitar */
export const IconeRejeitar = (p: P) => <Svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;

/** Cancelar a conta */
export const IconeCancelar = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></Svg>;

/** Excluir (lixeira) */
export const IconeExcluir = (p: P) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></Svg>
);

/** Editar */
export const IconeEditar = (p: P) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>
);

/** Adicionar observação */
export const IconeObservacao = (p: P) => (
  <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /><path d="M12 7v6" /><path d="M9 10h6" /></Svg>
);

/** Ver observações (balão de mensagem) */
export const IconeMensagem = (p: P) => (
  <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /><path d="M8 9h8" /><path d="M8 13h5" /></Svg>
);

/** Seta para a esquerda */
export const IconeSetaEsquerda = (p: P) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>;

/** Seta para a direita */
export const IconeSetaDireita = (p: P) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
