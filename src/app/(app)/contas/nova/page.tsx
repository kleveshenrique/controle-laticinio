import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { LancamentoForm } from "@/components/LancamentoForm";
import { UserError } from "@/lib/errors";
import { redirect } from "next/navigation";

export default async function NovaConta({ searchParams }: { searchParams: { erro?: string; ok?: string } }) {
  try {
    await requirePermission("LANCAR");
  } catch (e) {
    if (e instanceof UserError) redirect("/contas?erro=" + encodeURIComponent(e.message));
    throw e;
  }
  const [suppliers, categories, paymentMethods] = await Promise.all([
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }),
    prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Lançar contas a pagar</h1>
      <p className="mb-4 text-sm text-muted">Preencha quantas linhas precisar. Linhas em branco são ignoradas. Depois de lançadas, as contas aguardam aprovação.</p>
      <div className="card p-4">
        <LancamentoForm suppliers={suppliers.map((s) => s.name)} categories={categories.map((c) => c.name)} paymentMethods={paymentMethods.map((p) => p.name)} />
      </div>
    </div>
  );
}
