"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LancamentoForm } from "@/components/LancamentoForm";

/**
 * Botão "Lançar contas" que abre o formulário de lançamento de contas a pagar num modal.
 * O formulário fica montado enquanto o modal está fechado: com erro no envio, o que foi digitado continua lá;
 * com sucesso, os campos são limpos e o modal fecha. `volta`: tela para onde voltar depois de lançar.
 */
export function LancarContasModal({
  suppliers,
  categories,
  paymentMethods,
  volta,
}: {
  suppliers: string[];
  categories: string[];
  paymentMethods: string[];
  volta: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
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
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Lançar contas
      </button>
      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-7xl rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">Lançar contas a pagar</h2>
                  <p className="text-sm text-muted">
                    Preencha quantas linhas precisar. Linhas em branco são ignoradas. Depois de lançadas, as contas aguardam aprovação.
                  </p>
                </div>
                <button type="button" className="btn btn-icon" aria-label="Fechar" title="Fechar" onClick={() => setOpen(false)}>
                  ×
                </button>
              </div>
              <LancamentoForm
                suppliers={suppliers}
                categories={categories}
                paymentMethods={paymentMethods}
                volta={volta}
                onSucesso={() => setOpen(false)}
              />
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
