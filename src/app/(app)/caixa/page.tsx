import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { brl, dateTimeBR } from "@/lib/format";
import { criarCaixa, movimentarCaixa } from "@/app/actions";

export default async function Caixa({ searchParams }: { searchParams: { id?: string; erro?: string; ok?: string } }) {
  const user = await requireUser();
  if (!can(user, "CAIXA") && !can(user, "PAGAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem acesso ao caixa."));
  const gerir = can(user, "CAIXA");

  const caixas = await prisma.cashRegister.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const atual = caixas.find((c) => c.id === searchParams.id) ?? caixas[0];
  const movs = atual
    ? await prisma.cashMovement.findMany({
        where: { cashRegisterId: atual.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: true },
      })
    : [];
  const entradas = movs.filter((m) => m.type === "ENTRADA").reduce((s, m) => s + Number(m.amount), 0);
  const saidas = movs.filter((m) => m.type === "SAIDA").reduce((s, m) => s + Number(m.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {caixas.map((c) => (
          <Link key={c.id} href={`/caixa?id=${c.id}`} className={`btn ${c.id === atual?.id ? "btn-primary" : ""}`}>
            {c.name} · {brl(c.balance)}
          </Link>
        ))}
        {caixas.length === 0 && <p className="text-sm text-muted">Nenhum caixa criado ainda.</p>}
      </div>

      {atual && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">{atual.name}</h2>
              <span className="text-sm">Saldo <strong>{brl(atual.balance)}</strong></span>
            </div>
            <table className="w-full">
              <tbody className="divide-y divide-line">
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td className="td text-xs text-muted">{dateTimeBR(m.createdAt)}</td>
                    <td className="td">{m.description}<div className="text-xs text-muted">{m.user.name}</div></td>
                    <td className={`td text-right font-medium ${m.type === "SAIDA" ? "text-red-700" : "text-brand-700"}`}>
                      {m.type === "SAIDA" ? "−" : "+"} {brl(m.amount)}
                    </td>
                  </tr>
                ))}
                {movs.length === 0 && <tr><td className="td py-8 text-center text-muted">Sem movimentações.</td></tr>}
              </tbody>
            </table>
            <p className="border-t border-line px-4 py-2 text-xs text-muted">Últimas {movs.length} movimentações: entradas {brl(entradas)} · saídas {brl(saidas)}</p>
          </section>

          {gerir && (
            <div className="space-y-6">
              <form action={movimentarCaixa} className="card space-y-3 p-4">
                <h2 className="text-sm font-semibold">Nova movimentação</h2>
                <input type="hidden" name="cashRegisterId" value={atual.id} />
                <select name="type" className="input" aria-label="Tipo"><option value="ENTRADA">Entrada (suprimento)</option><option value="SAIDA">Saída avulsa</option></select>
                <input name="amount" className="input" inputMode="decimal" placeholder="Valor (R$)" required />
                <input name="description" className="input" placeholder="Descrição" required />
                <button className="btn btn-primary w-full">Registrar</button>
              </form>
              <form action={criarCaixa} className="card space-y-3 p-4">
                <h2 className="text-sm font-semibold">Criar outro caixa</h2>
                <input name="name" className="input" placeholder="Nome do caixa" required />
                <input name="opening" className="input" inputMode="decimal" placeholder="Saldo inicial (opcional)" />
                <button className="btn w-full">Criar caixa</button>
              </form>
            </div>
          )}
        </div>
      )}

      {!atual && gerir && (
        <form action={criarCaixa} className="card max-w-sm space-y-3 p-4">
          <h2 className="text-sm font-semibold">Criar o primeiro caixa</h2>
          <input name="name" className="input" placeholder="Nome do caixa" required />
          <input name="opening" className="input" inputMode="decimal" placeholder="Saldo inicial (opcional)" />
          <button className="btn btn-primary w-full">Criar caixa</button>
        </form>
      )}
    </div>
  );
}
