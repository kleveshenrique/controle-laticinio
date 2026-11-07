-- CreateTable
CREATE TABLE "Rejection" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rejection_accountId_createdAt_idx" ON "Rejection"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "Rejection" ADD CONSTRAINT "Rejection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rejection" ADD CONSTRAINT "Rejection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: preserva as rejeições já existentes no histórico
INSERT INTO "Rejection" ("id", "accountId", "userId", "reason", "createdAt")
SELECT 'mig_' || "id", "id", "reviewedById", "rejectionReason", COALESCE("reviewedAt", CURRENT_TIMESTAMP)
FROM "Account"
WHERE "status" = 'REJEITADA' AND "rejectionReason" IS NOT NULL AND "reviewedById" IS NOT NULL;
