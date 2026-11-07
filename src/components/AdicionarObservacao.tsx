"use client";

import { useState, useTransition } from "react";
import { adicionarObservacao } from "@/app/actions";
import { MotivoDialog } from "@/components/MotivoDialog";
import { IconeObservacao } from "@/components/Icones";

/** Botão que grava mais uma observação na conta (tela Pagamentos). */
export function AdicionarObservacao({ id, code }: { id: string; code: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-icon"
        title="Adicionar observação"
        aria-label="Adicionar observação"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <IconeObservacao />
      </button>
      <MotivoDialog
        open={open}
        title={`Observação na conta #${code}`}
        label="Observação"
        placeholder="Escreva a observação"
        confirmLabel="Gravar observação"
        confirmClassName="btn btn-primary"
        pending={pending}
        onClose={() => setOpen(false)}
        onConfirm={(texto) => {
          const fd = new FormData();
          fd.append("id", id);
          fd.append("texto", texto);
          startTransition(() => adicionarObservacao(fd));
        }}
      />
    </>
  );
}
