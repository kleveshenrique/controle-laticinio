import { Observacoes, type EventoConta } from "@/components/Observacoes";
import { SeloParcelamento } from "@/components/SeloParcelamento";
import { codigosParcelamento, comNotasDaPrimeiraParcela, parcelasAtivas } from "@/lib/parcelamento";
import type { AccountStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { brl, dateBR, formaPagamentoTexto, lerParcelas, STATUS, todayISO, VENCIDAS_CLS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Anexos } from "@/components/Anexos";
import { GerenciarAnexos } from "@/components/GerenciarAnexos";
import { EditarConta } from "@/components/EditarConta";
import { ExcluirAprovada } from "@/components/ExcluirAprovada";
import { cancelar } from "@/app/actions";
import { AcoesAprovacao } from "@/components/AcoesAprovacao";
import { AbaAcao, AcoesContasProvider, BotaoAcaoConta } from "@/components/AcoesContas";
import { IconeCancelar } from "@/components/Icones";

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
  // Editar/excluir conta aprovada: quem lança, quem aprova ou o administrador (não só quem lançou).
  const editaAprovada = admin || can(user, "LANCAR") || aprovador;
  const total = contas.reduce((s, a) => s + Number(a.amount), 0);

  // Código (#) da conta original de cada parcela, mostrado no selo "Parcelamento #12 · 2/3".
  const [parcelamentos, anexosExibidos, ativas] = await Promise.all([
    codigosParcelamento(contas),
    comNotasDaPrimeiraParcela(contas),
    parcelasAtivas(contas),
  ]);

  type Conta = (typeof contas)[number];
  // Aprovação, cancelamento e pagamento entram no balão "Obs", junto das observações.
  // (As rejeições já aparecem lá, com o motivo, pelo histórico de rejeições.)
  const eventosDaConta = (a: Conta): EventoConta[] => [
    ...(a.reviewedBy && a.reviewedAt && (a.status === "APROVADA" || a.status === "PAGA")
      ? [{ key: "aprovada", data: a.reviewedAt, rotulo: "Aprovada", autor: a.reviewedBy.name, cls: "border-emerald-500 text-emerald-800" }]
      : []),
    ...(a.canceledBy && a.canceledAt && a.status === "CANCELADA"
      ? [{ key: "cancelada", data: a.canceledAt, rotulo: "Cancelada", autor: a.canceledBy.name, texto: a.cancelReason ? `Motivo: ${a.cancelReason}` : undefined, cls: "border-red-500 text-red-700" }]
      : []),
    ...(a.paidBy && a.paidAt
      ? [{ key: "paga", data: a.paidAt, rotulo: "Paga", autor: a.paidBy.name, texto: [a.cashRegister?.name, a.paymentReference].filter(Boolean).join(" · ") || undefined, cls: "border-violet-400 text-violet-800" }]
      : []),
  ];

  // Sugestões de fornecedor/categoria para o modal de edição (só necessário se houver conta editável).
  const precisaListas = contas.some((a) => a.status === "PENDENTE" || a.status === "REJEITADA" || a.status === "APROVADA");
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
              <th className="th">Situação</th><th className="th text-right">Valor</th><th className="th text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {contas.map((a) => {
              const dono = a.createdById === user.id || admin;
              // Quem lançou não aprova a própria conta (exceto administrador).
              const propria = !admin && a.createdById === user.id;
              // Parcelas de uma conta parcelada: selo "Parcelamento #12 · 2/3" com o código da conta principal.
              const codigo = a.parcelamentoId ? parcelamentos.get(a.parcelamentoId) : undefined;
              return (
              <tr key={a.id}>
                <td className="td text-muted">{a.code}</td>
                <td className="td">{dateBR(a.dueDate)}</td>
                <td className="td">
                  <Observacoes
                    className=""
                    conta={<><div className="text-sm font-medium">{a.supplier.name}<SeloParcelamento codigo={codigo} descricao={a.description} /></div><div className="text-muted">{a.description}{a.category ? ` · ${a.category.name}` : ""}{a.paymentMethod ? ` · ${formaPagamentoTexto(a.paymentMethod.name, a.pixKey)}` : ""}</div></>}
                    recolher
                    eventos={eventosDaConta(a)}
                    // Anexos dentro do card, na linha do botão "Obs"; o botão de gerenciar anexos fica no fim da linha.
                    // (Aprovada: quem lança pode incluir NF e boletos. Paga: só o administrador.)
                    aoLadoObs={
                      <>
                        <Anexos className="" anexos={anexosExibidos(a, a.attachments)} />
                        {((a.status === "APROVADA" && can(user, "LANCAR")) || (a.status === "PAGA" && admin)) && (
                          <div className="ml-auto">
                            <GerenciarAnexos id={a.id} code={a.code} status={a.status} anexos={a.attachments} admin={admin} primeiraParcela={!a.parcelamentoId || a.parcelamentoId === a.id} />
                          </div>
                        )}
                      </>
                    }
                    notes={a.notes} parcelas={a.parcelas} autor={{ name: a.createdBy.name, createdAt: a.createdAt }} extras={a.extraNotes} rejeicoes={a.rejections} edicoes={a.edits} />
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
                  {(((a.status === "PENDENTE" || a.status === "REJEITADA") && dono) || (a.status === "APROVADA" && editaAprovada)) && (
                    <div className="flex justify-end gap-2">
                      {(a.status === "PENDENTE" || a.status === "REJEITADA" || a.status === "APROVADA") && (
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
                            parcelas: lerParcelas(a.parcelas),
                          }}
                          anexos={a.attachments}
                          suppliers={suppliers}
                          categories={categories}
                          paymentMethods={paymentMethods}
                        />
                      )}
                      {a.status === "APROVADA" ? (
                        // Aprovada: excluir pede confirmação e apaga o boleto do S3.
                        <ExcluirAprovada id={a.id} code={a.code} descricao={`${a.supplier.name} · ${a.description} · ${brl(a.amount)}`} temBoleto={a.attachments.some((x) => x.kind === "BOLETO")}
                          // Última parcela (ou conta sem parcelamento): a nota fiscal também será apagada.
                          apagaNotaFiscal={(!a.parcelamentoId || (ativas.get(a.parcelamentoId) ?? 0) <= 1) && anexosExibidos(a, a.attachments).some((x) => x.kind === "NOTA_FISCAL")}
                        />
                      ) : (
                        <BotaoAcaoConta id={a.id} chave={`cancelar-dono-${a.id}`} acao={cancelar} className="btn btn-danger btn-icon" title="Cancelar conta">
                          <IconeCancelar />
                        </BotaoAcaoConta>
                      )}
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
