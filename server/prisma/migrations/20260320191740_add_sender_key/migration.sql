/*
  Warnings:

  - You are about to drop the `GroupEncryptedKey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GroupEncryptedKey" DROP CONSTRAINT "GroupEncryptedKey_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "GroupEncryptedKey" DROP CONSTRAINT "GroupEncryptedKey_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "GroupEncryptedKey" DROP CONSTRAINT "GroupEncryptedKey_userId_fkey";

-- DropTable
DROP TABLE "GroupEncryptedKey";

-- CreateTable
CREATE TABLE "GroupSenderKey" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "senderId" INTEGER NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSenderKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupSenderKey_conversationId_recipientId_idx" ON "GroupSenderKey"("conversationId", "recipientId");

-- CreateIndex
CREATE INDEX "GroupSenderKey_conversationId_senderId_idx" ON "GroupSenderKey"("conversationId", "senderId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSenderKey_conversationId_senderId_recipientId_key" ON "GroupSenderKey"("conversationId", "senderId", "recipientId");

-- AddForeignKey
ALTER TABLE "GroupSenderKey" ADD CONSTRAINT "GroupSenderKey_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSenderKey" ADD CONSTRAINT "GroupSenderKey_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSenderKey" ADD CONSTRAINT "GroupSenderKey_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
