"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { excluirAprovada } from "@/app/actions";
import { BotaoAcao, useAcoesContas } from "@/components/AcoesContas";
import { IconeExcluir } from "@/components/Icones";

/** Botão "Excluir" de uma parcela/conta aprovada: pede confirmação e, se confirmado, exclui e apaga o boleto do S3. */
export function ExcluirAprovada({
  id,
  code,
  descricao,
  temBoleto,
  apagaNotaFiscal = false,
}: {
  id: string;
  code: number;
  descricao: string;
  temBoleto: boolean;
  /** Última parcela da conta: a nota fiscal também é apagada do armazenamento. */
  apagaNotaFiscal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const acoes = useAcoesContas();
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
      <BotaoAcao acoes={acoes} chave={`excluir-${id}`} className="btn btn-danger btn-icon" title="Excluir parcela" onClick={() => setOpen(true)}>
        <IconeExcluir />
      </BotaoAcao>
      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-md rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <div className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-semibold">Excluir conta #{code}?</h2>
                <p className="mt-1 text-sm text-muted">{descricao}</p>
              </div>
              <p className="text-sm">
                Ela sai de Aprovadas e Pagamentos e fica em Canceladas, com o registro de quem excluiu.
                {(temBoleto || apagaNotaFiscal) && (
                  <strong className="block pt-1 text-red-700">
                    {temBoleto && apagaNotaFiscal
                      ? "O boleto e a nota fiscal serão apagados definitivamente do armazenamento"
                      : temBoleto
                        ? "O boleto será apagado definitivamente do armazenamento"
                        : "A nota fiscal será apagada definitivamente do armazenamento"}
                    {apagaNotaFiscal ? " (é a última parcela desta conta)." : "."}
                  </strong>
                )}
              </p>
              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Voltar</button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={acoes.ocupado}
                  onClick={() => {
                    const fd = new FormData();
                    fd.append("id", id);
                    setOpen(false);
                    acoes.executar(`excluir-${id}`, () => excluirAprovada(fd));
                  }}
                >
                  Sim, excluir
                </button>
              </div>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
