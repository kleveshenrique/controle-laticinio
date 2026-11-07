"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Minúsculas e sem acentos. */
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const digitos = (s: string) => s.replace(/\D/g, "");

export type ItemLista = {
  id: string;
  /** Texto pesquisável (nome, cidade…). */
  busca: string;
  /** Documento só com dígitos (CNPJ/CPF), comparado com os dígitos digitados. */
  documento?: string;
  /** Linha já renderizada no servidor. */
  node: React.ReactNode;
};

/**
 * Abas de situação + campo de busca + lista filtrada enquanto se digita (sem recarregar a página).
 * A lista começa vazia; "*" mostra todos da aba. A busca fica na URL (?q=) para sobreviver à troca de aba.
 */
export function ListaFiltrada({
  base,
  abas,
  situacao,
  dica,
  placeholder,
  itens,
  semBusca,
  semResultado,
  tabela,
}: {
  base: string;
  abas: [string, string][];
  situacao: string;
  dica: string;
  placeholder: string;
  itens: ItemLista[];
  semBusca: string;
  semResultado: string;
  /** Lista em tabela: cabeçalho e nº de colunas (para a mensagem de vazio). Sem isso, lista em cartão. */
  tabela?: { thead: React.ReactNode; colunas: number };
}) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const filtrados = useMemo(() => {
    const t = normalizar(q);
    if (!t) return [];
    if (t === "*") return itens;
    const d = digitos(q);
    return itens.filter((i) => normalizar(i.busca).includes(t) || (d && i.documento?.includes(d)));
  }, [q, itens]);

  const atualizarUrl = (v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v.trim()) p.set("q", v.trim());
    else p.delete("q");
    window.history.replaceState(null, "", `${base}?${p.toString()}`);
  };

  const mensagem = q.trim() ? (filtrados.length ? null : semResultado) : semBusca;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {abas.map(([k, label]) => (
          <Link
            key={k}
            href={`${base}?situacao=${k}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`}
            className={`btn ${situacao === k ? "btn-primary" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="card mb-4 p-3">
        <p className="mb-2 text-xs text-muted">{dica}</p>
        <input
          className="input"
          placeholder={placeholder}
          value={q}
          autoFocus
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value);
            atualizarUrl(e.target.value);
          }}
        />
      </div>

      {tabela ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            {tabela.thead}
            <tbody>
              {filtrados.map((i) => <Fragment key={i.id}>{i.node}</Fragment>)}
              {mensagem && (
                <tr><td colSpan={tabela.colunas} className="td py-6 text-center text-muted">{mensagem}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {filtrados.map((i) => <Fragment key={i.id}>{i.node}</Fragment>)}
          {mensagem && <p className="p-6 text-center text-sm text-muted">{mensagem}</p>}
        </div>
      )}
    </>
  );
}
