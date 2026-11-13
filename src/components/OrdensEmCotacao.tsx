import type { ReactNode } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth";
import { brl, dateBR, dateTimeBR, formaPagamentoTexto, lerParcelas, maskMoney } from "@/lib/format";
import { AcoesCotacao } from "@/components/AcoesOrdem";
import { IncluirCotacao } from "@/components/IncluirCotacao";
import { EditarCotacao } from "@/components/EditarCotacao";

type Usuario = { id: string; permissions: string[] };

/** Ordens em cotação com todas as cotações (a numeração "Cotação N" é a da tela da ordem). */
export function buscarOrdensEmCotacao(where: Prisma.PurchaseOrderWhereInput = {}) {
  return prisma.purchaseOrder.findMany({
    where: { ...where, status: "APROVADA" },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      description: true,
      notes: true,
      createdAt: true,
      reviewedAt: true,
      createdById: true,
      category: { select: { name: true } },
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      quotes: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          amount: true,
          dueDate: true,
          pixKey: true,
          notes: true,
          parcelas: true,
          createdById: true,
          supplier: { select: { name: true } },
          paymentMethod: { select: { name: true } },
          attachments: { select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
}
export type OrdemEmCotacao = Awaited<ReturnType<typeof buscarOrdensEmCotacao>>[number];

/**
 * Lista de ordens em cotação em sanfona: cada linha mostra os dados da ordem aprovada e, ao clicar, abre as cotações
 * em análise para aprovar (abrir uma linha fecha a outra). Usada em Aprovar → Orçamentos e em Ordens → Em cotação.
 * - `listas`: fornecedores e formas de pagamento do formulário de cotação; com elas, quem lança vê o ícone "Alterar"
 *   nas cotações que incluiu (o administrador, em todas).
 * - `incluir`: mostra o botão "Incluir nova cotação" em cada ordem (precisa de `listas`).
 * - `extras`: conteúdo a mais no rodapé de cada ordem (ex.: editar/excluir), por id da ordem.
 */
export function OrdensEmCotacao({
  user,
  ordens,
  volta,
  vazio,
  listas,
  incluir,
  extras,
}: {
  user: Usuario;
  ordens: OrdemEmCotacao[];
  volta: string;
  vazio: string;
  listas?: { fornecedores: string[]; formas: string[] };
  incluir?: boolean;
  extras?: Record<string, ReactNode>;
}) {
  const admin = can(user, "ADMIN");
  const aprovador = can(user, "APROVAR");
  const lanca = can(user, "LANCAR");
  // Valor no formato do campo com máscara ("R$ 1.234,56").
  const dinheiro = (v: unknown) => maskMoney(Math.round(Number(v) * 100).toString());
  return (
    <div className="card divide-y divide-line">
      {ordens.map((o) => {
        const pendentes = o.quotes.filter((q) => q.status === "PENDENTE");
        const menor = pendentes.length ? Math.min(...pendentes.map((q) => Number(q.amount))) : null;
        const podeAprovar = aprovador && (admin || o.createdById !== user.id);
        return (
          // name igual em todas: abrir uma linha fecha a outra (sanfona).
          <details key={o.id} name="ordens-em-cotacao" className="group border-l-4 border-transparent open:border-brand-900 open:bg-brand-50">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-paper group-open:bg-brand-600 group-open:text-white group-open:hover:bg-brand-700 [&::-webkit-details-marker]:hidden">
              <span className="text-muted transition-transform group-open:rotate-90 group-open:text-white" aria-hidden>▸</span>
              <span className="text-sm text-muted group-open:text-white/80">#{o.code}</span>
              <span className="min-w-[12rem] flex-1">
                <span className="text-sm font-medium">{o.description}</span>
                <span className="block text-xs text-muted group-open:text-white/80">
                  {o.category.name} · criada por {o.createdBy.name} em {dateTimeBR(o.createdAt)}
                  {o.reviewedBy && o.reviewedAt && <> · aprovada por {o.reviewedBy.name} em {dateTimeBR(o.reviewedAt)}</>}
                </span>
                {o.notes && <span className="block whitespace-pre-wrap text-xs text-muted group-open:text-white/80">{o.notes}</span>}
              </span>
              <span className="text-right text-sm">
                <strong>{pendentes.length ? `${pendentes.length} cotação(ões)` : "Nenhuma cotação"}</strong>
                {menor !== null && <span className="block text-xs text-muted group-open:text-white/80">menor valor {brl(menor)}</span>}
              </span>
            </summary>
            <div className="overflow-x-auto border-t border-line">
              {pendentes.length > 0 ? (
                <table className="w-full min-w-[860px]">
                  <thead className="border-b border-line">
                    <tr>
                      <th className="th">Fornecedor</th><th className="th">Pagamento</th><th className="th">Vencimento</th>
                      <th className="th text-right">Valor</th><th className="th text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {o.quotes.map((q, i) =>
                      q.status !== "PENDENTE" ? null : (
                        <tr key={q.id}>
                          <td className="td">
                            <div className="text-sm font-medium"><span className="mr-1 text-muted">Cotação {i + 1} ·</span>{q.supplier.name}</div>
                            {q.notes && <div className="whitespace-pre-wrap text-xs text-muted">{q.notes}</div>}
                            {q.attachments.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {q.attachments.map((a, k) => (
                                  <a key={a.id} href={`/anexos/cotacao/${a.id}`} target="_blank" rel="noopener" title={a.fileName} className="btn px-2 py-0.5 text-xs">
                                    Proposta{q.attachments.length > 1 ? ` ${k + 1}` : ""}
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="td text-sm">{formaPagamentoTexto(q.paymentMethod.name, q.pixKey)}</td>
                          <td className="td text-sm">
                            {(() => {
                              const parcelas = lerParcelas(q.parcelas);
                              return parcelas.length > 1 ? (
                                <div className="space-y-0.5 text-xs">
                                  {parcelas.map((p, k) => <div key={k}>{k + 1}/{parcelas.length}: {brl(p.amount)} em {dateBR(new Date(p.dueDate + "T00:00:00.000Z"))}</div>)}
                                </div>
                              ) : dateBR(q.dueDate);
                            })()}
                          </td>
                          <td className={`td text-right font-medium${Number(q.amount) === menor && pendentes.length > 1 ? " text-brand-700" : ""}`}>{brl(q.amount)}</td>
                          <td className="td">
                            <div className="flex items-center justify-end gap-2">
                              {!podeAprovar && <span className="text-xs text-muted">{aprovador ? "Você criou a ordem; outra pessoa aprova" : "Aguardando quem aprova"}</span>}
                              <AcoesCotacao
                                id={q.id}
                                fornecedor={`Cotação ${i + 1} · ${q.supplier.name}`}
                                valor={brl(q.amount)}
                                aprovar={podeAprovar}
                                excluir={false}
                                volta={volta}
                                editar={
                                  listas && lanca && (admin || q.createdById === user.id) ? (
                                    <EditarCotacao
                                      purchaseOrderId={o.id}
                                      fornecedores={listas.fornecedores}
                                      formas={listas.formas}
                                      volta={volta}
                                      cotacao={{
                                        id: q.id,
                                        supplier: q.supplier.name,
                                        paymentMethod: q.paymentMethod.name,
                                        pixKey: q.pixKey ?? "",
                                        amount: dinheiro(q.amount),
                                        dueDate: q.dueDate.toISOString().slice(0, 10),
                                        parcelas: (() => {
                                          const p = lerParcelas(q.parcelas);
                                          return p.length > 1 ? p.map((x) => ({ amount: dinheiro(x.amount), dueDate: x.dueDate })) : [];
                                        })(),
                                        notes: q.notes ?? "",
                                        anexos: q.attachments,
                                      }}
                                    />
                                  ) : undefined
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-4 text-sm text-muted">Nenhuma cotação ainda.</p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2">
                {incluir && listas && <IncluirCotacao purchaseOrderId={o.id} code={o.code} fornecedores={listas.fornecedores} formas={listas.formas} volta={volta} />}
                <Link href={`/ordens/${o.id}`} className="btn px-2 py-0.5 text-xs">Ver ordem</Link>
                {extras?.[o.id]}
              </div>
            </div>
          </details>
        );
      })}
      {ordens.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">{vazio}</p>}
    </div>
  );
}
