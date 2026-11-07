"use client";

/** Botão que fecha a aba atual (usado nos cadastros abertos em outra aba pelo lançamento de contas). */
export function FecharAba({ children = "Cancelar" }: { children?: React.ReactNode }) {
  return <button type="button" className="btn" onClick={() => window.close()}>{children}</button>;
}
