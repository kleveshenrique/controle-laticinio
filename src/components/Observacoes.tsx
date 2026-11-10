import type { ReactNode } from "react";
import { ObsRecolhivel } from "@/components/ObsRecolhivel";
import { brl, dateBR, dateTimeBR, lerParcelas, type AlteracaoConta } from "@/lib/format";

type Nota = { id: string; text: string; createdAt: Date; user: { name: string } };
type Rejeicao = { id: string; createdAt: Date; reason: string; user: { name: string } };
type Edicao = { id: string; createdAt: Date; changes: unknown; user: { name: string } };
/** Registro da situação da conta (aprovada, cancelada, paga…) mostrado na mesma lista das observações. */
export type EventoConta = { key: string; data: Date; rotulo: string; autor: string; texto?: string; cls: string };

type Item =
  | { tipo: "observacao"; key: string; data: Date; autor: string; texto: string }
  | { tipo: "rejeicao"; key: string; data: Date; autor: string; texto: string }
  | { tipo: "alteracao"; key: string; data: Date; autor: string; changes: AlteracaoConta[] }
  | ({ tipo: "evento" } & EventoConta);

const ESTILO: Record<Exclude<Item["tipo"], "evento">, { rotulo: string; cls: string }> = {
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
  parcelas,
  recolher = false,
  conteudoObs,
  rotuloObs,
  eventos = [],
  aoLadoObs,
}: {
  /** Mostrado dentro do card, na mesma linha do botão "Obs" (ex.: anexos). */
  aoLadoObs?: ReactNode;
  /** Aprovação, cancelamento, pagamento… entram na lista junto das observações, por data. */
  eventos?: EventoConta[];
  /** Conteúdo extra mostrado junto das observações (ex.: parcelas de uma conta aprovada, com seus anexos). */
  conteudoObs?: ReactNode;
  /** Resumo exibido no botão "Obs" (ex.: "parcelado 3x"). */
  rotuloObs?: string;
  /** Esconde observação, parcelas e histórico atrás de um botão "Obs" (ex.: na aba Aprovar). */
  recolher?: boolean;
  conta?: ReactNode;
  notes?: string | null;
  /** Campo Account.parcelas (conta parcelada aguardando aprovação). */
  parcelas?: unknown;
  autor?: { name: string; createdAt: Date };
  extras?: Nota[];
  rejeicoes?: Rejeicao[];
  edicoes?: Edicao[];
  className?: string;
}) {
  const original = notes?.trim();
  const listaParcelas = lerParcelas(parcelas);
  const itens: Item[] = [
    // A observação do lançamento entra na mesma lista das demais, como a primeira (data do lançamento).
    ...(original
      ? [{ tipo: "observacao" as const, key: "o-lancamento", data: autor?.createdAt ?? new Date(0), autor: autor?.name ?? "", texto: original }]
      : []),
    ...eventos.map((e) => ({ ...e, tipo: "evento" as const })),
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
  if (!itens.length && !original && !autor && !conta && listaParcelas.length < 2 && !conteudoObs && !aoLadoObs) return null;

  const parcelado = listaParcelas.length > 1;
  const temObs = Boolean(original) || parcelado || itens.length > 0 || Boolean(conteudoObs);
  const recolhido = recolher && temObs;

  // Observação do lançamento e parcelas (ficam no quadro do topo ou, recolhidas, dentro do "Obs").
  const obsLancamento = parcelado && (
    <>
          {listaParcelas.length > 1 && (
            <div className="text-muted">
              <span className="font-medium">Parcelado em {listaParcelas.length}x</span>
              <span className="text-muted"> (vira uma conta por parcela ao aprovar)</span>
              <ul className="mt-0.5 grid gap-x-4 sm:grid-cols-2">
                {listaParcelas.map((p, k) => (
                  <li key={k}>
                    {k + 1}/{listaParcelas.length} · {brl(p.amount)} · vence {dateBR(new Date(p.dueDate + "T00:00:00.000Z"))}
                  </li>
                ))}
              </ul>
            </div>
          )}
    </>
  );

  const historico = itens.map((i) => (
        <div key={i.key} className={`border-l-2 pl-2 ${i.tipo === "evento" ? i.cls : ESTILO[i.tipo].cls}`}>
          <span className="font-medium">
            {i.tipo === "evento" ? i.rotulo : ESTILO[i.tipo].rotulo}
            {i.autor && <> · {i.autor} · {dateTimeBR(i.data)}</>}
          </span>
          {i.tipo === "evento" ? (
            i.texto && <> — <span className="whitespace-pre-line">{i.texto}</span></>
          ) : i.tipo === "alteracao" ? (
            <>
              {" — "}
              {i.changes.map((c, k) => (
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
              ))}
            </>
          ) : (
            <>
              {" — "}
              <span className="whitespace-pre-line italic">{i.texto}</span>
            </>
          )}
        </div>
  ));

  return (
    <div className={`${className} space-y-1 break-words text-xs`}>
      {/* Quadro do topo: dados da conta, quem lançou, quando, a observação do lançamento e as parcelas. */}
      {(conta || autor || obsLancamento || recolhido || aoLadoObs) && (
        <div className="space-y-0.5 rounded-md border border-gray-200 bg-gray-50 p-2">
          {conta}
          {autor && (
            <div className="font-medium text-muted">
              Lançada por {autor.name} em {dateTimeBR(autor.createdAt)}
            </div>
          )}
          {recolhido ? (
            // Botão com o balão de mensagem dentro do card: mostra/esconde observação, parcelas e histórico.
            // `aoLadoObs` (ex.: anexos) fica na mesma linha do botão.
            <ObsRecolhivel
              aoLado={aoLadoObs}
              resumo={
                <>
                  {parcelado && <span className="text-muted">· parcelado {listaParcelas.length}x</span>}
                  {rotuloObs && <span className="text-muted">· {rotuloObs}</span>}
                  {itens.length > 0 && <span className="text-muted">· {itens.length}</span>}
                </>
              }
            >
              {obsLancamento}
              {conteudoObs}
              {historico}
            </ObsRecolhivel>
          ) : (
            <>
              {obsLancamento}
              {conteudoObs}
              {aoLadoObs && <div className="mt-1 flex flex-wrap items-center gap-1.5">{aoLadoObs}</div>}
            </>
          )}
        </div>
      )}
      {!recolhido && historico}
    </div>
  );
}
