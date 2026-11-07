-- Categorias podem ser desativadas (deixam de aparecer no lançamento de contas).
ALTER TABLE "Category" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
