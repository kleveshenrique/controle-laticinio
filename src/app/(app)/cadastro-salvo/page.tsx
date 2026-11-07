import Link from "next/link";
import { refValida, tipoValido } from "@/lib/cadastroNovaAba";
import { AvisarOrigem } from "./AvisarOrigem";

/** Depois de um cadastro aberto em outra aba pelo lançamento de contas: avisa a aba de origem e fecha esta. */
export default function CadastroSalvo({ searchParams: sp }: { searchParams: { tipo?: string; ref?: string; nome?: string; ok?: string } }) {
  const nome = sp.nome?.trim() ?? "";
  const tipo = tipoValido(sp.tipo) ? sp.tipo : null;
  const ref = refValida(sp.ref) ? sp.ref : null;
  const lista = tipo === "categoria" ? { href: "/categorias", label: "Ver categorias" } : { href: "/fornecedores", label: "Ver fornecedores" };
  return (
    <div className="card mx-auto max-w-md space-y-3 p-5 text-center">
      <p className="text-sm text-brand-700">{sp.ok ?? "Cadastro salvo."}</p>
      {tipo && ref && nome && (
        <>
          <AvisarOrigem tipo={tipo} nome={nome} refOrigem={ref} />
          <p className="text-sm text-muted">Já está disponível no lançamento de contas. Você pode fechar esta aba.</p>
        </>
      )}
      <Link href={lista.href} className="btn">{lista.label}</Link>
    </div>
  );
}
