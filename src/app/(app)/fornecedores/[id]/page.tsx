import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { FornecedorForm } from "@/components/FornecedorForm";

export default async function EditarFornecedor({ params, searchParams }: { params: { id: string }; searchParams: { erro?: string } }) {
  const user = await requireUser();
  if (!can(user, "LANCAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para gerenciar fornecedores."));
  const s = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!s) notFound();
  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Editar fornecedor</h1>
      <div className="card p-4">
        <FornecedorForm
          inicial={{
            id: s.id,
            personType: s.personType,
            document: s.document ?? "",
            name: s.name,
            active: s.active,
            zipCode: s.zipCode ?? "",
            state: s.state ?? "",
            city: s.city ?? "",
            address: s.address ?? "",
            number: s.number ?? "",
            district: s.district ?? "",
            phoneCompany: s.phoneCompany ?? "",
            phoneFinance: s.phoneFinance ?? "",
            phoneCommercial: s.phoneCommercial ?? "",
          }}
        />
      </div>
    </div>
  );
}
