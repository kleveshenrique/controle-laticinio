import Link from "next/link";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth";
import { dateTimeBR } from "@/lib/format";
import { AcoesOrdem } from "@/components/AcoesOrdem";
import { buscarOrdensEmCotacao, OrdensEmCotacao } from "@/components/OrdensEmCotacao";

type Usuario = { id: string; permissions: string[] };

/**
 * Seções "Ordens de compra" (aguardando aprovação) e "Orçamentos" (cotações em análise das ordens em cotação),
 * usadas na aba Aprovar de Contas e de Ordens de compra. `volta`: tela para onde voltar depois de aprovar/rejeitar.
 */
export async function SecoesAprovacaoOrdens({ user, volta }: { user: Usuario; volta: string }) {
  const admin = can(user, "ADMIN");
  const aprovador = can(user, "APROVAR");
  const [ordensEmCotacao, ordensPendentes] = await Promise.all([
    // Ordens em cotação com orçamentos em análise.
    buscarOrdensEmCotacao({ quotes: { some: { status: "PENDENTE" } } }),
    // Ordens de compra aguardando aprovação.
    prisma.purchaseOrder.findMany({
      where: { status: "PENDENTE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, description: true, notes: true, createdAt: true, createdById: true, category: { select: { name: true } }, createdBy: { select: { name: true } } },
    }),
  ]);
  // Listas do ícone "Alterar" das cotações (só para quem lança).
  const listas = can(user, "LANCAR")
    ? await Promise.all([
        prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((s) => s.name)),
        prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }).then((l) => l.map((p) => p.name)),
      ]).then(([fornecedores, formas]) => ({ fornecedores, formas }))
    : undefined;

  return (
    <>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Ordens de compra ({ordensPendentes.length})</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-line">
              <tr>
                <th className="th">#</th><th className="th">Descrição</th><th className="th">Criada por</th><th className="th text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ordensPendentes.map((o) => (
                <tr key={o.id}>
                  <td className="td text-muted"><Link href={`/ordens/${o.id}`} className="hover:underline">{o.code}</Link></td>
                  <td className="td">
                    <Link href={`/ordens/${o.id}`} className="text-sm font-medium hover:underline">{o.description}</Link>
                    <div className="text-xs text-muted">{o.category.name}</div>
                    {o.notes && <div className="whitespace-pre-wrap text-xs text-muted">{o.notes}</div>}
                  </td>
                  <td className="td text-xs text-muted">{o.createdBy.name}<div>{dateTimeBR(o.createdAt)}</div></td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-2">
                      {aprovador && (admin || o.createdById !== user.id) ? (
                        <AcoesOrdem id={o.id} code={o.code} aprovar compacto volta={volta} />
                      ) : (
                        <span className="text-xs text-muted">{aprovador ? "Você criou; outra pessoa aprova" : "Aguardando quem aprova"}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {ordensPendentes.length === 0 && <tr><td colSpan={4} className="td py-6 text-center text-muted">Nenhuma ordem de compra aguardando aprovação.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Orçamentos ({ordensEmCotacao.length})</h2>
        <OrdensEmCotacao user={user} ordens={ordensEmCotacao} volta={volta} vazio="Nenhum orçamento aguardando aprovação." listas={listas} />
      </section>
    </>
  );
}
