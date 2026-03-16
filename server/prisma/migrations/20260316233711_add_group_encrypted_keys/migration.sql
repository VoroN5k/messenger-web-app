-- CreateTable
CREATE TABLE "GroupEncryptedKey" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupEncryptedKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupEncryptedKey_conversationId_idx" ON "GroupEncryptedKey"("conversationId");

-- CreateIndex
CREATE INDEX "GroupEncryptedKey_userId_idx" ON "GroupEncryptedKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupEncryptedKey_conversationId_userId_key" ON "GroupEncryptedKey"("conversationId", "userId");

-- AddForeignKey
ALTER TABLE "GroupEncryptedKey" ADD CONSTRAINT "GroupEncryptedKey_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEncryptedKey" ADD CONSTRAINT "GroupEncryptedKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEncryptedKey" ADD CONSTRAINT "GroupEncryptedKey_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
