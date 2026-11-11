/**
 * Apaga DEFINITIVAMENTE todos os PDFs dos anexos no S3 (tudo sob S3_PREFIX, padrão "anexos/"),
 * incluindo versões antigas e marcadores de exclusão (não há como recuperar),
 * depois TODOS os dados do banco (mantém as tabelas e o histórico de migrations)
 * e em seguida roda o seed (admin, plano de contas de prisma/categorias.ts, formas de pagamento e caixas: Caixa Principal, Bradesco, Brasil).
 *
 * Uso:  npm run db:reset           (pede confirmação)
 *       npm run db:reset -- --sim  (sem confirmação)
 *
 * O S3 é limpo primeiro: se falhar, o banco não é alterado.
 */
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { apagarTodosPdfsDefinitivo } from "../src/lib/storage";

const prisma = new PrismaClient();

async function confirmar(): Promise<boolean> {
  if (process.argv.includes("--sim")) return true;
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\?.*$/, "");
  const s3 = `s3://${process.env.S3_BUCKET}/${(process.env.S3_PREFIX ?? "anexos").replace(/\/+$/, "")}/`;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const resp = await rl.question(
    `⚠ Isso vai APAGAR todos os dados de "${host}" e DEFINITIVAMENTE todos os arquivos em "${s3}" (inclusive versões antigas).\n  Digite "sim" para continuar: `,
  );
  rl.close();
  return resp.trim().toLowerCase() === "sim";
}

async function main() {
  if (!(await confirmar())) {
    console.log("Cancelado.");
    return;
  }

  console.log("Limpando S3...");
  const { arquivos, versoes } = await apagarTodosPdfsDefinitivo();
  console.log(`✔ ${arquivos} arquivo(s) apagado(s) do S3 (${versoes} versão(ões)/marcador(es) no total).`);

  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;

  if (tabelas.length) {
    const lista = tabelas.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
    console.log(`✔ ${tabelas.length} tabela(s) limpa(s).`);
  }
  await prisma.$disconnect();

  console.log("Rodando seed...");
  execSync("npx prisma db seed", { stdio: "inherit" });
  console.log("✔ Banco e S3 resetados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
