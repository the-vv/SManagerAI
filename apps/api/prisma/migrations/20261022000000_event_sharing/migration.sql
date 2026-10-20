-- AlterTable
ALTER TABLE "Event" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "Event" ADD COLUMN "shareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "allowGuestExpenses" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventExpense" ADD COLUMN "addedByGuest" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Event_shareToken_key" ON "Event"("shareToken");
