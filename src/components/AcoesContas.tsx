"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";

export type Acoes = {
  /** Há alguma ação em andamento na página (todos os botões ficam bloqueados). */
  ocupado: boolean;
  /** Chave do botão que disparou a ação em andamento (é o que mostra o spinner). */
  ativo: string | null;
  executar: (chave: string, acao: () => Promise<void>) => void;
};

const Ctx = createContext<Acoes | null>(null);

/**
 * Coordena as ações da lista de contas (aprovar, rejeitar, editar, cancelar, reenviar):
 * enquanto uma está em andamento, todos os botões ficam desabilitados e o botão
 * clicado mostra um spinner.
 */
export function AcoesContasProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useAcoesLocais()}>{children}</Ctx.Provider>;
}

function useAcoesLocais(): Acoes {
  const [pending, startTransition] = useTransition();
  const [ativo, setAtivo] = useState<string | null>(null);
  const executar = (chave: string, acao: () => Promise<void>) => {
    if (pending) return;
    setAtivo(chave);
    startTransition(() => acao());
  };
  return { ocupado: pending, ativo: pending ? ativo : null, executar };
}

/** Estado compartilhado do <AcoesContasProvider>; fora dele, cada componente controla só os próprios botões. */
export function useAcoesContas(): Acoes {
  const ctx = useContext(Ctx);
  const local = useAcoesLocais();
  return ctx ?? local;
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-90" />
    </svg>
  );
}

/** Botão de ação: desabilitado enquanto qualquer ação roda; mostra spinner no lugar do ícone quando é o botão ativo. */
export function BotaoAcao({
  chave,
  className,
  title,
  disabled,
  onClick,
  children,
  acoes,
}: {
  chave: string;
  className: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Estado retornado por useAcoesContas() no componente pai (necessário fora do provider). */
  acoes?: Acoes;
}) {
  const doContexto = useAcoesContas();
  const { ocupado, ativo } = acoes ?? doContexto;
  const rodando = ativo === chave;
  return (
    <button type="button" className={className} title={title} aria-label={title} aria-busy={rodando} disabled={disabled || ocupado} onClick={onClick}>
      {rodando ? <Spinner /> : children}
    </button>
  );
}

/** Botão que executa uma server action simples com o id da conta (ex.: reenviar, cancelar). */
export function BotaoAcaoConta({
  id,
  chave,
  acao,
  className,
  title,
  children,
}: {
  id: string;
  chave: string;
  acao: (fd: FormData) => Promise<void>;
  className: string;
  title: string;
  children: ReactNode;
}) {
  const { executar } = useAcoesContas();
  return (
    <BotaoAcao
      chave={chave}
      className={className}
      title={title}
      onClick={() => {
        const fd = new FormData();
        fd.append("id", id);
        executar(chave, () => acao(fd));
      }}
    >
      {children}
    </BotaoAcao>
  );
}

/**
 * Aba de filtro que navega para `href`: enquanto a página nova carrega, todos os
 * botões ficam bloqueados e a aba clicada mostra o spinner.
 */
export function AbaAcao({ href, ativa, children }: { href: string; ativa: boolean; children: ReactNode }) {
  const router = useRouter();
  const acoes = useAcoesContas();
  const chave = `aba-${href}`;
  return (
    <button
      type="button"
      className={`btn gap-2 ${ativa ? "btn-primary" : ""}`}
      aria-current={ativa ? "page" : undefined}
      aria-busy={acoes.ativo === chave}
      disabled={acoes.ocupado}
      onClick={() => acoes.executar(chave, async () => router.push(href))}
    >
      {acoes.ativo === chave && <Spinner />}
      {children}
    </button>
  );
}
