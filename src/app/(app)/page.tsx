import { Observacoes } from "@/components/Observacoes";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { brl, dateBR, STATUS, todayISO, VENCIDAS_CLS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

export default async function Painel() {
  // "Pagas no mês" e "Saldo dos caixas" só para administradores (nem são consultados para os demais).
  const admin = can(await requireUser(), "ADMIN");
  const hoje = new Date(todayISO() + "T00:00:00.000Z");
  const inicioMes = new Date(todayISO().slice(0, 7) + "-01T00:00:00-03:00");
  const abertas = { in: ["PENDENTE", "APROVADA"] as ("PENDENTE" | "APROVADA")[] };

  const [pendentes, aprovadas, rejeitadas, vencidas, pagasMes, caixas, proximas] = await Promise.all([
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
  ]);

  const cards = [
    { label: "Aprovar", v: pendentes, href: "/contas?status=PENDENTE", pill: STATUS.PENDENTE.cls },
    { label: "Aprovadas", v: aprovadas, href: "/contas?status=APROVADA", pill: STATUS.APROVADA.cls },
    { label: "Rejeitadas", v: rejeitadas, href: "/contas?status=REJEITADA", pill: STATUS.REJEITADA.cls, alert: rejeitadas._count > 0 },
    { label: "Vencidas", v: vencidas, href: "/contas?vencidas=1", pill: VENCIDAS_CLS, alert: vencidas._count > 0 },
    ...(pagasMes ? [{ label: "Pagas no mês", v: pagasMes, href: "/contas?status=PAGA", pill: STATUS.PAGA.cls }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className={`grid gap-3 sm:grid-cols-2 ${admin ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className={`card p-4 hover:border-brand-600 ${c.pill}`}>
            <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.pill}`}>{c.label}</span>
            <div className={`mt-2 text-xl font-semibold ${c.alert ? "text-red-700" : "text-ink"}`}>{brl(c.v._sum.amount)}</div>
            <div className="text-xs opacity-80">{c.v._count} conta(s)</div>
          </Link>
        ))}
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
                    <td className="td"><Observacoes className="" conta={<><div className="text-sm font-medium">{a.supplier.name}</div><div className="text-muted">{a.description}</div></>} notes={a.notes} /></td>
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
