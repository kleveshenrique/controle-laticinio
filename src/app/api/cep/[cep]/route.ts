import { getUser } from "@/lib/auth";
import { consultarCep } from "@/lib/consultas";
import { soDigitos } from "@/lib/documentos";

/** Consulta o endereço de um CEP. Só para usuários logados. */
export async function GET(_req: Request, { params }: { params: { cep: string } }) {
  if (!(await getUser())) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const cep = soDigitos(params.cep);
  if (cep.length !== 8) return Response.json({ erro: "CEP inválido." }, { status: 400 });
  const r = await consultarCep(cep);
  return r.ok ? Response.json(r.dados) : Response.json({ erro: r.erro }, { status: r.status });
}
