"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { editarConta } from "@/app/actions";
import { AnexosEditor, anexosParaFormData, type AnexoExistente, type NovosAnexos } from "@/components/AnexosEditor";
import { maskMoney, parseMoney } from "@/lib/format";
import { IconeEditar } from "@/components/Icones";
import { BotaoAcao, useAcoesContas } from "@/components/AcoesContas";

type Conta = { id: string; code: number; description: string; supplier: string; category: string; amount: number; dueDate: string; notes: string };
type Dados = Pick<Conta, "description" | "supplier" | "category" | "dueDate" | "notes"> & { amount: string };

const dadosIniciais = (c: Conta): Dados => ({
  description: c.description,
  supplier: c.supplier,
  category: c.category,
  amount: maskMoney(String(Math.round(c.amount * 100))),
  dueDate: c.dueDate,
  notes: c.notes,
});

/** Botão "Editar" de uma conta aguardando aprovação: abre um modal para alterar os dados e os anexos (pedido e boletos). */
export function EditarConta({
  conta,
  anexos,
  suppliers,
  categories,
}: {
  conta: Conta & { status: "PENDENTE" | "REJEITADA" };
  anexos: AnexoExistente[];
  suppliers: string[];
  categories: string[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dados, setDados] = useState<Dados>(() => dadosIniciais(conta));
  const [novos, setNovos] = useState<NovosAnexos>({});
  const [remover, setRemover] = useState<string[]>([]);
  const acoes = useAcoesContas();
  const { ocupado: pending, executar } = acoes;
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDados(dadosIniciais(conta));
      setNovos({});
      setRemover([]);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, mounted, conta]);

  // Mesmas regras validadas no servidor (editarConta).
  const valido =
    dados.description.trim().length >= 2 &&
    dados.supplier.trim().length >= 2 &&
    dados.category.trim().length >= 2 &&
    parseMoney(dados.amount) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(dados.dueDate);
  const set = (k: keyof Dados, v: string) => setDados((d) => ({ ...d, [k]: v }));

  return (
    <>
      <BotaoAcao acoes={acoes} chave={`editar-${conta.id}`} className="btn btn-icon" title="Editar conta" onClick={() => setOpen(true)}>
        <IconeEditar />
      </BotaoAcao>

      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valido || pending) return;
                const fd = new FormData();
                fd.append("id", conta.id);
                fd.append("volta", conta.status);
                (Object.keys(dados) as (keyof Dados)[]).forEach((k) => fd.append(k, dados[k]));
                anexosParaFormData(fd, novos, remover);
                setOpen(false);
                executar(`editar-${conta.id}`, () => editarConta(fd));
              }}
            >
              <div>
                <h2 className="text-base font-semibold">Editar conta #{conta.code}</h2>
                <p className="text-sm text-muted">
                  {conta.status === "REJEITADA"
                    ? "As alterações ficam registradas no histórico da conta. Depois de salvar, use “Reenviar para aprovação”."
                    : "A conta continua aguardando aprovação depois de salva."}
                </p>
              </div>

              <datalist id={`${uid}-forn`}>{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
              <datalist id={`${uid}-cat`}>{categories.map((s) => <option key={s} value={s} />)}</datalist>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`${uid}-desc`}>Descrição</label>
                  <input id={`${uid}-desc`} className="input" value={dados.description} onChange={(e) => set("description", e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="label" htmlFor={`${uid}-sup`}>Fornecedor</label>
                  <input id={`${uid}-sup`} className="input" list={`${uid}-forn`} value={dados.supplier} onChange={(e) => set("supplier", e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor={`${uid}-categ`}>Categoria</label>
                  <input id={`${uid}-categ`} className="input" list={`${uid}-cat`} value={dados.category} onChange={(e) => set("category", e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor={`${uid}-val`}>Valor (R$)</label>
                  <input
                    id={`${uid}-val`}
                    className="input text-right"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={dados.amount}
                    onChange={(e) => set("amount", maskMoney(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`${uid}-venc`}>Vencimento</label>
                  <input id={`${uid}-venc`} className="input" type="date" value={dados.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`${uid}-obs`}>Observações (opcional)</label>
                  <textarea id={`${uid}-obs`} className="input min-h-[60px]" rows={2} maxLength={1000} value={dados.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </div>

              <AnexosEditor
                tipos={["PEDIDO", "BOLETO"]}
                anexos={anexos}
                novos={novos}
                onNovos={setNovos}
                remover={remover}
                onRemover={setRemover}
                podeAlterar={() => true}
                podeRemover={() => true}
              />

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Voltar</button>
                <button type="submit" className="btn btn-primary" disabled={!valido || pending}>Salvar alterações</button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
