"use client";

import { useState, useTransition } from "react";
import { aprovarCotacao, aprovarOrdemCompra, cancelarOrdemCompra, cancelarRejeicaoOrdem, excluirCotacao, rejeitarOrdemCompra } from "@/app/actions";
import { MotivoDialog } from "@/components/MotivoDialog";
import { ConfirmarDialog } from "@/components/ConfirmarDialog";

const fd = (campos: Record<string, string>) => {
  const f = new FormData();
  Object.entries(campos).forEach(([k, v]) => f.append(k, v));
  return f;
};

/** Aprovar / rejeitar (com motivo) / cancelar uma ordem de compra. */
export function AcoesOrdem({ id, code, aprovar, cancelar, desfazerRejeicao, compacto }: { id: string; code: number; aprovar: boolean; cancelar: boolean; desfazerRejeicao?: boolean; compacto?: boolean }) {
  const tam = compacto ? " px-2 py-0.5 text-xs" : "";
  const [pending, start] = useTransition();
  const [rejeitando, setRejeitando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {aprovar && (
        <>
          <button type="button" className={`btn btn-primary${tam}`} disabled={pending} onClick={() => start(() => aprovarOrdemCompra(fd({ id })))}>
            Aprovar ordem
          </button>
          <button type="button" className={`btn btn-danger${tam}`} disabled={pending} onClick={() => setRejeitando(true)}>
            Rejeitar
          </button>
          <MotivoDialog
            open={rejeitando}
            title={`Rejeitar ordem de compra #${code}`}
            label="Motivo da rejeição"
            confirmLabel="Rejeitar"
            pending={pending}
            onClose={() => setRejeitando(false)}
            onConfirm={(motivo) => start(() => rejeitarOrdemCompra(fd({ id, motivo })))}
          />
        </>
      )}
      {desfazerRejeicao && (
        <button
          type="button"
          className={`btn${tam}`}
          disabled={pending}
          onClick={() => setDesfazendo(true)}
        >
          Cancelar rejeição
        </button>
      )}
      <ConfirmarDialog
        open={desfazendo}
        title={`Cancelar a rejeição da ordem de compra #${code}?`}
        confirmLabel="Cancelar rejeição"
        pending={pending}
        onClose={() => setDesfazendo(false)}
        onConfirm={() => start(() => cancelarRejeicaoOrdem(fd({ id })))}
      >
        A ordem volta a aguardar aprovação. A rejeição continua registrada no histórico (balão Obs).
      </ConfirmarDialog>
      {cancelar && (
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => confirm(`Cancelar a ordem de compra #${code}?`) && start(() => cancelarOrdemCompra(fd({ id })))}
        >
          Cancelar ordem
        </button>
      )}
    </div>
  );
}

/** Aprovar ou excluir uma cotação (com confirmação). */
export function AcoesCotacao({ id, fornecedor, valor, aprovar, excluir }: { id: string; fornecedor: string; valor: string; aprovar: boolean; excluir: boolean }) {
  const [pending, start] = useTransition();
  const [aprovando, setAprovando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {aprovar && (
        <button
          type="button"
          className="btn btn-primary px-2 py-0.5 text-xs"
          disabled={pending}
          onClick={() => setAprovando(true)}
        >
          Aprovar cotação
        </button>
      )}
      {excluir && (
        <button
          type="button"
          className="btn btn-danger px-2 py-0.5 text-xs"
          disabled={pending}
          onClick={() => setExcluindo(true)}
        >
          Excluir
        </button>
      )}
      <ConfirmarDialog
        open={aprovando}
        title="Aprovar esta cotação?"
        confirmLabel="Aprovar cotação"
        pending={pending}
        onClose={() => setAprovando(false)}
        onConfirm={() => start(() => aprovarCotacao(fd({ id })))}
      >
        <p><strong>{fornecedor}</strong> · {valor}</p>
        <p className="mt-2 text-muted">A ordem de compra será concluída, as demais cotações serão descartadas e a conta irá direto para Pagamentos.</p>
      </ConfirmarDialog>
      <ConfirmarDialog
        open={excluindo}
        title="Excluir esta cotação?"
        confirmLabel="Excluir"
        confirmClassName="btn btn-danger"
        pending={pending}
        onClose={() => setExcluindo(false)}
        onConfirm={() => start(() => excluirCotacao(fd({ id })))}
      >
        <p><strong>{fornecedor}</strong> · {valor}</p>
        <p className="mt-2 text-muted">A cotação e os arquivos anexados serão apagados.</p>
      </ConfirmarDialog>
    </div>
  );
}
