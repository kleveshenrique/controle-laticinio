"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { editarOrdemCompra, excluirOrdemCompra } from "@/app/actions";
import { CampoCategoria } from "@/components/CampoCategoria";
import { ConfirmarDialog } from "@/components/ConfirmarDialog";
import { IconeEditar, IconeExcluir } from "@/components/Icones";

const fd = (campos: Record<string, string>) => {
  const f = new FormData();
  Object.entries(campos).forEach(([k, v]) => f.append(k, v));
  return f;
};

/** Botões (com ícone) "Editar ordem de compra" e "Excluir ordem de compra". */
export function EditarExcluirOrdem({
  id,
  code,
  concluida,
  reenviar,
  ordem,
  categorias,
  editar,
  excluir,
  volta,
}: {
  id: string;
  code: number;
  /** Ordem concluída: já gerou contas (a edição e a exclusão também mexem nelas). */
  concluida: boolean;
  /** Ordem rejeitada ou em cotação: ao salvar a edição, volta a aguardar aprovação. */
  reenviar?: boolean;
  ordem: { description: string; category: string; notes: string };
  categorias: string[];
  editar: boolean;
  excluir: boolean;
  /** Lista para onde voltar depois de editar (ex.: "/ordens?status=APROVADA"); sem ela, volta para a própria ordem. */
  volta?: string;
}) {
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

  if (!editar && !excluir) return null;
  const valido = description.trim().length >= 2 && category.trim().length >= 2;
  const comVolta: Record<string, string> = volta ? { volta } : {};

  return (
    <div className="flex justify-end gap-2">
      {editar && (
        <button type="button" className="btn btn-icon" title="Editar ordem de compra" aria-label={`Editar ordem de compra #${code}`} disabled={pending} onClick={() => setEditando(true)}>
          <IconeEditar />
        </button>
      )}
      {excluir && (
        <button type="button" className="btn btn-danger btn-icon" title="Excluir ordem de compra" aria-label={`Excluir ordem de compra #${code}`} disabled={pending} onClick={() => setExcluindo(true)}>
          <IconeExcluir />
        </button>
      )}

      <ConfirmarDialog
        open={excluindo}
        title={`Excluir a ordem de compra #${code}?`}
        confirmLabel="Excluir"
        confirmClassName="btn btn-danger"
        pending={pending}
        onClose={() => setExcluindo(false)}
        onConfirm={() => start(() => excluirOrdemCompra(fd({ id, ...comVolta })))}
      >
        <p>A ordem vai para Canceladas, com o histórico mantido.</p>
        {concluida && (
          <p className="mt-2 text-muted">As contas geradas que ainda não foram pagas também serão canceladas. Se alguma já foi paga, a exclusão não é feita.</p>
        )}
      </ConfirmarDialog>

      {mounted &&
        editar &&
        createPortal(
          <dialog ref={ref} onClose={() => setEditando(false)} className="w-full max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <form
              className="space-y-4 p-5 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valido) return;
                setEditando(false);
                start(() => editarOrdemCompra(fd({ id, description: description.trim(), category: category.trim(), notes: notes.trim(), ...comVolta })));
              }}
            >
              <h2 className="text-base font-semibold">Editar ordem de compra #{code}</h2>
              <div>
                <label className="label">O que será comprado *</label>
                <input className="input" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoria *</label>
                <CampoCategoria opcoes={categorias} value={category} onChange={setCategory} />
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input min-h-[80px]" maxLength={1000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {reenviar && <p className="text-xs text-muted">Ao salvar, a ordem volta automaticamente para aprovação. O histórico e as cotações já incluídas são mantidos.</p>}
              {concluida && <p className="text-xs text-muted">As contas desta ordem que ainda não foram pagas acompanham a nova descrição e categoria.</p>}
              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" className="btn" onClick={() => setEditando(false)}>Voltar</button>
                <button type="submit" className="btn btn-primary" disabled={!valido || pending}>{reenviar ? "Salvar e enviar para aprovação" : "Salvar"}</button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </div>
  );
}
