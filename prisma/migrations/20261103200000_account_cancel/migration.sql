-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "canceledById" TEXT;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
