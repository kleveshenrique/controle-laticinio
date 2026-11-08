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
      <header className="border-b border-line bg-white">
        {/* 1ª linha: título centralizado (colunas laterais iguais) e avatar (menu: foto, senha, Sair) + nome à direita.
            2ª linha: botões do menu (no celular rolam na horizontal; no desktop ficam centralizados). */}
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span aria-hidden />
            <span className="text-center font-semibold text-brand-900">Controle Financeiro</span>
            <div className="flex min-w-0 flex-col items-end gap-1">
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
          <NavLinks items={nav.map(({ href, label }) => ({ href, label }))} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
