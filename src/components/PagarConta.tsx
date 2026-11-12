"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { pagar } from "@/app/actions";
import { brl } from "@/lib/format";
import { ACCEPT_ANEXO, arquivoAceito, MAX_ANEXOS, MAX_PDF_BYTES, MAX_PDF_MB, TIPOS_ACEITOS_TEXTO } from "@/lib/anexos";

const IconeClipe = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

type Caixa = { id: string; name: string; balance: number };

/** Botão "Pagar" de uma conta: abre um modal para escolher o caixa (referência e comprovante opcionais) e dá baixa. */
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
  const [comprovantes, setComprovantes] = useState<File[]>([]);
  const [aviso, setAviso] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);
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
      setComprovantes([]);
      setAviso("");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, mounted]);

  // Comprovante de pagamento: PDF, JPG ou PNG, até MAX_ANEXOS arquivos de MAX_PDF_MB cada.
  const adicionarComprovantes = (lista: FileList | null) => {
    const avisos: string[] = [];
    const aceitos = Array.from(lista ?? []).filter((f) => {
      if (!arquivoAceito(f)) avisos.push(`"${f.name}" não é ${TIPOS_ACEITOS_TEXTO}`);
      else if (f.size > MAX_PDF_BYTES) avisos.push(`"${f.name}" passa de ${MAX_PDF_MB} MB`);
      else return true;
      return false;
    });
    const todos = [...comprovantes, ...aceitos];
    if (todos.length > MAX_ANEXOS) avisos.push(`máximo de ${MAX_ANEXOS} arquivo(s)`);
    setAviso(avisos.join(" · "));
    setComprovantes(todos.slice(0, MAX_ANEXOS));
    if (arquivo.current) arquivo.current.value = "";
  };

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
                comprovantes.forEach((f) => fd.append("comprovante", f));
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
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="label mb-0">Comprovante de pagamento (opcional)</span>
                  <button
                    type="button"
                    className="btn btn-icon"
                    title="Anexar comprovante (PDF, JPG ou PNG)"
                    aria-label="Anexar comprovante de pagamento"
                    disabled={comprovantes.length >= MAX_ANEXOS}
                    onClick={() => arquivo.current?.click()}
                  >
                    <IconeClipe />
                  </button>
                  <input ref={arquivo} type="file" accept={ACCEPT_ANEXO} multiple className="hidden" onChange={(e) => adicionarComprovantes(e.target.files)} />
                </div>
                {comprovantes.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {comprovantes.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded border border-line bg-paper px-2 py-1 text-xs">
                        <span className="truncate" title={f.name}>{f.name}</span>
                        <button type="button" className="text-red-700 hover:underline" aria-label={`Remover ${f.name}`} onClick={() => { setAviso(""); setComprovantes(comprovantes.filter((_, j) => j !== i)); }}>
                          remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {aviso && <p className="mt-1 text-xs text-red-700">Ignorado: {aviso}.</p>}
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
