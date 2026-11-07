import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { refValida } from "@/lib/cadastroNovaAba";
import { Flash } from "@/components/Flash";
import { FornecedorForm } from "@/components/FornecedorForm";

export default async function NovoFornecedor({ searchParams }: { searchParams: { erro?: string; ref?: string } }) {
  const user = await requireUser();
  if (!can(user, "LANCAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para gerenciar fornecedores."));
  // ref: cadastro aberto em outra aba pelo lançamento de contas.
  const ref = refValida(searchParams.ref) ? searchParams.ref : undefined;
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Novo fornecedor</h1>
      <p className="mb-4 text-sm text-muted">
        Com CNPJ, os dados são buscados automaticamente na Receita Federal. O CEP preenche o endereço ao teclar Enter ou sair do campo.
        {ref && " Ao salvar, o fornecedor já aparece no lançamento de contas e esta aba é fechada."}
      </p>
      <Flash erro={searchParams.erro} />
      <div className="card p-4">
        <FornecedorForm refOrigem={ref} />
      </div>
    </div>
  );
}
