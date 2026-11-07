import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { salvarCategoria } from "@/app/actions";

type SP = { q?: string; situacao?: string; erro?: string; ok?: string };

export default async function Categorias({ searchParams: sp }: { searchParams: SP }) {
  const user = await requireUser();
  if (!can(user, "LANCAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para gerenciar categorias."));

  // Sem filtro, mostra só as ativas. "todas" e "inativas" mudam isso.
  const situacao = sp.situacao === "todas" || sp.situacao === "inativas" ? sp.situacao : "ativas";
  const where: Prisma.CategoryWhereInput = situacao === "todas" ? {} : { active: situacao === "ativas" };
  const q = sp.q?.trim();
  if (q) where.name = { contains: q, mode: "insensitive" };
  const categorias = await prisma.category.findMany({ where, orderBy: { name: "asc" }, include: { _count: { select: { accounts: true } } } });

  const abas: [string, string][] = [["ativas", "Ativas"], ["inativas", "Inativas"], ["todas", "Todas"]];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Categorias</h1>
      <Flash erro={sp.erro} ok={sp.ok} />

      <form action={salvarCategoria} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="nova-categoria">Nova categoria</label>
          <input id="nova-categoria" name="name" className="input" placeholder="Nome da categoria" required minLength={2} maxLength={100} />
        </div>
        <input type="hidden" name="active" value="on" />
        <SubmitButton pendingText="Salvando…">Cadastrar</SubmitButton>
      </form>

      <div className="flex flex-wrap gap-2 text-sm">
        {abas.map(([k, label]) => (
          <Link key={k} href={`/categorias?situacao=${k}`} className={`btn ${situacao === k ? "btn-primary" : ""}`}>{label}</Link>
        ))}
      </div>

      <form className="card grid gap-3 p-3 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="situacao" value={situacao} />
        <input name="q" defaultValue={q} placeholder="Buscar categoria" className="input" />
        <button className="btn">Buscar</button>
      </form>

      <div className="card divide-y divide-line">
        {categorias.map((c) => (
          // key inclui nome/situação para o formulário voltar aos valores salvos depois de atualizar.
          <form key={`${c.id}-${c.name}-${c.active}`} action={salvarCategoria} className="flex flex-wrap items-center gap-3 p-3">
            <input type="hidden" name="id" value={c.id} />
            <input name="name" defaultValue={c.name} className="input max-w-sm flex-1" required minLength={2} maxLength={100} aria-label="Nome da categoria" />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="active" defaultChecked={c.active} /> Ativa
            </label>
            <span className="text-xs text-muted">{c._count.accounts} conta(s)</span>
            <SubmitButton className="btn ml-auto" pendingText="Salvando…">Salvar</SubmitButton>
          </form>
        ))}
        {!categorias.length && <p className="p-6 text-center text-sm text-muted">Nenhuma categoria encontrada.</p>}
      </div>
    </div>
  );
}
