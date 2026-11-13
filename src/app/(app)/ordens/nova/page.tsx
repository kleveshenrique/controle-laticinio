import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, exigirTela, requireUser } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { CampoCategoria } from "@/components/CampoCategoria";
import { criarOrdemCompra } from "@/app/actions";

export default async function NovaOrdem() {
  const user = await requireUser();
  exigirTela(user, "ORDENS_COMPRA");
  if (!can(user, "LANCAR")) redirect("/ordens?erro=" + encodeURIComponent("Você não tem permissão para criar ordens de compra."));
  const categorias = await prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } });

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-lg font-semibold">Nova ordem de compra</h1>
      <p className="mb-4 text-sm text-muted">Depois de aprovada, a ordem recebe as cotações dos fornecedores.</p>
      <form action={criarOrdemCompra} className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="description">O que será comprado *</label>
          <input id="description" name="description" className="input" required minLength={2} maxLength={300} autoFocus placeholder="Ex.: 200 kg de sal refinado" />
        </div>
        <div>
          <label className="label" htmlFor="category">Categoria *</label>
          <CampoCategoria id="category" name="category" opcoes={categorias.map((c) => c.name)} />
        </div>
        <div>
          <label className="label" htmlFor="notes">Observações</label>
          <textarea id="notes" name="notes" className="input min-h-[80px]" maxLength={1000} rows={3} />
        </div>
        <div className="flex gap-2">
          <SubmitButton pendingText="Salvando…">Criar ordem de compra</SubmitButton>
          <Link href="/ordens" className="btn">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
