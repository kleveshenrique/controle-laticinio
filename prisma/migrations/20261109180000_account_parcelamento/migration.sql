-- Liga as contas desmembradas de uma mesma conta parcelada (id da 1ª parcela).
ALTER TABLE "Account" ADD COLUMN "parcelamentoId" TEXT;

CREATE INDEX "Account_parcelamentoId_idx" ON "Account"("parcelamentoId");
