import type { AccountStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { exigirTela, requireUser } from "@/lib/auth";
import { ABAS_CONTAS, podeVerAba, podeVerTela } from "@/lib/telas";
import { STATUS, todayISO, VENCIDAS_CLS } from "@/lib/format";
import { AbaAcao, AcoesContasProvider } from "@/components/AcoesContas";
import { SecoesAprovacaoOrdens } from "@/components/SecoesAprovacaoOrdens";
import { TabelaContas } from "@/components/TabelaContas";

type SP = { status?: string; q?: string; de?: string; ate?: string; vencidas?: string; erro?: string; ok?: string };

export default async function Contas({ searchParams: sp }: { searchParams: SP }) {
  const user = await requireUser();
  exigirTela(user, "CONTAS");
  // Abas liberadas para o usuário (tela Usuários). Pedir uma aba sem acesso cai na primeira liberada.
  const abas = ABAS_CONTAS.filter((a) => podeVerAba(user, a.aba));
  if (abas.length === 0) {
    return <div className="card p-6 text-center text-sm text-muted">Nenhuma aba da tela Contas foi liberada para o seu usuário.</div>;
  }
  const pedida = sp.vencidas ? "VENCIDAS" : sp.status ?? "PENDENTE";
  if (!abas.some((a) => a.aba === pedida)) {
    // Sem filtro na URL (padrão "Aprovar") não é erro: só abre na primeira aba liberada.
    const primeira = abas[0].aba;
    const destino = primeira === "VENCIDAS" ? "/contas?vencidas=1" : `/contas?status=${primeira}`;
    const pediuExplicitamente = Boolean(sp.vencidas || sp.status);
    const erro = sp.erro ?? (pediuExplicitamente ? "Você não tem acesso a essa aba de Contas." : undefined);
    redirect(destino + (erro ? `&erro=${encodeURIComponent(erro)}` : ""));
  }
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

  const liberada = (aba: string) => abas.some((a) => a.aba === aba);
  // Quantidade de contas em cada situação, mostrada nos botões das abas (menos em "Todas").
  const [contagem, qtdVencidas] = await Promise.all([
    prisma.account.groupBy({ by: ["status"], _count: { _all: true } }),
    liberada("VENCIDAS")
      ? prisma.account.count({ where: { status: { in: ["PENDENTE", "APROVADA"] }, dueDate: { lt: new Date(todayISO() + "T00:00:00.000Z") } } })
      : 0,
  ]);
  const qtd = (k: string) => contagem.find((c) => c.status === k)?._count._all ?? 0;

  // Aba "Aprovar": também mostra os orçamentos (cotações em análise) das ordens em cotação, para quem vê Ordens de compra.
  const abaAprovar = !sp.vencidas && status === "PENDENTE";
  const verOrcamentos = abaAprovar && podeVerTela(user, "ORDENS_COMPRA");
  const tabs: [string, string, string?][] = [
    ["TODAS", "Todas"] as [string, string],
    ...Object.entries(STATUS).map(([k, v]) => [k, `${"tab" in v ? v.tab : v.label} (${qtd(k)})`, v.cls] as [string, string, string]),
  ].filter(([k]) => liberada(k));

  return (
    <div>
      <AcoesContasProvider>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, label, cor]) => (
          <AbaAcao key={k} href={`/contas?status=${k}`} ativa={!sp.vencidas && status === k} cor={cor}>
            {label}
          </AbaAcao>
        ))}
        {liberada("VENCIDAS") && <AbaAcao href="/contas?vencidas=1" ativa={Boolean(sp.vencidas)} cor={VENCIDAS_CLS}>Vencidas ({qtdVencidas})</AbaAcao>}
      </div>

      {(() => {
        const form = (
          <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            {status && <input type="hidden" name="status" value={status} />}
            <input name="q" defaultValue={sp.q} placeholder="Buscar fornecedor ou descrição" className="input" />
            <input name="de" type="date" defaultValue={sp.de} className="input" title="Vencimento de" />
            <input name="ate" type="date" defaultValue={sp.ate} className="input" title="Vencimento até" />
            <button className="btn">Filtrar</button>
          </form>
        );
        // Aba "Aprovar": o filtro fica recolhido no botão "Filtros" (aberto se já houver filtro aplicado).
        if (sp.vencidas || status !== "PENDENTE") return form;
        const filtrando = Boolean(sp.q || sp.de || sp.ate);
        return (
          <details className="mb-1" open={filtrando}>
            <summary className="btn mb-3 inline-flex cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              Filtros{filtrando ? " •" : ""}
            </summary>
            {form}
          </details>
        );
      })()}

      {verOrcamentos && <SecoesAprovacaoOrdens user={user} volta="/contas?status=PENDENTE" />}
      <TabelaContas user={user} where={where} titulo={verOrcamentos ? "Contas" : undefined} />
      </AcoesContasProvider>
    </div>
  );
}
