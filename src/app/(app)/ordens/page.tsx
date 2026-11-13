import Link from "next/link";
import { prisma } from "@/lib/db";
import { can, exigirTela, requireUser } from "@/lib/auth";
import { brl, dateTimeBR } from "@/lib/format";
import { AbaAcao, AcoesContasProvider } from "@/components/AcoesContas";
import { AcoesOrdem, CancelarAprovacaoCotacao } from "@/components/AcoesOrdem";
import { EditarExcluirOrdem } from "@/components/EditarExcluirOrdem";
import { ExcluirOrdemCancelada } from "@/components/ExcluirOrdemCancelada";
import { historicoOrdem, Selo, STATUS_ORDEM, type StatusOrdem } from "@/lib/ordens";
import { Observacoes } from "@/components/Observacoes";
import { SecoesAprovacaoOrdens } from "@/components/SecoesAprovacaoOrdens";
import { TabelaContas } from "@/components/TabelaContas";
import { podeVerAba } from "@/lib/telas";
import { LancarContasModal } from "@/components/LancarContasModal";
import { buscarOrdensEmCotacao, OrdensEmCotacao } from "@/components/OrdensEmCotacao";

/** Lista das ordens de compra, por situação. */
export default async function Ordens({ searchParams }: { searchParams: { status?: string } }) {
  const user = await requireUser();
  exigirTela(user, "ORDENS_COMPRA");
  const status = (searchParams.status && searchParams.status in STATUS_ORDEM ? searchParams.status : "TODAS") as StatusOrdem | "TODAS";

  // Aba "Aprovar": igual a Contas → Aprovar, separada em Ordens de compra, Orçamentos e Contas.
  const abaAprovar = status === "PENDENTE";
  const ordens = abaAprovar ? [] : await prisma.purchaseOrder.findMany({
    where: status === "TODAS" ? {} : { status },
    orderBy: { code: "desc" },
    take: 300,
    include: {
      category: { select: { name: true } },
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      rejections: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } }, canceledBy: { select: { name: true } } } },
      quotes: { select: { id: true, status: true, amount: true, approvedAt: true, approvedBy: { select: { name: true } }, supplier: { select: { name: true } } } },
      accounts: { where: { status: "PAGA" }, select: { id: true } },
    },
  });

  const admin = can(user, "ADMIN");
  // Editar: quem criou ou o administrador (ordens não canceladas).
  const podeEditar = (o: { status: string; createdById: string }) => o.status !== "CANCELADA" && o.status !== "CONCLUIDA" && (admin || o.createdById === user.id);
  // Excluir: quem criou ou o administrador (concluídas só têm "Reabrir cotação").
  const podeExcluir = podeEditar;
  // Categorias para o modal "Editar" (só quando há alguma ordem editável na tela).
  const categorias = ordens.some(podeEditar)
    ? await prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((c) => c.name))
    : [];
  const volta = status === "TODAS" ? "/ordens" : `/ordens?status=${status}`;

  // Quantidade de ordens em cada situação, mostrada nos botões das abas (menos em "Todas").
  // "Aprovar" mostra o total das três seções: ordens aguardando aprovação + orçamentos em análise + contas aguardando aprovação
  // (as contas só contam para quem tem a aba "Aprovar" da tela Contas liberada, como na própria aba).
  // "Em cotação" e "Rejeitadas" também somam as contas aprovadas / rejeitadas, que aparecem nessas abas (como no Painel).
  const [contagem, orcamentosPendentes, contagemContas] = await Promise.all([
    prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    // Orçamentos: ordens em cotação com cotações em análise (uma linha por ordem na seção Orçamentos).
    prisma.purchaseOrder.count({ where: { status: "APROVADA", quotes: { some: { status: "PENDENTE" } } } }),
    prisma.account.groupBy({ by: ["status"], where: { status: { in: ["PENDENTE", "APROVADA", "REJEITADA"] } }, _count: { _all: true } }),
  ]);
  const qtdStatus = (k: string) => contagem.find((c) => c.status === k)?._count._all ?? 0;
  // Contas mostradas na aba de Ordens (só para quem tem a aba correspondente da tela Contas liberada).
  const mostraContas = (k: string) => (k === "PENDENTE" || k === "APROVADA" || k === "REJEITADA") && podeVerAba(user, k);
  const qtdContas = (k: string) => (mostraContas(k) ? contagemContas.find((c) => c.status === k)?._count._all ?? 0 : 0);
  const qtd = (k: string) => qtdStatus(k) + qtdContas(k) + (k === "PENDENTE" ? orcamentosPendentes : 0);
  const comQtd = (k: string, label: string) => `${label} (${qtd(k)})`;
  const abas: [string, string, string?][] = [
    ["TODAS", "Todas"],
    ...Object.entries(STATUS_ORDEM).map(([k, v]) => [k, comQtd(k, v.tab), v.cls] as [string, string, string]),
  ];

  // Aba "Em cotação": ordens em sanfona com as cotações (igual a Aprovar → Orçamentos) e "Incluir nova cotação".
  const abaCotacao = status === "APROVADA";
  const ordensCotacao = abaCotacao ? await buscarOrdensEmCotacao() : [];

  // Listas do modal "Lançar contas" (só para quem lança).
  const lanca = can(user, "LANCAR");
  const [fornecedoresLanc, categoriasLanc, formasLanc] = lanca
    ? await Promise.all([
        prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((s) => s.name)),
        prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((c) => c.name)),
        prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((p) => p.name)),
      ])
    : [[], [], []];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Ordens de compra</h1>
        {lanca && (
          <div className="flex flex-wrap gap-2">
            <Link href="/ordens/nova" className="btn btn-primary">Nova ordem de compra</Link>
            <LancarContasModal suppliers={fornecedoresLanc} categories={categoriasLanc} paymentMethods={formasLanc} volta={volta} />
          </div>
        )}
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

      {abaAprovar ? (
        <AcoesContasProvider>
          <SecoesAprovacaoOrdens user={user} volta="/ordens?status=PENDENTE" />
          {/* Contas: só para quem tem a aba "Aprovar" da tela Contas liberada. */}
          {podeVerAba(user, "PENDENTE") && <TabelaContas user={user} where={{ status: "PENDENTE" }} titulo="Contas" voltaTela="/ordens?status=PENDENTE" />}
        </AcoesContasProvider>
      ) : (
      <AcoesContasProvider>
      {mostraContas(status) && <h2 className="mb-2 text-sm font-semibold">Ordens de compra ({ordens.length})</h2>}
      {abaCotacao ? (
        <OrdensEmCotacao
          user={user}
          ordens={ordensCotacao}
          volta={volta}
          vazio="Nenhuma ordem de compra em cotação."
          listas={lanca ? { fornecedores: fornecedoresLanc, formas: formasLanc } : undefined}
          incluir={lanca}
          extras={Object.fromEntries(
            ordens.map((o) => [
              o.id,
              <EditarExcluirOrdem
                key={o.id}
                id={o.id}
                code={o.code}
                concluida={false}
                reenviar
                ordem={{ description: o.description, category: o.category.name, notes: o.notes ?? "" }}
                categorias={categorias}
                editar={podeEditar(o)}
                excluir={podeExcluir(o)}
                volta={volta}
              />,
            ]),
          )}
        />
      ) : (
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
                    <div className="flex items-center justify-end gap-2">
                      {o.status === "PENDENTE" && can(user, "APROVAR") && (can(user, "ADMIN") || o.createdById !== user.id) ? (
                        <AcoesOrdem id={o.id} code={o.code} aprovar compacto />
                      ) : o.status === "PENDENTE" ? (
                        <span className="text-xs text-muted">{can(user, "APROVAR") ? "Você criou; outra pessoa aprova" : "Aguardando quem aprova"}</span>
                      ) : o.status === "REJEITADA" && can(user, "APROVAR") && (can(user, "ADMIN") || o.createdById !== user.id) ? (
                        <AcoesOrdem id={o.id} code={o.code} aprovar={false} desfazerRejeicao compacto />
                      ) : o.status === "APROVADA" ? (
                        <Link href={`/ordens/${o.id}`} className="btn px-2 py-0.5 text-xs">Cotações</Link>
                      ) : o.status === "CANCELADA" && (admin || o.createdById === user.id) ? (
                        <ExcluirOrdemCancelada id={o.id} code={o.code} descricao={o.description} />
                      ) : null}
                      {o.status === "CONCLUIDA" ? (
                        aprovada && can(user, "APROVAR") && (admin || o.createdById !== user.id) && (
                          <CancelarAprovacaoCotacao
                            id={aprovada.id}
                            fornecedor={aprovada.supplier.name}
                            valor={brl(aprovada.amount)}
                            bloqueio={o.accounts.length ? "Há conta já paga desta ordem; a cotação não pode ser reaberta." : undefined}
                            compacto
                          />
                        )
                      ) : (
                      <EditarExcluirOrdem
                        id={o.id}
                        code={o.code}
                        concluida={false}
                        reenviar={o.status === "REJEITADA" || o.status === "APROVADA"}
                        ordem={{ description: o.description, category: o.category.name, notes: o.notes ?? "" }}
                        categorias={categorias}
                        editar={podeEditar(o)}
                        excluir={podeExcluir(o)}
                        volta={volta}
                      />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {ordens.length === 0 && <tr><td colSpan={6} className="td py-8 text-center text-muted">Nenhuma ordem de compra.</td></tr>}
          </tbody>
        </table>
      </div>
      )}
      {/* Em cotação / Rejeitadas: abaixo das ordens, as contas aprovadas / rejeitadas (separadas, como em Aprovar). */}
      {mostraContas(status) && (
        <div className="mt-6">
          <TabelaContas user={user} where={{ status: status as "APROVADA" | "REJEITADA" }} titulo="Contas" voltaTela={volta} />
        </div>
      )}
      </AcoesContasProvider>
      )}
    </div>
  );
}
