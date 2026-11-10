-- Parcelas de uma conta lançada parcelada (desmembrada em uma conta por parcela na aprovação).
ALTER TABLE "Account" ADD COLUMN "parcelas" JSONB;
