-- PDFs passam a ficar no AWS S3; o banco guarda só a chave do objeto.
ALTER TABLE "Attachment" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Attachment" ALTER COLUMN "data" DROP NOT NULL;
