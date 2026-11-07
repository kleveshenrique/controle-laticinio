"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { pagar } from "@/app/actions";
import { brl } from "@/lib/format";

type Caixa = { id: string; name: string; balance: number };

/** Botão "Pagar" de uma conta: abre um modal para escolher o caixa (e referência opcional) e dá baixa. */
export function PagarConta({
  id,
  code,
  amount,
  caixas,
  disabled,
}: {
  id: string;
  code: number;
  amount: number;
  caixas: Caixa[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [caixaId, setCaixaId] = useState("");
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();

  const caixa = caixas.find((c) => c.id === caixaId);
  const semSaldo = !!caixa && caixa.balance < amount;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setCaixaId("");
      setReference("");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, mounted]);

  return (
    <div className="flex justify-end">
      <button type="button" className="btn btn-primary" disabled={disabled || pending} onClick={() => setOpen(true)}>
        Pagar
      </button>

      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-md rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!caixaId) return;
                const fd = new FormData();
                fd.append("ids", id);
                fd.append("cashRegisterId", caixaId);
                if (reference.trim()) fd.append("reference", reference.trim());
                setOpen(false);
                startTransition(() => pagar(fd));
              }}
            >
              <div>
                <h2 className="text-base font-semibold">Pagar conta #{code}</h2>
                <p className="text-sm text-muted">Valor: <strong className="text-ink">{brl(amount)}</strong></p>
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-caixa`}>Caixa</label>
                <select id={`${uid}-caixa`} className="input" value={caixaId} onChange={(e) => setCaixaId(e.target.value)} required autoFocus>
                  <option value="">Escolha…</option>
                  {caixas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — saldo {brl(c.balance)}{c.balance < amount ? " (ficará negativo)" : ""}
                    </option>
                  ))}
                </select>
                {semSaldo && (
                  <p className="mt-1 text-xs text-amber-700">
                    Saldo insuficiente: após o pagamento o caixa ficará negativo em {brl(amount - caixa!.balance)}.
                  </p>
                )}
                {caixas.length === 0 && <p className="mt-1 text-xs text-red-700">Nenhum caixa ativo. Cadastre um na aba Caixa.</p>}
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-ref`}>Referência do pagamento (opcional)</label>
                <input
                  id={`${uid}-ref`}
                  className="input"
                  placeholder="Ex.: PIX, nº do recibo, nº do cheque"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Voltar</button>
                <button type="submit" className="btn btn-primary" disabled={!caixaId || pending}>Confirmar pagamento</button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </div>
  );
}
