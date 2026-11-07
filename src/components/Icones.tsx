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

/** Editar */
export const IconeEditar = (p: P) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>
);

/** Reenviar para aprovação */
export const IconeReenviar = (p: P) => (
  <Svg {...p}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Svg>
);

/** Anexos */
export const IconeAnexos = (p: P) => (
  <Svg {...p}><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></Svg>
);

/** Adicionar observação */
export const IconeObservacao = (p: P) => (
  <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /><path d="M12 7v6" /><path d="M9 10h6" /></Svg>
);
