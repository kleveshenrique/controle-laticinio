import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { lerArquivo } from "@/lib/storage";

/** Abre o arquivo da proposta de uma cotação (PDF, JPG ou PNG). Só para usuários logados. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getUser())) return new Response("Não autorizado", { status: 401 });
  const anexo = await prisma.quoteAttachment.findUnique({ where: { id: params.id } });
  if (!anexo) return new Response("Arquivo não encontrado", { status: 404 });

  let body: BodyInit;
  try {
    body = await lerArquivo(anexo.storageKey);
  } catch (e) {
    console.error(`Falha ao ler anexo de cotação ${anexo.id} do S3:`, e);
    return new Response("Não foi possível abrir o arquivo agora. Tente novamente.", { status: 502 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": anexo.contentType ?? "application/pdf",
      "Content-Length": String(anexo.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(anexo.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
