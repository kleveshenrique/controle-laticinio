import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { lerArquivo, TIPOS_AVATAR } from "@/lib/storage";

const TIPO_POR_EXTENSAO = Object.fromEntries(Object.entries(TIPOS_AVATAR).map(([tipo, ext]) => [ext, tipo]));

/**
 * Foto (avatar) de um usuário. Só para usuários logados.
 * A URL leva ?v=<chave da foto>: quando a foto muda a URL muda, então pode ficar em cache no navegador.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getUser())) return new Response("Não autorizado", { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { avatarKey: true } });
  if (!user?.avatarKey) return new Response("Sem foto", { status: 404 });

  try {
    const body = await lerArquivo(user.avatarKey);
    return new Response(body, {
      headers: {
        "Content-Type": TIPO_POR_EXTENSAO[user.avatarKey.split(".").pop() ?? ""] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    console.error(`Falha ao ler avatar do usuário ${params.id} no S3:`, e);
    return new Response("Não foi possível abrir a foto agora.", { status: 502 });
  }
}
