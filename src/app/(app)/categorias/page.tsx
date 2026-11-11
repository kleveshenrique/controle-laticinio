import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, exigirTela, requireUser } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { salvarCategoria } from "@/app/actions";
import { ListaFiltrada, type ItemLista } from "@/components/ListaFiltrada";

type SP = { situacao?: string; erro?: string; ok?: string };

export default async function Categorias({ searchParams: sp }: { searchParams: SP }) {
  const user = await requireUser();
  if (!can(user, "LANCAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para gerenciar categorias."));
  exigirTela(user, "CATEGORIAS");

  // Sem filtro, mostra só as ativas. "todas" e "inativas" mudam isso.
  const situacao = sp.situacao === "todas" || sp.situacao === "inativas" ? sp.situacao : "ativas";
  const where: Prisma.CategoryWhereInput = situacao === "todas" ? {} : { active: situacao === "ativas" };
  // Carrega as da aba; o filtro por texto é feito na tela enquanto se digita (a lista começa vazia).
  const categorias = await prisma.category.findMany({ where, orderBy: { name: "asc" }, include: { _count: { select: { accounts: true } } } });
  const itens: ItemLista[] = categorias.map((c) => ({
    id: c.id,
    busca: c.name,
    node: (
      // key inclui nome/situação para o formulário voltar aos valores salvos depois de atualizar.
      <form key={`${c.name}-${c.active}`} action={salvarCategoria} className="flex flex-wrap items-center gap-3 p-3">
        <input type="hidden" name="id" value={c.id} />
        <input name="name" defaultValue={c.name} className="input max-w-sm flex-1" required minLength={2} maxLength={100} aria-label="Nome da categoria" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={c.active} /> Ativa
        </label>
        <span className="text-xs text-muted">{c._count.accounts} conta(s)</span>
        <SubmitButton className="btn ml-auto" pendingText="Salvando…">Salvar</SubmitButton>
      </form>
    ),
  }));

  const abas: [string, string][] = [["ativas", "Ativas"], ["inativas", "Inativas"], ["todas", "Todas"]];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Categorias</h1>

      <form action={salvarCategoria} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="nova-categoria">Nova categoria</label>
          <input id="nova-categoria" name="name" className="input" placeholder="Nome da categoria" required minLength={2} maxLength={100} />
        </div>
        <input type="hidden" name="active" value="on" />
        <SubmitButton pendingText="Salvando…">Cadastrar</SubmitButton>
      </form>

      <ListaFiltrada
        base="/categorias"
        abas={abas}
        situacao={situacao}
        dica="Digite * para buscar todas."
        placeholder="Buscar categoria"
        itens={itens}
        semBusca="Faça uma busca para ver as categorias."
        semResultado="Nenhuma categoria encontrada."
      />
    </div>
  );
}
