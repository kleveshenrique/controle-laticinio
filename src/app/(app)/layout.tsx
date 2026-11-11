import { requireUser } from "@/lib/auth";
import { telasVisiveis } from "@/lib/telas";
import { NavLinks } from "@/components/NavLinks";
import { MenuUsuario } from "@/components/MenuUsuario";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Botões do menu: telas liberadas para o usuário (tela marcada em Usuários + permissão da tela).
  const nav = telasVisiveis(user);

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
