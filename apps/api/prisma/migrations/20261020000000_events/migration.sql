-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "budget" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_ownerId_name_key" ON "Event"("ownerId", "name");

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "eventId" TEXT REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Transaction_ownerId_eventId_idx" ON "Transaction"("ownerId", "eventId");
