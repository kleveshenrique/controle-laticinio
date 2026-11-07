"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Tipo = "ok" | "erro";
type Item = { id: number; tipo: Tipo; texto: string };

const EVENTO = "app-toast";
const DURACAO: Record<Tipo, number> = { ok: 3000, erro: 3000 };

/** Mostra uma mensagem toast no centro da tela (de qualquer componente cliente). */
export function toast(tipo: Tipo, texto: string) {
  if (typeof window === "undefined" || !texto) return;
  window.dispatchEvent(new CustomEvent<Omit<Item, "id">>(EVENTO, { detail: { tipo, texto } }));
}

/**
 * Exibe os toasts. Fica no layout raiz.
 * Usa popover (top layer) para aparecer por cima também dos modais <dialog>.
 */
export function Toaster() {
  const [itens, setItens] = useState<Item[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const ultimo = useRef({ texto: "", em: 0 });

  useEffect(() => {
    const ouvir = (e: Event) => {
      const { tipo, texto } = (e as CustomEvent<Omit<Item, "id">>).detail;
      // Ignora a mesma mensagem repetida em seguida (ex.: efeito executado duas vezes em desenvolvimento).
      const agora = Date.now();
      if (ultimo.current.texto === texto && agora - ultimo.current.em < 800) return;
      ultimo.current = { texto, em: agora };
      const id = ++seq.current;
      setItens((l) => [...l, { id, tipo, texto }]);
      setTimeout(() => setItens((l) => l.filter((i) => i.id !== id)), DURACAO[tipo]);
    };
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);

  // Reabre o popover a cada mensagem nova para ficar acima de um modal aberto depois dele.
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el?.showPopover) return;
    try {
      if (el.matches(":popover-open")) el.hidePopover!();
      if (itens.length) el.showPopover();
    } catch {}
  }, [itens]);

  const fechar = (id: number) => setItens((l) => l.filter((i) => i.id !== id));

  return (
    <div
      ref={ref}
      popover="manual"
      className="pointer-events-none fixed inset-0 z-[100] m-0 flex h-full w-full flex-col items-center justify-center gap-2 border-0 bg-transparent p-4"
      aria-live="polite"
    >
      {itens.map((i) => (
        <div
          key={i.id}
          role={i.tipo === "erro" ? "alert" : "status"}
          className={`toast-entrada pointer-events-auto relative max-w-md overflow-hidden rounded-lg text-sm font-medium text-white shadow-xl ${
            i.tipo === "erro" ? "bg-red-700" : "bg-brand-700"
          }`}
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <span aria-hidden="true">{i.tipo === "erro" ? "⚠" : "✓"}</span>
            <span className="flex-1">{i.texto}</span>
            <button type="button" className="-mr-1 opacity-80 hover:opacity-100" aria-label="Fechar" onClick={() => fechar(i.id)}>
              ×
            </button>
          </div>
          {/* Barra de progresso: esvazia no tempo em que o toast fica na tela. */}
          <div
            className="toast-progresso absolute bottom-0 left-0 h-1 w-full bg-white/70"
            style={{ animationDuration: `${DURACAO[i.tipo]}ms` }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Mensagens vindas do servidor pela URL (?ok= / ?erro=, gravadas pelas ações): vira toast e some da URL
 * (assim, recarregar a página não repete a mensagem e a próxima mensagem igual volta a aparecer).
 */
export function ToastDaUrl() {
  const params = useSearchParams();
  const pathname = usePathname();
  const ok = params.get("ok");
  const erro = params.get("erro");

  useEffect(() => {
    if (!ok && !erro) return;
    if (erro) toast("erro", erro);
    else if (ok) toast("ok", ok);
    const p = new URLSearchParams(params.toString());
    p.delete("ok");
    p.delete("erro");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [ok, erro, params, pathname]);

  return null;
}
