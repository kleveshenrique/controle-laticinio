import { redirect } from "next/navigation";
import { login } from "@/app/actions";
import { getUser } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { CampoSenha } from "@/components/CampoSenha";

/** Gota de leite (marca do sistema). */
function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3Z" />
      <path d="M9 14.5a3 3 0 0 0 3 3" />
    </svg>
  );
}

const DESTAQUES = [
  "Lançamento de contas com anexos e parcelas",
  "Fluxo de aprovação com observações",
  "Controle de pagamentos em um só lugar",
];

export default async function LoginPage({ searchParams }: { searchParams: { erro?: string } }) {
  // Só volta para o painel se o usuário realmente existir e estiver ativo no banco (evita loop de redirecionamento).
  if (await getUser()) redirect("/");
  const erro = searchParams.erro;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Painel da marca (só em telas grandes) */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-500/30" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-blue-50/10" />

        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><Logo className="h-5 w-5" /></span>
          Controle Laticínio
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">As contas do laticínio, organizadas do lançamento ao pagamento.</h2>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {DESTAQUES.map((d) => (
              <li key={d} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {d}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© {new Date().getFullYear()} Laticínio Beatriz</p>
      </section>

      {/* Formulário */}
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700 lg:hidden">
              <Logo />
            </span>
            <h1 className="text-2xl font-semibold">Bem-vindo de volta</h1>
            <p className="mt-1 text-sm text-muted">Entre para lançar, aprovar e pagar contas.</p>
          </div>

          {erro && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" />
              </svg>
              {erro}
            </div>
          )}

          <form action={login} className="card space-y-4 p-6 shadow-sm">
            <div>
              <label className="label" htmlFor="nome">Usuário</label>
              <input
                id="nome"
                name="nome"
                type="text"
                required
                autoFocus
                autoComplete="username"
                autoCapitalize="words"
                spellCheck={false}
                placeholder="Seu nome"
                className="input py-2 focus:border-blue-600 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Senha</label>
              <CampoSenha id="password" name="password" autoComplete="current-password" />
            </div>
            <SubmitButton className="btn w-full border-blue-700 bg-blue-700 py-2 text-white hover:bg-blue-900 focus-visible:outline-blue-600" pendingText="Entrando…">Entrar</SubmitButton>
          </form>

          <p className="mt-6 text-center text-xs text-muted">Esqueceu a senha? Fale com o administrador do sistema.</p>
        </div>
      </section>
    </main>
  );
}
