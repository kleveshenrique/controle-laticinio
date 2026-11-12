import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, exigirTela, requireUser } from "@/lib/auth";
import { brl, dateBR, dateTimeBR, formaPagamentoTexto, lerParcelas, maskMoney } from "@/lib/format";
import { historicoOrdem, Selo, STATUS_COTACAO, STATUS_ORDEM } from "@/lib/ordens";
import { Observacoes } from "@/components/Observacoes";
import { AcoesCotacao, AcoesOrdem } from "@/components/AcoesOrdem";
import { NovaCotacao } from "@/components/NovaCotacao";
import { EditarCotacao } from "@/components/EditarCotacao";
import { AcoesOrdemConcluida } from "@/components/AcoesOrdemConcluida";
import { StatusBadge } from "@/components/StatusBadge";

/** Detalhe da ordem de compra: aprovação, cotações e contas geradas. */
export default async function Ordem({ params }: { params: { id: string } }) {
  const user = await requireUser();
  exigirTela(user, "ORDENS_COMPRA");
  const oc = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: {
      category: { select: { name: true } },
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      rejections: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } }, canceledBy: { select: { name: true } } } },
      quotes: {
        orderBy: { createdAt: "asc" },
        include: {
          supplier: { select: { name: true } },
          paymentMethod: { select: { name: true } },
          createdBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          attachments: { select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } },
        },
      },
      accounts: { orderBy: { dueDate: "asc" }, select: { id: true, code: true, description: true, amount: true, dueDate: true, status: true } },
    },
  });
  if (!oc) notFound();
  // Valor no formato do campo com máscara ("R$ 1.234,56").
  const dinheiro = (v: unknown) => maskMoney(Math.round(Number(v) * 100).toString());

  const admin = can(user, "ADMIN");
  // Quem criou a ordem não aprova a ordem nem a cotação (exceto o administrador).
  const aprovador = can(user, "APROVAR") && (admin || oc.createdById !== user.id);
  const dono = admin || oc.createdById === user.id;
  const emCotacao = oc.status === "APROVADA";

  const categorias =
    oc.status === "CONCLUIDA" && dono
      ? await prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((c) => c.name))
      : [];
  const precisaListas = emCotacao && can(user, "LANCAR");
  const [fornecedores, formas] = precisaListas
    ? await Promise.all([
        prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((s) => s.name)),
        prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((p) => p.name)),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ordens" className="text-sm text-muted hover:underline">← Ordens de compra</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">Ordem de compra #{oc.code}</h1>
          <Selo s={STATUS_ORDEM[oc.status]} />
        </div>
      </div>

      <section className="card space-y-2 p-4 text-sm">
        <Observacoes
          className=""
          recolher
          conta={<><div className="text-base font-medium">{oc.description}</div><div className="text-muted">Categoria: {oc.category.name}</div></>}
          notes={oc.notes}
          autor={{ name: oc.createdBy.name, createdAt: oc.createdAt }}
          {...historicoOrdem(oc)}
        />
        <div className="text-xs text-muted">
          Criada por {oc.createdBy.name} em {dateTimeBR(oc.createdAt)}
          {oc.reviewedBy && oc.reviewedAt && <> · {oc.status === "REJEITADA" ? "Rejeitada" : "Aprovada"} por {oc.reviewedBy.name} em {dateTimeBR(oc.reviewedAt)}</>}
          {oc.canceledAt && <> · Cancelada em {dateTimeBR(oc.canceledAt)}</>}
        </div>
        {oc.rejectionReason && <div className="text-xs text-red-700">Motivo: {oc.rejectionReason}</div>}
        {oc.status === "PENDENTE" && !aprovador && (
          <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
            {can(user, "APROVAR")
              ? "Você criou esta ordem; outra pessoa com permissão de aprovar (ou o administrador) precisa aprová-la."
              : "Aguardando aprovação de quem tem a permissão \"Validar e autorizar\"."}
          </div>
        )}
        <AcoesOrdem
          id={oc.id}
          code={oc.code}
          aprovar={oc.status === "PENDENTE" && aprovador}
          desfazerRejeicao={oc.status === "REJEITADA" && aprovador}
          cancelar={dono && (oc.status === "PENDENTE" || oc.status === "APROVADA" || oc.status === "REJEITADA")}
        />
        {oc.status === "CONCLUIDA" && (
          <AcoesOrdemConcluida
            id={oc.id}
            code={oc.code}
            ordem={{ description: oc.description, category: oc.category.name, notes: oc.notes ?? "" }}
            categorias={categorias}
            alterar={dono}
            excluir={admin || can(user, "LANCAR") || can(user, "APROVAR")}
          />
        )}
      </section>

      {(oc.status !== "PENDENTE" && oc.status !== "REJEITADA") || oc.quotes.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Cotações</h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">Fornecedor</th><th className="th">Pagamento</th><th className="th">Vencimento</th>
                  <th className="th text-right">Valor</th><th className="th">Situação</th><th className="th text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {oc.quotes.map((q, i) => {
                  const parcelas = lerParcelas(q.parcelas);
                  return (
                    <tr key={q.id} className={q.status === "APROVADA" ? "bg-brand-50/50" : ""}>
                      <td className="td">
                        <div className="text-sm font-medium"><span className="mr-1 text-muted">Cotação {i + 1} ·</span>{q.supplier.name}</div>
                        {q.notes && <div className="whitespace-pre-wrap text-xs text-muted">{q.notes}</div>}
                        {q.attachments.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {q.attachments.map((a, i) => (
                              <a key={a.id} href={`/anexos/cotacao/${a.id}`} target="_blank" rel="noopener" title={a.fileName} className="btn px-2 py-0.5 text-xs">
                                Proposta{q.attachments.length > 1 ? ` ${i + 1}` : ""}
                              </a>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-muted">Incluída por {q.createdBy.name}, {dateTimeBR(q.createdAt)}</div>
                      </td>
                      <td className="td text-sm">{formaPagamentoTexto(q.paymentMethod.name, q.pixKey)}</td>
                      <td className="td text-sm">
                        {parcelas.length > 1 ? (
                          <div className="space-y-0.5 text-xs">
                            {parcelas.map((p, k) => <div key={k}>{k + 1}/{parcelas.length}: {brl(p.amount)} em {dateBR(new Date(p.dueDate + "T00:00:00.000Z"))}</div>)}
                          </div>
                        ) : dateBR(q.dueDate)}
                      </td>
                      <td className="td text-right font-medium">{brl(q.amount)}</td>
                      <td className="td">
                        <Selo s={STATUS_COTACAO[q.status]} />
                        {q.approvedBy && <div className="mt-1 text-xs text-muted">por {q.approvedBy.name}</div>}
                      </td>
                      <td className="td">
                        {emCotacao && q.status === "PENDENTE" && (
                          <div className="flex flex-wrap justify-end gap-2">
                          {can(user, "LANCAR") && (admin || q.createdById === user.id) && (
                            <EditarCotacao
                              purchaseOrderId={oc.id}
                              fornecedores={fornecedores}
                              formas={formas}
                              cotacao={{
                                id: q.id,
                                supplier: q.supplier.name,
                                paymentMethod: q.paymentMethod.name,
                                pixKey: q.pixKey ?? "",
                                amount: dinheiro(q.amount),
                                dueDate: q.dueDate.toISOString().slice(0, 10),
                                parcelas: parcelas.length > 1 ? parcelas.map((p) => ({ amount: dinheiro(p.amount), dueDate: p.dueDate })) : [],
                                notes: q.notes ?? "",
                                anexos: q.attachments,
                              }}
                            />
                          )}
                          <AcoesCotacao
                            id={q.id}
                            fornecedor={`Cotação ${i + 1} · ${q.supplier.name}`}
                            valor={brl(q.amount)}
                            aprovar={aprovador}
                            excluir={can(user, "LANCAR") && (admin || q.createdById === user.id)}
                          />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {oc.quotes.length === 0 && <tr><td colSpan={6} className="td py-6 text-center text-muted">Nenhuma cotação ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {emCotacao && can(user, "LANCAR") && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Incluir cotação</h2>
          <div className="card p-4">
            <NovaCotacao purchaseOrderId={oc.id} fornecedores={fornecedores} formas={formas} />
          </div>
        </section>
      )}

      {oc.accounts.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Contas geradas</h2>
          <div className="card divide-y divide-line">
            {oc.accounts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>#{a.code} · {a.description} <span className="text-xs text-muted">— vence {dateBR(a.dueDate)}</span></span>
                <span className="flex items-center gap-2"><StatusBadge status={a.status} /><strong>{brl(a.amount)}</strong></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
