"use client";

import { useState, useTransition } from "react";
import { excluirOrdemCanceladaDefinitivo } from "@/app/actions";
import { ConfirmarDialog } from "@/components/ConfirmarDialog";
import { IconeExcluir } from "@/components/Icones";

/** Botão "Excluir" de uma ordem cancelada: pede confirmação e exclui definitivamente. */
export function ExcluirOrdemCancelada({ id, code, descricao }: { id: string; code: number; descricao: string }) {
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-danger btn-icon"
        title="Excluir ordem de compra"
        aria-label={`Excluir ordem de compra #${code}`}
        disabled={pending}
        onClick={() => setAberto(true)}
      >
        <IconeExcluir />
      </button>
      <ConfirmarDialog
        open={aberto}
        title={`Excluir a ordem de compra #${code}?`}
        confirmLabel="Sim, excluir"
        confirmClassName="btn btn-danger"
        pending={pending}
        onClose={() => setAberto(false)}
        onConfirm={() => {
          const fd = new FormData();
          fd.append("id", id);
          start(() => excluirOrdemCanceladaDefinitivo(fd));
        }}
      >
        <p className="text-muted">{descricao}</p>
        <p className="mt-2">
          <strong className="text-red-700">A exclusão é definitiva:</strong> a ordem, o histórico, as cotações e os anexos delas serão apagados e não
          poderão ser recuperados.
        </p>
      </ConfirmarDialog>
    </>
  );
}
