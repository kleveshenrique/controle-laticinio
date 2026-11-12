"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cadastrarCategoriaRapido } from "@/app/actions";
import { FornecedorForm } from "@/components/FornecedorForm";
import { SubmitButton } from "@/components/SubmitButton";
import { toast } from "@/components/Toast";

export type TipoCadastro = "fornecedor" | "categoria";

/**
 * Modal de cadastro de fornecedor ou categoria aberto pelo lançamento de contas (botões "+").
 * Renderizado no <body> para não ficar dentro do <form> do lançamento. Ao salvar, devolve o nome cadastrado.
 */
export function CadastroRapido({
  tipo,
  onClose,
  onSalvo,
}: {
  /** null = fechado. */
  tipo: TipoCadastro | null;
  onClose: () => void;
  onSalvo: (tipo: TipoCadastro, nome: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (tipo && !d.open) d.showModal();
    if (!tipo && d.open) d.close();
  }, [tipo, mounted]);

  if (!mounted) return null;
  const salvo = (nome: string) => {
    if (tipo) onSalvo(tipo, nome);
    onClose();
  };

  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      // No React, eventos do portal sobem até o <form> do lançamento: impede que salvar aqui envie as contas.
      onSubmit={(e) => e.stopPropagation()}
      className={`w-full rounded-lg p-0 shadow-xl backdrop:bg-black/40 ${tipo === "fornecedor" ? "max-w-3xl" : "max-w-md"}`}
    >
      {tipo && (
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">{tipo === "fornecedor" ? "Novo fornecedor" : "Nova categoria"}</h2>
              <p className="text-sm text-muted">
                {tipo === "fornecedor"
                  ? "Com CNPJ, os dados são buscados na Receita Federal. Ao salvar, o fornecedor já fica selecionado."
                  : "Ao salvar, a categoria já fica selecionada."}
              </p>
            </div>
            <button type="button" className="btn btn-icon" aria-label="Fechar" title="Fechar" onClick={onClose}>
              ×
            </button>
          </div>
          {/* key: formulário limpo a cada abertura. */}
          {tipo === "fornecedor" ? (
            <FornecedorForm key="fornecedor" onSalvo={salvo} onCancelar={onClose} />
          ) : (
            <CategoriaRapida key="categoria" onSalvo={salvo} onCancelar={onClose} />
          )}
        </div>
      )}
    </dialog>,
    document.body,
  );
}

function CategoriaRapida({ onSalvo, onCancelar }: { onSalvo: (nome: string) => void; onCancelar: () => void }) {
  const id = useId();
  return (
    <form
      className="space-y-4"
      action={async (fd: FormData) => {
        const r = await cadastrarCategoriaRapido(fd);
        if (r.ok) {
          toast("ok", `Categoria "${r.nome}" cadastrada.`);
          onSalvo(r.nome);
        } else toast("erro", r.erro);
      }}
    >
      <div>
        <label className="label" htmlFor={id}>Nome *</label>
        <input id={id} name="name" className="input" required minLength={2} maxLength={100} autoFocus />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>
        <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
      </div>
    </form>
  );
}
