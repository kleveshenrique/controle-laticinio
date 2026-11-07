import { getUser } from "@/lib/auth";
import { consultarCnpj } from "@/lib/consultas";
import { cnpjValido, soDigitos } from "@/lib/documentos";

/** Consulta os dados cadastrais de um CNPJ (Receita Federal). Só para usuários logados. */
export async function GET(_req: Request, { params }: { params: { cnpj: string } }) {
  if (!(await getUser())) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const cnpj = soDigitos(params.cnpj);
  if (!cnpjValido(cnpj)) return Response.json({ erro: "CNPJ inválido." }, { status: 400 });
  const r = await consultarCnpj(cnpj);
  return r.ok ? Response.json(r.dados) : Response.json({ erro: r.erro }, { status: r.status });
}
