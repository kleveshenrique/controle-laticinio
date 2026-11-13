"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NovaCotacao, type CotacaoInicial } from "@/components/NovaCotacao";
import { IconeEditar } from "@/components/Icones";

/** Botão "Editar" de uma cotação em análise: abre o formulário da cotação num modal, com os valores gravados. */
export function EditarCotacao({
  purchaseOrderId,
  cotacao,
  fornecedores,
  formas,
  volta,
}: {
  purchaseOrderId: string;
  cotacao: CotacaoInicial;
  fornecedores: string[];
  formas: string[];
  /** Tela para onde voltar depois de salvar (ex.: "/ordens?status=APROVADA"); sem ela, a tela da ordem. */
  volta?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Recria o formulário a cada abertura, para começar com os valores gravados.
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
        className="btn btn-icon"
        title="Alterar cotação"
        aria-label="Alterar cotação"
        onClick={() => {
          setVersao((v) => v + 1);
          setOpen(true);
        }}
      >
        <IconeEditar />
      </button>
      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-2xl rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-base font-semibold">Alterar cotação</h2>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setOpen(false)}>Voltar</button>
              </div>
              {open && (
                <NovaCotacao
                  key={versao}
                  purchaseOrderId={purchaseOrderId}
                  fornecedores={fornecedores}
                  formas={formas}
                  cotacao={cotacao}
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
