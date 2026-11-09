-- Formas de pagamento das contas; Pix guarda também a chave do recebedor.
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "PaymentMethod"("name");

ALTER TABLE "Account" ADD COLUMN "paymentMethodId" TEXT;
ALTER TABLE "Account" ADD COLUMN "pixKey" TEXT;

ALTER TABLE "Account" ADD CONSTRAINT "Account_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Formas de pagamento iniciais.
INSERT INTO "PaymentMethod" ("id", "name") VALUES
    ('forma_dinheiro', 'Dinheiro'),
    ('forma_boleto', 'Boleto'),
    ('forma_pix', 'Pix'),
    ('forma_promissoria', 'Promissória')
ON CONFLICT ("name") DO NOTHING;
