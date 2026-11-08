import { can, requireUser } from "@/lib/auth";
import { NavLinks } from "@/components/NavLinks";
import { MenuUsuario } from "@/components/MenuUsuario";

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
      <header className="border-b border-blue-200 bg-gradient-to-r from-blue-900 via-blue-500 to-blue-50">
        {/* Duas colunas: à esquerda o título e, abaixo, os botões do menu (no celular rolam na horizontal; no desktop
            ficam centralizados); à direita o avatar (menu: foto, senha, Sair) + nome, centralizados na altura das duas linhas. */}
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-4 px-4 py-3">
          <div className="min-w-0 space-y-3">
            <div className="text-center font-semibold text-white drop-shadow-sm">Controle Financeiro</div>
            <NavLinks items={nav.map(({ href, label }) => ({ href, label }))} />
          </div>
          <div className="flex max-w-[8rem] flex-col items-center gap-1">
            <MenuUsuario
              nome={user.name}
              email={user.email}
              fotoUrl={user.avatarKey ? `/avatar/${user.id}?v=${encodeURIComponent(user.avatarKey.split("/").pop()!)}` : null}
            />
            <span className="max-w-full truncate text-xs text-muted" title={user.name}>
              {user.name}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
