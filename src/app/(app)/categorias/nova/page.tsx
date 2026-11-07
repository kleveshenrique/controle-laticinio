import Link from "next/link";
import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { salvarCategoria } from "@/app/actions";

export default async function NovaCategoria({ searchParams }: { searchParams: { erro?: string } }) {
  const user = await requireUser();
  if (!can(user, "LANCAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para gerenciar categorias."));
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-lg font-semibold">Nova categoria</h1>
      <form action={salvarCategoria} className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="name">Nome *</label>
          <input id="name" name="name" className="input" required minLength={2} maxLength={100} autoFocus />
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="active" defaultChecked /> Ativa
        </label>
        <div className="flex gap-2">
          <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
          <Link href="/categorias" className="btn">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
