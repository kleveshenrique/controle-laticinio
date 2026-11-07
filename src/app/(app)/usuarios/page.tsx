import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { PERMISSIONS, PERMISSION_LABEL } from "@/lib/permissions";
import { SubmitButton } from "@/components/SubmitButton";
import { atualizarUsuario, criarUsuario } from "@/app/actions";

function PermissionChecks({ selected = [] as string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {PERMISSIONS.map((p) => (
        <label key={p} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="permissions" value={p} defaultChecked={selected.includes(p)} />
          {PERMISSION_LABEL[p]}
        </label>
      ))}
    </div>
  );
}

export default async function Usuarios({ searchParams }: { searchParams: { erro?: string; ok?: string; salvo?: string; t?: string } }) {
  const me = await requireUser();
  if (!can(me, "ADMIN")) redirect("/contas?erro=" + encodeURIComponent("Apenas administradores gerenciam usuários."));
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const salvo = users.some((u) => u.id === searchParams.salvo) ? searchParams.salvo : undefined;

  return (
    <div className="space-y-6">

      {/* key muda quando um usuário é criado: o formulário é recriado com os campos limpos. Em caso de erro, mantém o que foi digitado. */}
      <form key={`novo-${users.length}`} action={criarUsuario} className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Novo usuário</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input name="name" className="input" placeholder="Nome" required />
          <input name="email" type="email" className="input" placeholder="E-mail" required />
          <input name="password" type="password" className="input" placeholder="Senha (mín. 6 caracteres)" required minLength={6} autoComplete="new-password" />
        </div>
        <PermissionChecks />
        <button className="btn btn-primary">Criar usuário</button>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Usuários</h2>
        {users.map((u) => (
          // key muda a cada salvamento deste usuário: o campo de senha volta vazio.
          <form key={u.id === salvo ? `${u.id}-${searchParams.t}` : u.id} action={atualizarUsuario} className="card space-y-3 p-4">
            <input type="hidden" name="userId" value={u.id} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong className="text-sm">{u.name}</strong> <span className="text-sm text-muted">{u.email}</span></div>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} /> Ativo</label>
            </div>
            <PermissionChecks selected={u.permissions} />
            <div className="flex flex-wrap items-center gap-3">
              <input name="password" type="password" className="input max-w-xs" placeholder="Nova senha (opcional, mín. 6)" minLength={6} autoComplete="new-password" />
              <SubmitButton className="btn" pendingText="Salvando…">Salvar</SubmitButton>
            </div>
          </form>
        ))}
      </section>
    </div>
  );
}
