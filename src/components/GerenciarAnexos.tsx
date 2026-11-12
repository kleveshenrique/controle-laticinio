"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gerenciarAnexos } from "@/app/actions";
import { AnexosEditor, alterouAnexos, anexosParaFormData, type AnexoExistente, type NovosAnexos } from "@/components/AnexosEditor";
import { BotaoAcao, useAcoesContas } from "@/components/AcoesContas";
import { motivoNaoAnexa, podeAnexar } from "@/lib/anexos";

/**
 * Botão "Anexar" de uma conta aprovada/paga: abre um modal para incluir nota fiscal e boletos.
 * O pedido só pode ser alterado (e arquivos só podem ser removidos) pelo administrador.
 */
export function GerenciarAnexos({
  id,
  code,
  status,
  anexos,
  admin,
  volta,
  primeiraParcela = true,
}: {
  /** Conta sem parcelamento ou 1ª parcela: só nela a nota fiscal pode ser anexada. */
  primeiraParcela?: boolean;
  id: string;
  code: number;
  status: "APROVADA" | "PAGA";
  anexos: AnexoExistente[];
  admin: boolean;
  /** Tela para onde voltar depois de salvar. Padrão: aba da situação em Contas. */
  volta?: "PAGAMENTOS";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [novos, setNovos] = useState<NovosAnexos>({});
  const [remover, setRemover] = useState<string[]>([]);
  const acoes = useAcoesContas();
  const pending = acoes.ocupado;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setNovos({});
      setRemover([]);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, mounted]);

  const alterou = alterouAnexos(novos, remover);

  return (
    <>
      <BotaoAcao acoes={acoes} chave={`anexos-${id}`} className="btn px-2 py-0.5 text-xs" title="Gerenciar anexos" onClick={() => setOpen(true)}>
        Anexar
      </BotaoAcao>

      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!alterou) return;
                const fd = new FormData();
                fd.append("id", id);
                fd.append("volta", volta ?? status);
                anexosParaFormData(fd, novos, remover);
                setOpen(false);
                acoes.executar(`anexos-${id}`, () => gerenciarAnexos(fd));
              }}
            >
              <div>
                <h2 className="text-base font-semibold">Anexos da conta #{code}</h2>
                <p className="text-sm text-muted">
                  {status === "APROVADA"
                    ? primeiraParcela
                      ? "Inclua a nota fiscal e o boleto, se necessário."
                      : "Inclua o boleto desta parcela, se necessário. A nota fiscal é anexada na 1ª parcela."
                    : "Inclua a nota fiscal e o boleto, se necessário."}
                </p>
              </div>

              <AnexosEditor
                tipos={status === "PAGA" ? ["PEDIDO", "NOTA_FISCAL", "BOLETO", "COMPROVANTE"] : ["PEDIDO", "NOTA_FISCAL", "BOLETO"]}
                limites={{ BOLETO: 1 }}
                anexos={anexos}
                novos={novos}
                onNovos={setNovos}
                remover={remover}
                onRemover={setRemover}
                podeAlterar={(k) => podeAnexar(k, { status, admin, primeiraParcela })}
                podeRemover={() => admin}
                motivoBloqueio={(k) => motivoNaoAnexa(k, { status, primeiraParcela })}
              />

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Voltar</button>
                <button type="submit" className="btn btn-primary" disabled={!alterou || pending}>Salvar anexos</button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
