import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Armazenamento dos PDFs anexados (pedido, boletos, nota fiscal) no AWS S3.
 * Bucket privado: os arquivos só são entregues pela rota /anexos/[id], que exige login.
 * Credenciais: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (ou perfil/role da máquina), lidas pelo SDK.
 */
let client: S3Client | undefined;
const s3 = () => (client ??= new S3Client({ region: process.env.AWS_REGION }));

function bucket() {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET não configurado no .env.");
  return b;
}

const prefixo = () => (process.env.S3_PREFIX ?? "anexos").replace(/\/+$/, "");

/** Envia um PDF e devolve a chave do objeto no bucket. */
export async function enviarPdf(data: Buffer, fileName: string): Promise<string> {
  const key = `${prefixo()}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.pdf`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: data,
      ContentType: "application/pdf",
      ContentLength: data.length,
      Metadata: { "original-name": encodeURIComponent(fileName) },
      ServerSideEncryption: "AES256",
    }),
  );
  return key;
}

/** Abre o PDF para leitura (stream). */
export async function lerPdf(key: string) {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Objeto vazio no S3: ${key}`);
  return res.Body.transformToWebStream();
}

/**
 * Exclui PDFs do bucket e lança erro se algum não puder ser excluído.
 * Usado antes de confirmar a exclusão dos anexos no banco: se o S3 falhar, o banco não é alterado.
 */
export async function excluirPdfs(keys: (string | null | undefined)[]) {
  const objetos = keys.filter((k): k is string => !!k).map((Key) => ({ Key }));
  for (let i = 0; i < objetos.length; i += 1000) {
    const res = await s3().send(
      new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: objetos.slice(i, i + 1000), Quiet: true } }),
    );
    // DeleteObjects responde 200 mesmo quando algum objeto falha; os erros vêm na lista Errors.
    if (res.Errors?.length) {
      const e = res.Errors[0];
      throw new Error(`S3 não excluiu ${e.Key}: ${e.Code} ${e.Message ?? ""}`.trim());
    }
  }
}

/** Remove PDFs do bucket sem interromper (limpeza de envios que não chegaram ao banco). Falhas só vão para o log. */
export async function removerPdfs(keys: (string | null | undefined)[]) {
  const objetos = keys.filter((k): k is string => !!k).map((Key) => ({ Key }));
  for (let i = 0; i < objetos.length; i += 1000) {
    try {
      await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: objetos.slice(i, i + 1000), Quiet: true } }));
    } catch (e) {
      console.error("Falha ao remover PDFs do S3:", e);
    }
  }
}

type PdfLido = { kind: string; fileName: string; size: number; data: Buffer };

/**
 * Envia os PDFs ao S3 e executa `salvar` com os registros prontos para o banco (com storageKey, sem os bytes).
 * Se `salvar` falhar, os arquivos enviados são removidos do bucket para não ficarem órfãos.
 */
export async function comPdfsNoS3<T extends PdfLido, R>(
  arquivos: T[],
  salvar: (registros: (Omit<T, "data"> & { storageKey: string })[]) => Promise<R>,
): Promise<R> {
  const enviados: string[] = [];
  try {
    const registros = [];
    for (const { data, ...resto } of arquivos) {
      const storageKey = await enviarPdf(data, resto.fileName);
      enviados.push(storageKey);
      registros.push({ ...resto, storageKey });
    }
    return await salvar(registros);
  } catch (e) {
    await removerPdfs(enviados);
    throw e;
  }
}
