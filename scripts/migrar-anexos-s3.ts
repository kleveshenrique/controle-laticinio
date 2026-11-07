/**
 * Move para o AWS S3 os PDFs que ainda estão gravados no banco (coluna "data").
 * Uso: npx tsx --env-file=.env scripts/migrar-anexos-s3.ts
 * Pode ser rodado mais de uma vez: só processa anexos sem storageKey.
 */
import { PrismaClient } from "@prisma/client";
import { enviarPdf } from "../src/lib/storage";

const prisma = new PrismaClient();

async function main() {
  let movidos = 0;
  for (;;) {
    const lote = await prisma.attachment.findMany({
      where: { storageKey: null, data: { not: null } },
      select: { id: true, fileName: true, data: true },
      take: 20,
    });
    if (!lote.length) break;
    for (const a of lote) {
      const key = await enviarPdf(Buffer.from(a.data!), a.fileName);
      await prisma.attachment.update({ where: { id: a.id }, data: { storageKey: key, data: null } });
      movidos++;
      console.log(`✔ ${a.fileName} → ${key}`);
    }
  }
  console.log(`${movidos} anexo(s) movido(s) para o S3.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
