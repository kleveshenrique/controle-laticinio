import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectVersionsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

/** Abre um arquivo do bucket para leitura (stream). */
export async function lerArquivo(key: string) {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Objeto vazio no S3: ${key}`);
  return res.Body.transformToWebStream();
}

/** Abre o PDF para leitura (stream). */
export const lerPdf = lerArquivo;

export const TIPOS_AVATAR = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type TipoAvatar = keyof typeof TIPOS_AVATAR;

/** Envia a foto de um usuário (fica em <prefixo>/avatares/) e devolve a chave do objeto. */
export async function enviarAvatar(data: Buffer, tipo: TipoAvatar): Promise<string> {
  const key = `${prefixo()}/avatares/${randomUUID()}.${TIPOS_AVATAR[tipo]}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: data,
      ContentType: tipo,
      ContentLength: data.length,
      ServerSideEncryption: "AES256",
    }),
  );
  return key;
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

/**
 * Apaga DEFINITIVAMENTE tudo sob o prefixo dos anexos (S3_PREFIX, padrão "anexos/"):
 * versões atuais, versões antigas e marcadores de exclusão (delete markers).
 * Funciona também em bucket sem versionamento. Lança erro se algum objeto não puder ser apagado.
 * Devolve quantos arquivos distintos e quantas versões/marcadores foram apagados.
 */
export async function apagarTodosPdfsDefinitivo(): Promise<{ arquivos: number; versoes: number }> {
  const chaves = new Set<string>();
  let versoes = 0;
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const res = await s3().send(
      new ListObjectVersionsCommand({
        Bucket: bucket(),
        Prefix: `${prefixo()}/`,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    );
    const objetos = [...(res.Versions ?? []), ...(res.DeleteMarkers ?? [])]
      .filter((o) => o.Key)
      .map((o) => ({ Key: o.Key!, VersionId: o.VersionId }));

    // Cada página tem no máximo 1000 itens (versões + marcadores), mas apaga em lotes por segurança.
    for (let i = 0; i < objetos.length; i += 1000) {
      const lote = objetos.slice(i, i + 1000);
      const del = await s3().send(
        new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: lote, Quiet: true } }),
      );
      if (del.Errors?.length) {
        const e = del.Errors[0];
        throw new Error(`S3 não excluiu ${e.Key} (versão ${e.VersionId}): ${e.Code} ${e.Message ?? ""}`.trim());
      }
    }
    for (const o of res.Versions ?? []) if (o.Key) chaves.add(o.Key);
    versoes += objetos.length;

    keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
    versionIdMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined;
  } while (keyMarker);
  return { arquivos: chaves.size, versoes };
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
