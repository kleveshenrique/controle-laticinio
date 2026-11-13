"use client";

import { useState, useTransition, type ReactNode } from "react";
import { aprovarCotacao, aprovarOrdemCompra, cancelarAprovacaoCotacao, cancelarRejeicaoOrdem, excluirCotacao, rejeitarOrdemCompra } from "@/app/actions";
import { MotivoDialog } from "@/components/MotivoDialog";
import { ConfirmarDialog } from "@/components/ConfirmarDialog";
import { IconeAprovar, IconeExcluir, IconeRejeitar } from "@/components/Icones";

const fd = (campos: Record<string, string>) => {
  const f = new FormData();
  Object.entries(campos).forEach(([k, v]) => f.append(k, v));
  return f;
};

/**
 * Aprovar / rejeitar (com motivo) uma ordem de compra, ou desfazer a rejeição.
 * `volta`: tela para onde voltar depois de aprovar/rejeitar (ex.: "/contas?status=PENDENTE"); sem ela, fica na ordem.
 */
export function AcoesOrdem({ id, code, aprovar, desfazerRejeicao, compacto, volta }: { id: string; code: number; aprovar: boolean; desfazerRejeicao?: boolean; compacto?: boolean; volta?: string }) {
  const comVolta: Record<string, string> = volta ? { volta } : {};
  const tam = compacto ? " px-2 py-0.5 text-xs" : "";
  const [pending, start] = useTransition();
  const [rejeitando, setRejeitando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {aprovar && (
        <>
          <button
            type="button"
            className="btn btn-primary btn-icon"
            title="Aprovar ordem"
            aria-label={`Aprovar ordem de compra #${code}`}
            disabled={pending}
            onClick={() => start(() => aprovarOrdemCompra(fd({ id, ...comVolta })))}
          >
            <IconeAprovar />
          </button>
          <button
            type="button"
            className="btn btn-danger btn-icon"
            title="Rejeitar ordem"
            aria-label={`Rejeitar ordem de compra #${code}`}
            disabled={pending}
            onClick={() => setRejeitando(true)}
          >
            <IconeRejeitar />
          </button>
          <MotivoDialog
            open={rejeitando}
            title={`Rejeitar ordem de compra #${code}`}
            label="Motivo da rejeição"
            confirmLabel="Rejeitar"
            pending={pending}
            onClose={() => setRejeitando(false)}
            onConfirm={(motivo) => start(() => rejeitarOrdemCompra(fd({ id, motivo, ...comVolta })))}
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
    </div>
  );
}

/**
 * Aprovar ou excluir uma cotação (com confirmação). `editar` (opcional) aparece entre os dois botões.
 * `volta`: tela para onde voltar depois de aprovar (ex.: "/contas?status=PENDENTE"); sem ela, vai para as ordens concluídas.
 */
export function AcoesCotacao({ id, fornecedor, valor, aprovar, excluir, editar, volta }: { id: string; fornecedor: string; valor: string; aprovar: boolean; excluir: boolean; editar?: ReactNode; volta?: string }) {
  const [pending, start] = useTransition();
  const [aprovando, setAprovando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {aprovar && (
        <button
          type="button"
          className="btn btn-primary btn-icon"
          title="Aprovar cotação"
          aria-label={`Aprovar cotação ${fornecedor}`}
          disabled={pending}
          onClick={() => setAprovando(true)}
        >
          <IconeAprovar />
        </button>
      )}
      {editar}
      {excluir && (
        <button
          type="button"
          className="btn btn-danger btn-icon"
          title="Excluir cotação"
          aria-label={`Excluir cotação ${fornecedor}`}
          disabled={pending}
          onClick={() => setExcluindo(true)}
        >
          <IconeExcluir />
        </button>
      )}
      <ConfirmarDialog
        open={aprovando}
        title="Aprovar esta cotação?"
        confirmLabel="Aprovar cotação"
        pending={pending}
        onClose={() => setAprovando(false)}
        onConfirm={() => start(() => aprovarCotacao(fd(volta ? { id, volta } : { id })))}
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

/**
 * "Reabrir cotação" da ordem concluída (cancela a aprovação da cotação, pede o motivo): a ordem volta para cotação e outra pode ser aprovada.
 * Com `bloqueio` (ex.: conta já paga), o botão aparece desabilitado com a explicação.
 */
export function CancelarAprovacaoCotacao({ id, fornecedor, valor, bloqueio, compacto }: { id: string; fornecedor: string; valor: string; bloqueio?: string; compacto?: boolean }) {
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  return (
    <div className="flex justify-end">
      <button
        type="button"
        className={`btn${compacto ? " px-2 py-0.5 text-xs" : ""}`}
        title={bloqueio ?? "Reabrir cotação"}
        aria-label={`Reabrir cotação (${fornecedor})`}
        disabled={pending || !!bloqueio}
        onClick={() => setAberto(true)}
      >
        Reabrir cotação
      </button>
      <MotivoDialog
        open={aberto}
        title={`Reabrir cotação: ${fornecedor} · ${valor}`}
        label="Motivo da reabertura"
        confirmLabel="Reabrir cotação"
        pending={pending}
        onClose={() => setAberto(false)}
        onConfirm={(motivo) => start(() => cancelarAprovacaoCotacao(fd({ id, motivo })))}
        placeholder="Ex.: fornecedor não consegue entregar no prazo"
      />
    </div>
  );
}
