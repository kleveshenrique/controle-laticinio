/**
 * Verifica se as credenciais do .env têm as permissões que o app e o reset (db:reset) precisam no S3.
 * Não mexe nos PDFs reais: só lista e cria/apaga um arquivo de teste em <prefixo>/_teste-permissao.txt.
 * Uso: npx tsx --env-file=.env scripts/verificar-s3.ts
 */
import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const Bucket = process.env.S3_BUCKET!;
const prefixo = (process.env.S3_PREFIX ?? "anexos").replace(/\/+$/, "");
const Key = `${prefixo}/_teste-permissao.txt`;

let falhas = 0;
async function testar<T>(nome: string, fn: () => Promise<T>, info = false): Promise<T | undefined> {
  try {
    const r = await fn();
    console.log(`✔ ${nome}`);
    return r;
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (!info) falhas++;
    console.log(`${info ? "•" : "✖"} ${nome} → ${err.name}: ${err.message}`);
  }
}

async function main() {
  if (!Bucket) throw new Error("S3_BUCKET não configurado no .env.");
  console.log(`Bucket: s3://${Bucket}/${prefixo}/  (região ${process.env.AWS_REGION})\n`);

  console.log("Configuração do bucket (informativo):");
  const ver = await testar("s3:GetBucketVersioning", () => s3.send(new GetBucketVersioningCommand({ Bucket })), true);
  if (ver) console.log(`   versionamento: ${ver.Status ?? "nunca ativado"}`);
  try {
    const lock = await s3.send(new GetObjectLockConfigurationCommand({ Bucket }));
    console.log(`✔ s3:GetObjectLockConfiguration\n   Object Lock: ${lock.ObjectLockConfiguration?.ObjectLockEnabled ?? "não"}`);
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err.name === "ObjectLockConfigurationNotFoundError") console.log("✔ s3:GetObjectLockConfiguration\n   Object Lock: não (bom)");
    else console.log(`• s3:GetObjectLockConfiguration → ${err.name}: ${err.message}`);
  }

  console.log("\nPermissões necessárias:");
  const lista = await testar("s3:ListBucket", () => s3.send(new ListObjectsV2Command({ Bucket, Prefix: `${prefixo}/`, MaxKeys: 1000 })));
  if (lista) console.log(`   ${lista.KeyCount ?? 0}${lista.IsTruncated ? "+" : ""} arquivo(s) atuais em ${prefixo}/`);
  const versoes = await testar("s3:ListBucketVersions", () =>
    s3.send(new ListObjectVersionsCommand({ Bucket, Prefix: `${prefixo}/`, MaxKeys: 1000 })),
  );
  if (versoes) {
    const n = (versoes.Versions?.length ?? 0) + (versoes.DeleteMarkers?.length ?? 0);
    console.log(`   ${n}${versoes.IsTruncated ? "+" : ""} versão(ões)/marcador(es) em ${prefixo}/`);
  }

  const put = await testar("s3:PutObject", () =>
    s3.send(new PutObjectCommand({ Bucket, Key, Body: "teste", ContentType: "text/plain", ServerSideEncryption: "AES256" })),
  );
  if (put) {
    await testar("s3:GetObject", () => s3.send(new GetObjectCommand({ Bucket, Key })));
    if (put.VersionId) {
      // Bucket versionado: apagar pela versão exige s3:DeleteObjectVersion e remove de vez.
      await testar("s3:DeleteObjectVersion", () => s3.send(new DeleteObjectCommand({ Bucket, Key, VersionId: put.VersionId })));
    } else {
      await testar("s3:DeleteObject", () => s3.send(new DeleteObjectCommand({ Bucket, Key })));
      console.log("   (bucket sem versionamento: s3:DeleteObjectVersion não é necessário)");
    }
  }

  console.log(falhas ? `\n✖ ${falhas} permissão(ões) faltando.` : "\n✔ Todas as permissões necessárias estão OK.");
  process.exitCode = falhas ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
