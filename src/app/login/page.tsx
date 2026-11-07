import { login } from "@/app/actions";

export default function LoginPage({ searchParams }: { searchParams: { erro?: string } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-xl font-semibold">Controle Laticínio</h1>
      <p className="mb-6 text-sm text-muted">Entre para lançar, aprovar e pagar contas.</p>
      <form action={login} className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required autoComplete="username" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <button className="btn btn-primary w-full">Entrar</button>
      </form>
    </main>
  );
}
