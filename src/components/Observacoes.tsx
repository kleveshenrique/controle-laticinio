import type { ReactNode } from "react";
import { dateTimeBR, type AlteracaoConta } from "@/lib/format";

type Nota = { id: string; text: string; createdAt: Date; user: { name: string } };
type Rejeicao = { id: string; createdAt: Date; reason: string; user: { name: string } };
type Edicao = { id: string; createdAt: Date; changes: unknown; user: { name: string } };

type Item =
  | { tipo: "observacao"; key: string; data: Date; autor: string; texto: string }
  | { tipo: "rejeicao"; key: string; data: Date; autor: string; texto: string }
  | { tipo: "alteracao"; key: string; data: Date; autor: string; changes: AlteracaoConta[] };

const ESTILO: Record<Item["tipo"], { rotulo: string; cls: string }> = {
  observacao: { rotulo: "Observação", cls: "border-red-400 text-red-700" },
  rejeicao: { rotulo: "Rejeição", cls: "border-orange-400 text-orange-800" },
  alteracao: { rotulo: "Alteração", cls: "border-sky-400 text-sky-900" },
};

/**
 * Conta e sua linha do tempo. No topo, um quadro com os dados da conta
 * (`conta`), quem lançou, quando e a observação do lançamento; abaixo, as
 * observações gravadas em Pagamentos, rejeições e alterações, do mais antigo
 * para o mais recente, uma linha por item, com barra vertical colorida, tipo,
 * autor e data.
 */
export function Observacoes({
  conta,
  notes,
  autor,
  extras = [],
  rejeicoes = [],
  edicoes = [],
  className = "mt-1",
}: {
  conta?: ReactNode;
  notes?: string | null;
  autor?: { name: string; createdAt: Date };
  extras?: Nota[];
  rejeicoes?: Rejeicao[];
  edicoes?: Edicao[];
  className?: string;
}) {
  const original = notes?.trim();
  const itens: Item[] = [
    ...extras.map((n) => ({ tipo: "observacao" as const, key: `o-${n.id}`, data: n.createdAt, autor: n.user.name, texto: n.text })),
    ...rejeicoes.map((r) => ({ tipo: "rejeicao" as const, key: `r-${r.id}`, data: r.createdAt, autor: r.user.name, texto: `Motivo: ${r.reason}` })),
    ...edicoes.map((e) => ({
      tipo: "alteracao" as const,
      key: `e-${e.id}`,
      data: e.createdAt,
      autor: e.user.name,
      changes: Array.isArray(e.changes) ? (e.changes as AlteracaoConta[]) : [],
    })),
  ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  if (!itens.length && !original && !autor && !conta) return null;

  return (
    <div className={`${className} space-y-1 break-words text-xs`}>
      {/* Quadro do topo: dados da conta, quem lançou, quando e a observação do lançamento. */}
      {(conta || autor || original) && (
        <div className="space-y-0.5 rounded-md border border-gray-200 bg-gray-50 p-2">
          {conta}
          {autor && (
            <div className="font-medium text-muted">
              Lançada por {autor.name} em {dateTimeBR(autor.createdAt)}
            </div>
          )}
          {original && (
            <div className="whitespace-pre-line text-muted">
              <span className="font-medium">Obs.:</span> <span className="italic">{original}</span>
            </div>
          )}
        </div>
      )}
      {itens.map((i) => (
        <div key={i.key} className={`border-l-2 pl-2 ${ESTILO[i.tipo].cls}`}>
          <span className="font-medium">
            {ESTILO[i.tipo].rotulo}
            {i.autor && <> · {i.autor} · {dateTimeBR(i.data)}</>}
          </span>
          {" — "}
          {i.tipo === "alteracao" ? (
            i.changes.map((c, k) => (
              <span key={k}>
                {k > 0 && "; "}
                <span className="font-medium">{c.campo}:</span>{" "}
                {c.de && c.para ? (
                  <>
                    <span className="line-through opacity-70">{c.de}</span> → {c.para}
                  </>
                ) : (
                  c.para || c.de
                )}
              </span>
            ))
          ) : (
            <span className="whitespace-pre-line italic">{i.texto}</span>
          )}
        </div>
      ))}
    </div>
  );
}
