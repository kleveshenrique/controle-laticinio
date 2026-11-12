"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { editarOrdemCompra, excluirOrdemCompra } from "@/app/actions";
import { CampoBusca } from "@/components/CampoBusca";
import { ConfirmarDialog } from "@/components/ConfirmarDialog";

const fd = (campos: Record<string, string>) => {
  const f = new FormData();
  Object.entries(campos).forEach(([k, v]) => f.append(k, v));
  return f;
};

/** Botões "Alterar" e "Excluir" de uma ordem de compra concluída. */
export function AcoesOrdemConcluida({
  id,
  code,
  ordem,
  categorias,
  alterar,
  excluir,
  compacto,
  volta,
}: {
  id: string;
  code: number;
  ordem: { description: string; category: string; notes: string };
  categorias: string[];
  alterar: boolean;
  excluir: boolean;
  compacto?: boolean;
  /** "lista": depois de alterar volta para a lista de concluídas. */
  volta?: "lista";
}) {
  const tam = compacto ? " px-2 py-0.5 text-xs" : "";
  const [pending, start] = useTransition();
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [description, setDescription] = useState(ordem.description);
  const [category, setCategory] = useState(ordem.category);
  const [notes, setNotes] = useState(ordem.notes);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (editando && !d.open) {
      setDescription(ordem.description);
      setCategory(ordem.category);
      setNotes(ordem.notes);
      d.showModal();
    }
    if (!editando && d.open) d.close();
  }, [editando, mounted, ordem]);

  const valido = description.trim().length >= 2 && category.trim().length >= 2;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {alterar && (
        <button type="button" className={`btn${tam}`} disabled={pending} onClick={() => setEditando(true)}>
          Alterar
        </button>
      )}
      {excluir && (
        <button type="button" className={`btn btn-danger${tam}`} disabled={pending} onClick={() => setExcluindo(true)}>
          Excluir
        </button>
      )}

      <ConfirmarDialog
        open={excluindo}
        title={`Excluir a ordem de compra #${code}?`}
        confirmLabel="Excluir"
        confirmClassName="btn btn-danger"
        pending={pending}
        onClose={() => setExcluindo(false)}
        onConfirm={() => start(() => excluirOrdemCompra(fd({ id })))}
      >
        <p>A ordem vai para Canceladas, com o histórico mantido.</p>
        <p className="mt-2 text-muted">As contas geradas que ainda não foram pagas também serão canceladas. Se alguma já foi paga, a exclusão não é feita.</p>
      </ConfirmarDialog>

      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setEditando(false)} className="w-full max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valido) return;
                setEditando(false);
                start(() =>
                  editarOrdemCompra(fd({ id, description: description.trim(), category: category.trim(), notes: notes.trim(), ...(volta ? { volta } : {}) })),
                );
              }}
            >
              <h2 className="text-base font-semibold">Alterar ordem de compra #{code}</h2>
              <div>
                <label className="label">O que será comprado *</label>
                <input className="input" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoria *</label>
                <CampoBusca placeholder="Buscar categoria" opcoes={categorias} value={category} onChange={setCategory} vazio="Nenhuma categoria ativa encontrada." />
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input min-h-[80px]" maxLength={1000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <p className="text-xs text-muted">As contas desta ordem que ainda não foram pagas acompanham a nova descrição e categoria.</p>
              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" className="btn" onClick={() => setEditando(false)}>Voltar</button>
                <button type="submit" className="btn btn-primary" disabled={!valido || pending}>Salvar</button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </div>
  );
}
