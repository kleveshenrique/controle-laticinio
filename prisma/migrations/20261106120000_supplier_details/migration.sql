-- Cadastro completo de fornecedores: tipo (CNPJ/CPF), ativo, endereço e contatos.
CREATE TYPE "PersonType" AS ENUM ('CNPJ', 'CPF');

ALTER TABLE "Supplier"
  ADD COLUMN "personType" "PersonType" NOT NULL DEFAULT 'CNPJ',
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "zipCode" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "number" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "phoneCompany" TEXT,
  ADD COLUMN "phoneFinance" TEXT,
  ADD COLUMN "phoneCommercial" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Documentos antigos podiam ter pontuação; passam a ser guardados só com dígitos.
UPDATE "Supplier" SET "document" = NULLIF(regexp_replace("document", '\D', '', 'g'), '') WHERE "document" IS NOT NULL;
UPDATE "Supplier" SET "personType" = 'CPF' WHERE length("document") = 11;

CREATE INDEX "Supplier_document_idx" ON "Supplier"("document");
