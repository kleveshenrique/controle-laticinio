"use client";

import { useState } from "react";
import { aprovar, cancelarAprovacao, rejeitar } from "@/app/actions";
import { MotivoDialog } from "@/components/MotivoDialog";
import { IconeAprovar, IconeCancelar, IconeRejeitar } from "@/components/Icones";
import { BotaoAcao, useAcoesContas } from "@/components/AcoesContas";

/** Aprovar / rejeitar (com motivo) / cancelar (com motivo) uma conta aguardando aprovação. */
export function AcoesAprovacao({
  id,
  code,
  disabled,
  disabledTitle,
  podeCancelar = true,
}: {
  id: string;
  code: number;
  disabled?: boolean;
  disabledTitle?: string;
  /** Falso quando a linha já tem o botão Cancelar de quem lançou/administrador. */
  podeCancelar?: boolean;
}) {
  const [modal, setModal] = useState<"rejeitar" | "cancelar" | null>(null);
  const { ocupado, executar } = useAcoesContas();

  function enviar(chave: string, action: (fd: FormData) => Promise<void>, motivo?: string) {
    const fd = new FormData();
    fd.append("ids", id);
    fd.append("id", id);
    if (motivo) fd.append("motivo", motivo);
    executar(`${chave}-${id}`, () => action(fd));
  }

  return (
    <div className="flex justify-end gap-2">
      <BotaoAcao
        chave={`aprovar-${id}`}
        className="btn btn-primary btn-icon"
        title={disabled && disabledTitle ? disabledTitle : "Aprovar"}
        disabled={disabled}
        onClick={() => enviar("aprovar", aprovar)}
      >
        <IconeAprovar />
      </BotaoAcao>
      <BotaoAcao
        chave={`rejeitar-${id}`}
        className="btn btn-danger btn-icon"
        title={disabled && disabledTitle ? disabledTitle : "Rejeitar"}
        disabled={disabled}
        onClick={() => setModal("rejeitar")}
      >
        <IconeRejeitar />
      </BotaoAcao>
      {podeCancelar && (
        <BotaoAcao
          chave={`cancelar-${id}`}
          className="btn btn-danger btn-icon"
          title="Cancelar conta"
          disabled={disabled}
          onClick={() => setModal("cancelar")}
        >
          <IconeCancelar />
        </BotaoAcao>
      )}
      <MotivoDialog
        open={modal === "rejeitar"}
        title={`Rejeitar conta #${code}`}
        label="Motivo da rejeição"
        confirmLabel="Confirmar rejeição"
        pending={ocupado}
        onClose={() => setModal(null)}
        onConfirm={(motivo) => enviar("rejeitar", rejeitar, motivo)}
      />
      <MotivoDialog
        open={modal === "cancelar"}
        title={`Cancelar conta #${code}`}
        label="Motivo do cancelamento"
        confirmLabel="Confirmar cancelamento"
        pending={ocupado}
        onClose={() => setModal(null)}
        onConfirm={(motivo) => enviar("cancelar", cancelarAprovacao, motivo)}
      />
    </div>
  );
}
