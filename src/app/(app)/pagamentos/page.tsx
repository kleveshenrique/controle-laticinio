import { Observacoes } from "@/components/Observacoes";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { brl, dateBR, dateTimeBR, todayISO } from "@/lib/format";
import { Anexos } from "@/components/Anexos";
import { PagarConta } from "@/components/PagarConta";
import { GerenciarAnexos } from "@/components/GerenciarAnexos";
import { AdicionarObservacao } from "@/components/AdicionarObservacao";

export default async function Pagamentos({ searchParams }: { searchParams: { erro?: string; ok?: string } }) {
  const user = await requireUser();
  if (!can(user, "PAGAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para pagar."));

  const hoje = todayISO();
  const [contas, caixas, recentes] = await Promise.all([
    prisma.account.findMany({
      where: { status: "APROVADA" },
      orderBy: [{ dueDate: "asc" }, { code: "asc" }],
      include: { supplier: true, createdBy: { select: { name: true } }, reviewedBy: true, extraNotes: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }, edits: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }, rejections: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }, attachments: { select: { id: true, kind: true, fileName: true }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.cashRegister.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.account.findMany({
      where: { status: "PAGA" },
      orderBy: { paidAt: "desc" },
      take: 10,
      include: { supplier: true, paidBy: true, cashRegister: true },
    }),
  ]);
  const caixasModal = caixas.map((c) => ({ id: c.id, name: c.name, balance: Number(c.balance) }));
  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-1 text-lg font-semibold">Pagamentos</h1>
        <p className="mb-4 text-sm text-muted">Clique em "Pagar" na conta aprovada e escolha o caixa de onde o dinheiro saiu. A baixa é registrada no caixa automaticamente.</p>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">#</th><th className="th">Vencimento</th>
                  <th className="th">Fornecedor / descrição</th><th className="th">Aprovada por</th><th className="th text-right">Valor</th><th className="th text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {contas.map((a) => {
                  const atrasada = a.dueDate.toISOString().slice(0, 10) < hoje;
                  const own = !can(user, "ADMIN") && a.reviewedById === user.id;
                  return (
                    <tr key={a.id} className={own ? "opacity-60" : ""}>
                      <td className="td text-muted">{a.code}</td>
                      <td className={`td ${atrasada ? "font-medium text-red-700" : ""}`}>{dateBR(a.dueDate)}{atrasada && <div className="text-xs">vencida</div>}</td>
                      <td className="td"><Observacoes className="" conta={<><div className="text-sm font-medium">{a.supplier.name}</div><div className="text-muted">{a.description}</div></>} notes={a.notes} autor={{ name: a.createdBy.name, createdAt: a.createdAt }} extras={a.extraNotes} rejeicoes={a.rejections} edicoes={a.edits} /><Anexos anexos={a.attachments} /></td>
                      <td className="td text-xs text-muted">{a.reviewedBy?.name}{own && <div>(você — outra pessoa paga)</div>}</td>
                      <td className="td text-right font-medium">{brl(a.amount)}</td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-2">
                          <AdicionarObservacao id={a.id} code={a.code} />
                          <GerenciarAnexos id={a.id} code={a.code} status="APROVADA" anexos={a.attachments} admin={can(user, "ADMIN")} volta="PAGAMENTOS" />
                          <PagarConta id={a.id} code={a.code} amount={Number(a.amount)} caixas={caixasModal} disabled={own} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {contas.length === 0 && <tr><td colSpan={6} className="td py-8 text-center text-muted">Nenhuma conta aprovada aguardando pagamento.</td></tr>}
              </tbody>
            </table>
          </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Últimos pagamentos</h2>
        <div className="card divide-y divide-line">
          {recentes.map((a) => (
            <div key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
              <span>#{a.code} · {a.supplier.name} <span className="text-xs text-muted">— {a.paidBy?.name}, {dateTimeBR(a.paidAt)}, {a.cashRegister?.name}</span><Observacoes notes={a.notes} /></span>
              <strong>{brl(a.amount)}</strong>
            </div>
          ))}
          {recentes.length === 0 && <p className="p-4 text-sm text-muted">Nenhum pagamento registrado ainda.</p>}
        </div>
      </section>
    </div>
  );
}
