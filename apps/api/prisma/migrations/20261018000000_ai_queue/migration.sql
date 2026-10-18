-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "aiJobId" TEXT;

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL DEFAULT 'TRANSACTION_CLASSIFY',
    "inputText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "leaseExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "nextRetryAt" DATETIME,
    CONSTRAINT "AiJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiJob_status_nextRetryAt_createdAt_idx" ON "AiJob"("status", "nextRetryAt", "createdAt");

-- CreateIndex
CREATE INDEX "AiJob_status_leaseExpiresAt_idx" ON "AiJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "AiJob_userId_createdAt_idx" ON "AiJob"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_aiJobId_key" ON "Transaction"("aiJobId");
