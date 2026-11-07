import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { maskCep, maskDocumento, maskTelefone, soDigitos } from "@/lib/documentos";
import { Flash } from "@/components/Flash";
import { IconeEditar } from "@/components/Icones";

type SP = { q?: string; situacao?: string; erro?: string; ok?: string };

export default async function Fornecedores({ searchParams: sp }: { searchParams: SP }) {
  const user = await requireUser();
  if (!can(user, "LANCAR")) redirect("/contas?erro=" + encodeURIComponent("Você não tem permissão para gerenciar fornecedores."));

  // Sem filtro, mostra só os ativos. "todos" e "inativos" mudam isso.
  const situacao = sp.situacao === "todos" || sp.situacao === "inativos" ? sp.situacao : "ativos";
  const where: Prisma.SupplierWhereInput = situacao === "todos" ? {} : { active: situacao === "ativos" };
  const q = sp.q?.trim();
  if (q) {
    const doc = soDigitos(q);
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      ...(doc ? [{ document: { contains: doc } }] : []),
    ];
  }
  const fornecedores = await prisma.supplier.findMany({ where, orderBy: { name: "asc" }, take: 500 });

  const abas: [string, string][] = [["ativos", "Ativos"], ["inativos", "Inativos"], ["todos", "Todos"]];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Fornecedores</h1>
        <Link href="/fornecedores/novo" className="btn btn-primary">Novo fornecedor</Link>
      </div>
      <Flash erro={sp.erro} ok={sp.ok} />

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {abas.map(([k, label]) => (
          <Link key={k} href={`/fornecedores?situacao=${k}`} className={`btn ${situacao === k ? "btn-primary" : ""}`}>{label}</Link>
        ))}
      </div>

      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="situacao" value={situacao} />
        <input name="q" defaultValue={q} placeholder="Buscar por empresa, CNPJ/CPF ou cidade" className="input" />
        <button className="btn">Buscar</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              <th className="th">Empresa / CNPJ-CPF</th>
              <th className="th">Endereço</th>
              <th className="th">Contatos</th>
              <th className="th">Situação</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((s) => {
              const contatos = [
                ["Empresa", s.phoneCompany],
                ["Financeiro", s.phoneFinance],
                ["Comercial", s.phoneCommercial],
              ].filter(([, v]) => v);
              const local = [s.city, s.state].filter(Boolean).join("/");
              return (
                <tr key={s.id} className="border-b border-line last:border-0 align-top">
                  <td className="td">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted">
                      {s.document ? `${s.personType} ${maskDocumento(s.personType, s.document)}` : "Sem documento"}
                    </div>
                  </td>
                  <td className="td text-xs">
                    {[s.address, s.number].filter(Boolean).join(", ")}
                    {s.district && <div>{s.district}</div>}
                    <div className="text-muted">{[local, s.zipCode && maskCep(s.zipCode)].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {contatos.length ? contatos.map(([k, v]) => <div key={k}><span className="text-muted">{k}:</span> {maskTelefone(v!)}</div>) : <span className="text-muted">—</span>}
                  </td>
                  <td className="td">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${s.active ? "border-brand-600/30 bg-brand-50 text-brand-700" : "border-gray-200 bg-gray-100 text-gray-600"}`}>
                      {s.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="td text-right">
                    <Link href={`/fornecedores/${s.id}`} className="btn btn-icon" title="Editar" aria-label={`Editar ${s.name}`}><IconeEditar /></Link>
                  </td>
                </tr>
              );
            })}
            {!fornecedores.length && (
              <tr><td colSpan={5} className="td py-6 text-center text-muted">Nenhum fornecedor encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
