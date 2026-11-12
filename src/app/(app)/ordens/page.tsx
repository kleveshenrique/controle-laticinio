import Link from "next/link";
import { prisma } from "@/lib/db";
import { can, exigirTela, requireUser } from "@/lib/auth";
import { brl, dateTimeBR } from "@/lib/format";
import { AbaAcao, AcoesContasProvider } from "@/components/AcoesContas";
import { AcoesOrdem } from "@/components/AcoesOrdem";
import { AcoesOrdemConcluida } from "@/components/AcoesOrdemConcluida";
import { historicoOrdem, Selo, STATUS_ORDEM, type StatusOrdem } from "@/lib/ordens";
import { Observacoes } from "@/components/Observacoes";

/** Lista das ordens de compra, por situação. */
export default async function Ordens({ searchParams }: { searchParams: { status?: string } }) {
  const user = await requireUser();
  exigirTela(user, "ORDENS_COMPRA");
  const status = (searchParams.status && searchParams.status in STATUS_ORDEM ? searchParams.status : "TODAS") as StatusOrdem | "TODAS";

  const ordens = await prisma.purchaseOrder.findMany({
    where: status === "TODAS" ? {} : { status },
    orderBy: { code: "desc" },
    take: 300,
    include: {
      category: { select: { name: true } },
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      rejections: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } }, canceledBy: { select: { name: true } } } },
      quotes: { select: { id: true, status: true, amount: true, approvedAt: true, approvedBy: { select: { name: true } }, supplier: { select: { name: true } } } },
    },
  });

  // Categorias para o modal "Alterar" das concluídas (só quando há alguma na tela).
  const categorias = ordens.some((o) => o.status === "CONCLUIDA")
    ? await prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((c) => c.name))
    : [];
  const podeExcluir = can(user, "ADMIN") || can(user, "LANCAR") || can(user, "APROVAR");

  // Quantidade de ordens em cada situação, mostrada nos botões das abas (menos em "Todas").
  const contagem = await prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true } });
  const qtd = (k: string) => contagem.find((c) => c.status === k)?._count._all ?? 0;
  const comQtd = (k: string, label: string) => `${label} (${qtd(k)})`;
  const abas: [string, string, string?][] = [
    ["TODAS", "Todas"],
    ...Object.entries(STATUS_ORDEM).map(([k, v]) => [k, comQtd(k, v.tab), v.cls] as [string, string, string]),
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Ordens de compra</h1>
        {can(user, "LANCAR") && <Link href="/ordens/nova" className="btn btn-primary">Nova ordem de compra</Link>}
      </div>
      <p className="mb-4 text-sm text-muted">
        A ordem de compra é aprovada, recebe as cotações dos fornecedores e, quando uma cotação é aprovada, vira conta a pagar já aprovada.
      </p>

      <AcoesContasProvider>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {abas.map(([k, label, cor]) => (
            <AbaAcao key={k} href={`/ordens?status=${k}`} ativa={status === k} cor={cor}>
              {label}
            </AbaAcao>
          ))}
        </div>
      </AcoesContasProvider>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-line">
            <tr>
              <th className="th">#</th><th className="th">Descrição</th><th className="th">Situação</th><th className="th">Cotações</th><th className="th">Criada por</th><th className="th text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ordens.map((o) => {
              const aprovada = o.quotes.find((q) => q.status === "APROVADA");
              return (
                <tr key={o.id} className="hover:bg-paper">
                  <td className="td text-muted"><Link href={`/ordens/${o.id}`} className="hover:underline">{o.code}</Link></td>
                  <td className="td">
                    <Observacoes
                      className=""
                      recolher
                      conta={<><Link href={`/ordens/${o.id}`} className="text-sm font-medium hover:underline">{o.description}</Link><div className="text-muted">{o.category.name}</div></>}
                      notes={o.notes}
                      autor={{ name: o.createdBy.name, createdAt: o.createdAt }}
                      {...historicoOrdem(o)}
                    />
                  </td>
                  <td className="td">
                    <Selo s={STATUS_ORDEM[o.status]} />
                    {o.status === "REJEITADA" && o.rejectionReason && <div className="mt-1 max-w-xs text-xs text-red-700">Motivo: {o.rejectionReason}</div>}
                  </td>
                  <td className="td text-sm">
                    {aprovada ? <>{aprovada.supplier.name} · <strong>{brl(aprovada.amount)}</strong></> : o.quotes.length ? `${o.quotes.length} cotação(ões)` : <span className="text-muted">—</span>}
                  </td>
                  <td className="td text-xs text-muted">{o.createdBy.name}<div>{dateTimeBR(o.createdAt)}</div></td>
                  <td className="td">
                    <div className="flex justify-end">
                      {o.status === "PENDENTE" && can(user, "APROVAR") && (can(user, "ADMIN") || o.createdById !== user.id) ? (
                        <AcoesOrdem id={o.id} code={o.code} aprovar cancelar={false} compacto />
                      ) : o.status === "PENDENTE" ? (
                        <span className="text-xs text-muted">{can(user, "APROVAR") ? "Você criou; outra pessoa aprova" : "Aguardando quem aprova"}</span>
                      ) : o.status === "REJEITADA" && can(user, "APROVAR") && (can(user, "ADMIN") || o.createdById !== user.id) ? (
                        <AcoesOrdem id={o.id} code={o.code} aprovar={false} cancelar={false} desfazerRejeicao compacto />
                      ) : o.status === "CONCLUIDA" && (podeExcluir || can(user, "ADMIN") || o.createdById === user.id) ? (
                        <AcoesOrdemConcluida
                          id={o.id}
                          code={o.code}
                          ordem={{ description: o.description, category: o.category.name, notes: o.notes ?? "" }}
                          categorias={categorias}
                          alterar={can(user, "ADMIN") || o.createdById === user.id}
                          excluir={podeExcluir}
                          compacto
                          volta="lista"
                        />
                      ) : o.status === "APROVADA" ? (
                        <Link href={`/ordens/${o.id}`} className="btn px-2 py-0.5 text-xs">Cotações</Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {ordens.length === 0 && <tr><td colSpan={6} className="td py-8 text-center text-muted">Nenhuma ordem de compra.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
