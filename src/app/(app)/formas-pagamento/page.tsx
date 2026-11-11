import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, exigirTela, requireUser } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { salvarFormaPagamento } from "@/app/actions";
import { ListaFiltrada, type ItemLista } from "@/components/ListaFiltrada";
import { ehPix } from "@/lib/format";

type SP = { situacao?: string; erro?: string; ok?: string };

export default async function FormasPagamento({ searchParams: sp }: { searchParams: SP }) {
  const user = await requireUser();
  if (!can(user, "LANCAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para gerenciar formas de pagamento."));
  exigirTela(user, "FORMAS_PAGAMENTO");

  // Sem filtro, mostra só as ativas. "todas" e "inativas" mudam isso.
  const situacao = sp.situacao === "todas" || sp.situacao === "inativas" ? sp.situacao : "ativas";
  const where: Prisma.PaymentMethodWhereInput = situacao === "todas" ? {} : { active: situacao === "ativas" };
  const formas = await prisma.paymentMethod.findMany({ where, orderBy: { name: "asc" }, include: { _count: { select: { accounts: true } } } });
  const itens: ItemLista[] = formas.map((f) => ({
    id: f.id,
    busca: f.name,
    node: (
      // key inclui nome/situação para o formulário voltar aos valores salvos depois de atualizar.
      <form key={`${f.name}-${f.active}`} action={salvarFormaPagamento} className="flex flex-wrap items-center gap-3 p-3">
        <input type="hidden" name="id" value={f.id} />
        <input name="name" defaultValue={f.name} className="input max-w-sm flex-1" required minLength={2} maxLength={60} aria-label="Nome da forma de pagamento" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={f.active} /> Ativa
        </label>
        {ehPix(f.name) && <span className="text-xs text-sky-700">Pede chave Pix</span>}
        <span className="text-xs text-muted">{f._count.accounts} conta(s)</span>
        <SubmitButton className="btn ml-auto" pendingText="Salvando…">Salvar</SubmitButton>
      </form>
    ),
  }));

  const abas: [string, string][] = [["ativas", "Ativas"], ["inativas", "Inativas"], ["todas", "Todas"]];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Formas de pagamento</h1>

      <form action={salvarFormaPagamento} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="nova-forma">Nova forma de pagamento</label>
          <input id="nova-forma" name="name" className="input" placeholder="Ex.: Cartão de crédito" required minLength={2} maxLength={60} />
          <p className="mt-1 text-xs text-muted">Formas com “Pix” no nome pedem a chave Pix ao lançar a conta.</p>
        </div>
        <input type="hidden" name="active" value="on" />
        <SubmitButton pendingText="Salvando…">Cadastrar</SubmitButton>
      </form>

      <ListaFiltrada
        base="/formas-pagamento"
        abas={abas}
        situacao={situacao}
        dica="Digite * para buscar todas."
        placeholder="Buscar forma de pagamento"
        itens={itens}
        semBusca="Faça uma busca para ver as formas de pagamento."
        semResultado="Nenhuma forma de pagamento encontrada."
      />
    </div>
  );
}
