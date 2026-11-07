import { can, requireUser } from "@/lib/auth";
import { NavLinks } from "@/components/NavLinks";
import { logout } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = [
    { href: "/", label: "Painel", show: true },
    { href: "/contas", label: "Contas", show: true },
    { href: "/contas/nova", label: "Lançar contas", show: can(user, "LANCAR") },
    { href: "/pagamentos", label: "Pagamentos", show: can(user, "PAGAR") },
    { href: "/caixa", label: "Caixa", show: can(user, "CAIXA") || can(user, "PAGAR") },
    { href: "/usuarios", label: "Usuários", show: can(user, "ADMIN") },
    { href: "/fornecedores", label: "Fornecedores", show: can(user, "LANCAR") },
    { href: "/categorias", label: "Categorias", show: can(user, "LANCAR") },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold text-brand-900">Controle Laticínio</span>
          <NavLinks items={nav.map(({ href, label }) => ({ href, label }))} />
          <form action={logout} className="flex items-center gap-3 text-sm">
            <span className="text-muted">{user.name}</span>
            <button className="btn">Sair</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
