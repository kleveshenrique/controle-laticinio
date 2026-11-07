import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { FornecedorForm } from "@/components/FornecedorForm";

export default async function NovoFornecedor({ searchParams }: { searchParams: { erro?: string } }) {
  const user = await requireUser();
  if (!can(user, "LANCAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para gerenciar fornecedores."));
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Novo fornecedor</h1>
      <p className="mb-4 text-sm text-muted">
        Com CNPJ, os dados são buscados automaticamente na Receita Federal. O CEP preenche o endereço ao teclar Enter ou sair do campo.
      </p>
      <div className="card p-4">
        <FornecedorForm />
      </div>
    </div>
  );
}
