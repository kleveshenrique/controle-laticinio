-- CreateTable
CREATE TABLE "PurchaseOrderRejection" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledById" TEXT,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrderRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderRejection_purchaseOrderId_idx" ON "PurchaseOrderRejection"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "PurchaseOrderRejection" ADD CONSTRAINT "PurchaseOrderRejection_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderRejection" ADD CONSTRAINT "PurchaseOrderRejection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderRejection" ADD CONSTRAINT "PurchaseOrderRejection_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ordens já rejeitadas entram no histórico.
INSERT INTO "PurchaseOrderRejection" ("id", "purchaseOrderId", "userId", "reason", "createdAt")
SELECT 'rej_' || "id", "id", "reviewedById", "rejectionReason", COALESCE("reviewedAt", CURRENT_TIMESTAMP)
FROM "PurchaseOrder" WHERE "status" = 'REJEITADA' AND "reviewedById" IS NOT NULL AND "rejectionReason" IS NOT NULL;
