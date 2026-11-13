"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NovaCotacao } from "@/components/NovaCotacao";

/** Botão "Incluir nova cotação": abre o formulário de cotação da ordem num modal. */
export function IncluirCotacao({
  purchaseOrderId,
  code,
  fornecedores,
  formas,
  volta,
}: {
  purchaseOrderId: string;
  code: number;
  fornecedores: string[];
  formas: string[];
  /** Tela para onde voltar depois de incluir (ex.: "/ordens?status=APROVADA"). */
  volta?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Recria o formulário a cada abertura, para começar limpo.
  const [versao, setVersao] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open, mounted]);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary px-2 py-0.5 text-xs"
        onClick={() => {
          setVersao((v) => v + 1);
          setOpen(true);
        }}
      >
        Incluir nova cotação
      </button>
      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-2xl rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-base font-semibold">Incluir cotação · ordem de compra #{code}</h2>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setOpen(false)}>Voltar</button>
              </div>
              {open && (
                <NovaCotacao
                  key={versao}
                  purchaseOrderId={purchaseOrderId}
                  fornecedores={fornecedores}
                  formas={formas}
                  volta={volta}
                  onEnviar={() => setOpen(false)}
                />
              )}
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
