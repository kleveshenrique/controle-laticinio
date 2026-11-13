import { Observacoes } from "@/components/Observacoes";
import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { podeVerAba, podeVerTela, telaInicial } from "@/lib/telas";
import { brl, dateBR, STATUS, todayISO, VENCIDAS_CLS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

export default async function Painel() {
  const user = await requireUser();
  // Sem acesso ao Painel (ex.: logo após o login): vai para a primeira tela liberada.
  if (!podeVerTela(user, "PAINEL")) {
    const inicial = telaInicial(user);
    if (inicial) redirect(inicial);
    return (
      <div className="card p-6 text-center text-sm text-muted">
        Nenhuma tela foi liberada para o seu usuário. Peça a um administrador para liberar o acesso.
      </div>
    );
  }
  // "Pagas no mês" e "Saldo dos caixas" só para administradores (nem são consultados para os demais).
  const admin = can(user, "ADMIN");
  const hoje = new Date(todayISO() + "T00:00:00.000Z");
  const inicioMes = new Date(todayISO().slice(0, 7) + "-01T00:00:00-03:00");
  const abertas = { in: ["PENDENTE", "APROVADA"] as ("PENDENTE" | "APROVADA")[] };

  const [pendentes, aprovadas, rejeitadas, vencidas, pagasMes, caixas, proximas, orcamentos, ordensPendentes] = await Promise.all([
    prisma.account.aggregate({ where: { status: "PENDENTE" }, _sum: { amount: true }, _count: true }),
    prisma.account.aggregate({ where: { status: "APROVADA" }, _sum: { amount: true }, _count: true }),
    prisma.account.aggregate({ where: { status: "REJEITADA" }, _sum: { amount: true }, _count: true }),
    prisma.account.aggregate({ where: { status: abertas, dueDate: { lt: hoje } }, _sum: { amount: true }, _count: true }),
    admin ? prisma.account.aggregate({ where: { status: "PAGA", paidAt: { gte: inicioMes } }, _sum: { amount: true }, _count: true }) : null,
    admin ? prisma.cashRegister.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    prisma.account.findMany({
      where: { status: abertas, dueDate: { gte: hoje } },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { supplier: true },
    }),
    // Contados por ordem de compra (uma linha por ordem em Aprovar → Orçamentos).
    prisma.purchaseOrder.count({ where: { status: "APROVADA", quotes: { some: { status: "PENDENTE" } } } }),
    // Ordens de compra aguardando aprovação.
    prisma.purchaseOrder.count({ where: { status: "PENDENTE" } }),
  ]);

  // Orçamentos (cotações aprovadas) que geraram as contas de cada card: ordens de compra distintas entre essas contas
  // (uma cotação parcelada gera várias contas, mas conta como um orçamento). Só para quem vê Ordens de compra.
  const verOrcamentos = podeVerTela(user, "ORDENS_COMPRA");
  const deOrcamento = (where: Prisma.AccountWhereInput) =>
    verOrcamentos
      ? prisma.account.findMany({ where: { ...where, purchaseOrderId: { not: null } }, distinct: ["purchaseOrderId"], select: { purchaseOrderId: true } }).then((l) => l.length)
      : Promise.resolve(0);
  const ordens = (status: "APROVADA" | "REJEITADA") => (verOrcamentos ? prisma.purchaseOrder.count({ where: { status } }) : Promise.resolve(0));
  const [orcAprovadas, orcRejeitadas, orcVencidas, orcPagas, ordensAprovadas, ordensRejeitadas] = await Promise.all([
    deOrcamento({ status: "APROVADA" }),
    deOrcamento({ status: "REJEITADA" }),
    deOrcamento({ status: abertas, dueDate: { lt: hoje } }),
    admin ? deOrcamento({ status: "PAGA", paidAt: { gte: inicioMes } }) : Promise.resolve(0),
    // Ordens de compra aprovadas (em cotação) e rejeitadas. Não existem ordens vencidas ou pagas.
    ordens("APROVADA"),
    ordens("REJEITADA"),
  ]);

  // O card de conta só é clicável se a aba correspondente da tela Contas estiver liberada.
  const linkCard = (aba: string, href: string) => (podeVerAba(user, aba) ? href : null);
  // Quantidade em destaque (contas + ordens de compra, ex.: "12 aprovadas") e, embaixo, o detalhamento:
  // contas, ordens de compra (só em Aprovadas/Rejeitadas), orçamentos que geraram as contas e o valor total das contas.
  const contas = (label: string, v: typeof pendentes, orc: number, aba: string, href: string, pill: string, alert = false, ordensQtd?: number) => {
    const total = v._count + (ordensQtd ?? 0);
    return {
      label, pill, alert, href: linkCard(aba, href),
      valor: `${total} ${total === 1 ? label.toLowerCase().replace(/s(?=$| )/, "") : label.toLowerCase()}`,
      sub: [
        `${v._count} conta(s)`,
        ...(verOrcamentos && ordensQtd !== undefined ? [`${ordensQtd} ordem(ns) de compra`] : []),
        ...(verOrcamentos ? [`${orc} orçamento(s)`] : []),
        brl(v._sum.amount),
      ].join(" · "),
    };
  };

  // "Aprovar": contas + ordens de compra aguardando aprovação + orçamentos (cotações) em análise.
  const cards = [
    {
      label: "Aprovar",
      pill: STATUS.PENDENTE.cls,
      alert: false,
      // Vai para Ordens de compra → Aprovar (ordens, orçamentos e contas); sem acesso a Ordens, vai para Contas → Aprovar.
      href: verOrcamentos ? "/ordens?status=PENDENTE" : podeVerAba(user, "PENDENTE") ? "/contas?status=PENDENTE" : null,
      // Quantidade total para aprovar (contas + orçamentos), com o detalhamento embaixo.
      valor: `${pendentes._count + (verOrcamentos ? ordensPendentes + orcamentos : 0)} para aprovar`,
      sub: verOrcamentos ? `${pendentes._count} conta(s) · ${ordensPendentes} ordem(ns) de compra · ${orcamentos} orçamento(s)` : `${pendentes._count} conta(s) · ${brl(pendentes._sum.amount)}`,
    },
    // Aprovadas: vai para Ordens de compra → Em cotação (ordens aprovadas); sem acesso a Ordens, vai para Contas → Aprovadas.
    {
      ...contas("Aprovadas", aprovadas, orcAprovadas, "APROVADA", "/contas?status=APROVADA", STATUS.APROVADA.cls, false, ordensAprovadas),
      ...(verOrcamentos ? { href: "/ordens?status=APROVADA" } : {}),
    },
    // Rejeitadas: vai para Ordens de compra → Rejeitadas; sem acesso a Ordens, vai para Contas → Rejeitadas.
    {
      ...contas("Rejeitadas", rejeitadas, orcRejeitadas, "REJEITADA", "/contas?status=REJEITADA", STATUS.REJEITADA.cls, rejeitadas._count + ordensRejeitadas > 0, ordensRejeitadas),
      ...(verOrcamentos ? { href: "/ordens?status=REJEITADA" } : {}),
    },
    contas("Vencidas", vencidas, orcVencidas, "VENCIDAS", "/contas?vencidas=1", VENCIDAS_CLS, vencidas._count > 0),
    ...(pagasMes ? [contas("Pagas no mês", pagasMes, orcPagas, "PAGA", "/contas?status=PAGA", STATUS.PAGA.cls)] : []),
  ];

  return (
    <div className="space-y-6">
      <div className={`grid gap-3 sm:grid-cols-2 ${admin ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {cards.map((c) => {
          const href = c.href;
          const conteudo = (
            <>
              <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.pill}`}>{c.label}</span>
              <div className={`mt-2 text-xl font-semibold ${c.alert ? "text-red-700" : "text-ink"}`}>{c.valor}</div>
              <div className="text-xs opacity-80">{c.sub}</div>
            </>
          );
          return href ? (
            <Link key={c.label} href={href} className={`card p-4 hover:border-brand-600 ${c.pill}`}>{conteudo}</Link>
          ) : (
            <div key={c.label} className={`card p-4 ${c.pill}`}>{conteudo}</div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`card ${admin ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Próximos vencimentos</h2>
          {proximas.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nenhuma conta em aberto com vencimento futuro.</p>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-line">
                {proximas.map((a) => (
                  <tr key={a.id}>
                    <td className="td">{dateBR(a.dueDate)}</td>
                    <td className="td"><Observacoes className="" recolher conta={<><div className="text-sm font-medium">{a.supplier.name}</div><div className="text-muted">{a.description}</div></>} notes={a.notes} /></td>
                    <td className="td"><StatusBadge status={a.status} /></td>
                    <td className="td text-right font-medium">{brl(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {admin && (
        <section className="card">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Saldo dos caixas</h2>
          {caixas.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nenhum caixa criado ainda.</p>
          ) : (
            <ul className="divide-y divide-line">
              {caixas.map((c) => (
                <li key={c.id} className="flex justify-between px-4 py-2 text-sm">
                  <span>{c.name}</span><strong>{brl(c.balance)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
