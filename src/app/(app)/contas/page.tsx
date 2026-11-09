import { Observacoes } from "@/components/Observacoes";
import type { AccountStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { brl, dateBR, dateTimeBR, formaPagamentoTexto, STATUS, todayISO, VENCIDAS_CLS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Anexos } from "@/components/Anexos";
import { GerenciarAnexos } from "@/components/GerenciarAnexos";
import { EditarConta } from "@/components/EditarConta";
import { cancelar, reenviar } from "@/app/actions";
import { AcoesAprovacao } from "@/components/AcoesAprovacao";
import { AbaAcao, AcoesContasProvider, BotaoAcaoConta } from "@/components/AcoesContas";
import { IconeCancelar, IconeReenviar } from "@/components/Icones";

type SP = { status?: string; q?: string; de?: string; ate?: string; vencidas?: string; erro?: string; ok?: string };

export default async function Contas({ searchParams: sp }: { searchParams: SP }) {
  const user = await requireUser();
  const where: Prisma.AccountWhereInput = {};
  // Sem filtro na URL, abre em "Aprovar" (pendentes). "Todas" usa status=TODAS.
  const status = sp.status ?? (sp.vencidas ? "" : "PENDENTE");
  if (status in STATUS) where.status = status as AccountStatus;
  if (sp.vencidas) {
    where.status = { in: ["PENDENTE", "APROVADA"] };
    where.dueDate = { lt: new Date(todayISO() + "T00:00:00.000Z") };
  }
  if (sp.q) {
    where.OR = [
      { description: { contains: sp.q, mode: "insensitive" } },
      { supplier: { name: { contains: sp.q, mode: "insensitive" } } },
    ];
  }
  if (sp.de || sp.ate) {
    where.dueDate = {
      ...(where.dueDate as object | undefined),
      ...(sp.de ? { gte: new Date(sp.de + "T00:00:00.000Z") } : {}),
      ...(sp.ate ? { lte: new Date(sp.ate + "T00:00:00.000Z") } : {}),
    };
  }

  const contas = await prisma.account.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { code: "asc" }],
    take: 500,
    include: { supplier: true, category: true, paymentMethod: { select: { name: true } }, extraNotes: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }, createdBy: true, reviewedBy: true, paidBy: true, canceledBy: true, cashRegister: true, edits: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }, attachments: { select: { id: true, kind: true, fileName: true }, orderBy: { createdAt: "asc" } }, rejections: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } } },
  });
  const admin = can(user, "ADMIN");
  const aprovador = can(user, "APROVAR");
  const total = contas.reduce((s, a) => s + Number(a.amount), 0);

  // Sugestões de fornecedor/categoria para o modal de edição (só necessário se houver conta editável).
  const precisaListas = contas.some((a) => a.status === "PENDENTE" || a.status === "REJEITADA");
  const [suppliers, categories, paymentMethods] = precisaListas
    ? await Promise.all([
        prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((s) => s.name)),
        prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((c) => c.name)),
        prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((p) => p.name)),
      ])
    : [[], [], []];

  const tabs: [string, string, string?][] = [["TODAS", "Todas"], ...Object.entries(STATUS).map(([k, v]) => [k, "tab" in v ? v.tab : v.label, v.cls] as [string, string, string])];

  return (
    <div>
      <AcoesContasProvider>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, label, cor]) => (
          <AbaAcao key={k} href={`/contas?status=${k}`} ativa={!sp.vencidas && status === k} cor={cor}>
            {label}
          </AbaAcao>
        ))}
        <AbaAcao href="/contas?vencidas=1" ativa={Boolean(sp.vencidas)} cor={VENCIDAS_CLS}>Vencidas</AbaAcao>
      </div>

      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="Buscar fornecedor ou descrição" className="input" />
        <input name="de" type="date" defaultValue={sp.de} className="input" title="Vencimento de" />
        <input name="ate" type="date" defaultValue={sp.ate} className="input" title="Vencimento até" />
        <button className="btn">Filtrar</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="border-b border-line">
            <tr>
              <th className="th">#</th><th className="th">Vencimento</th><th className="th">Fornecedor / descrição</th>
              <th className="th">Situação</th><th className="th text-right">Valor</th><th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {contas.map((a) => {
              const dono = a.createdById === user.id || admin;
              // Quem lançou não aprova a própria conta (exceto administrador).
              const propria = !admin && a.createdById === user.id;
              return (
              <tr key={a.id}>
                <td className="td text-muted">{a.code}</td>
                <td className="td">{dateBR(a.dueDate)}</td>
                <td className="td">
                  <Observacoes
                    className=""
                    conta={<><div className="text-sm font-medium">{a.supplier.name}</div><div className="text-muted">{a.description}{a.category ? ` · ${a.category.name}` : ""}{a.paymentMethod ? ` · ${formaPagamentoTexto(a.paymentMethod.name, a.pixKey)}` : ""}</div></>}
                    notes={a.notes} autor={{ name: a.createdBy.name, createdAt: a.createdAt }} extras={a.extraNotes} rejeicoes={a.rejections} edicoes={a.edits} />
                  <Anexos anexos={a.attachments} />
                  {/* Histórico: quem lançou, analisou, cancelou, editou e pagou. */}
                  <div className="mt-1 space-y-1 text-xs">
                    {a.reviewedBy && a.status !== "PENDENTE" && (
                      <div className={`border-l-2 pl-2 ${a.status === "REJEITADA" ? "border-orange-400 text-orange-800" : "border-emerald-500 text-emerald-800"}`}>
                        {a.status === "REJEITADA" ? "Rejeitada" : "Aprovada"} por {a.reviewedBy.name} em {dateTimeBR(a.reviewedAt)}
                      </div>
                    )}
                    {a.canceledBy && a.status === "CANCELADA" && <div className="border-l-2 border-red-500 pl-2 text-red-700">Cancelada por {a.canceledBy.name} em {dateTimeBR(a.canceledAt)}</div>}
                    {a.paidBy && <div className="border-l-2 border-violet-400 pl-2 text-violet-800">Paga por {a.paidBy.name} em {dateTimeBR(a.paidAt)} · {a.cashRegister?.name}{a.paymentReference ? ` · ${a.paymentReference}` : ""}</div>}
                  </div>
                </td>
                <td className="td">
                  <StatusBadge status={a.status} />
                  {a.rejectionReason && <div className="mt-1 text-xs text-red-700">Motivo: {a.rejectionReason}</div>}
                  {a.status === "CANCELADA" && a.cancelReason && <div className="mt-1 text-xs text-red-700">Motivo: {a.cancelReason}</div>}
                </td>
                <td className="td text-right font-medium">{brl(a.amount)}</td>
                <td className="td">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                  {a.status === "PENDENTE" && aprovador && (
                    <AcoesAprovacao
                      id={a.id}
                      code={a.code}
                      disabled={propria}
                      disabledTitle="Você lançou esta conta; outra pessoa precisa aprovar."
                      podeCancelar={!dono}
                    />
                  )}
                  {(a.status === "PENDENTE" || a.status === "REJEITADA") && dono && (
                    <div className="flex justify-end gap-2">
                      {a.status === "REJEITADA" && (
                        <BotaoAcaoConta id={a.id} chave={`reenviar-${a.id}`} acao={reenviar} className="btn btn-primary btn-icon" title="Reenviar para aprovação">
                          <IconeReenviar />
                        </BotaoAcaoConta>
                      )}
                      {(a.status === "PENDENTE" || a.status === "REJEITADA") && (
                        <EditarConta
                          conta={{
                            id: a.id,
                            status: a.status,
                            code: a.code,
                            description: a.description,
                            supplier: a.supplier.name,
                            category: a.category?.name ?? "",
                            paymentMethod: a.paymentMethod?.name ?? "",
                            pixKey: a.pixKey ?? "",
                            amount: Number(a.amount),
                            dueDate: a.dueDate.toISOString().slice(0, 10),
                            notes: a.notes ?? "",
                          }}
                          anexos={a.attachments}
                          suppliers={suppliers}
                          categories={categories}
                          paymentMethods={paymentMethods}
                        />
                      )}
                      <BotaoAcaoConta id={a.id} chave={`cancelar-dono-${a.id}`} acao={cancelar} className="btn btn-danger btn-icon" title="Cancelar conta">
                        <IconeCancelar />
                      </BotaoAcaoConta>
                    </div>
                  )}
                  {/* Aprovada: quem lança pode incluir NF e boletos. Paga: só o administrador. */}
                  {((a.status === "APROVADA" && can(user, "LANCAR")) || (a.status === "PAGA" && can(user, "ADMIN"))) && (
                    <div className="flex justify-end">
                      <GerenciarAnexos id={a.id} code={a.code} status={a.status} anexos={a.attachments} admin={can(user, "ADMIN")} />
                    </div>
                  )}
                  </div>
                </td>
              </tr>
              );
            })}
            {contas.length === 0 && (
              <tr><td colSpan={6} className="td py-8 text-center text-muted">Nenhuma conta encontrada com esses filtros.</td></tr>
            )}
          </tbody>
          {contas.length > 0 && (
            <tfoot className="border-t border-line">
              <tr><td colSpan={4} className="td text-right text-muted">Total ({contas.length})</td><td className="td text-right font-semibold">{brl(total)}</td><td /></tr>
            </tfoot>
          )}
        </table>
      </div>
      </AcoesContasProvider>
    </div>
  );
}
