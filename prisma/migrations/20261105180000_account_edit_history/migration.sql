-- CreateTable
CREATE TABLE "AccountEdit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountEdit_accountId_createdAt_idx" ON "AccountEdit"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountEdit" ADD CONSTRAINT "AccountEdit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEdit" ADD CONSTRAINT "AccountEdit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
