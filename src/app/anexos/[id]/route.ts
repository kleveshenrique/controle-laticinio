import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { lerPdf } from "@/lib/storage";

/** Abre o arquivo (PDF, JPG ou PNG) anexado a uma conta. Só para usuários logados. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getUser())) return new Response("Não autorizado", { status: 401 });
  const anexo = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!anexo) return new Response("Arquivo não encontrado", { status: 404 });

  // Arquivos novos ficam no S3; os antigos podem ainda estar no banco (até rodar scripts/migrar-anexos-s3.ts).
  let body: BodyInit;
  if (anexo.storageKey) {
    try {
      body = await lerPdf(anexo.storageKey);
    } catch (e) {
      console.error(`Falha ao ler anexo ${anexo.id} do S3:`, e);
      return new Response("Não foi possível abrir o arquivo agora. Tente novamente.", { status: 502 });
    }
  } else if (anexo.data) {
    body = new Uint8Array(anexo.data);
  } else {
    return new Response("Arquivo não encontrado", { status: 404 });
  }

  return new Response(body, {
    headers: {
      // Anexos antigos não têm o tipo gravado: são todos PDF.
      "Content-Type": anexo.contentType ?? "application/pdf",
      "Content-Length": String(anexo.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(anexo.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
