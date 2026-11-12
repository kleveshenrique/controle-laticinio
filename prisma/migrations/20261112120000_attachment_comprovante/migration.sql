-- Comprovante de pagamento (PDF, JPG ou PNG).
ALTER TYPE "AttachmentKind" ADD VALUE 'COMPROVANTE';
ALTER TABLE "Attachment" ADD COLUMN "contentType" TEXT;
