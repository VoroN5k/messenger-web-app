-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "scheduledDeleteAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ConversationMember" ADD COLUMN     "clearedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ConversationMember_conversationId_userId_clearedAt_idx" ON "ConversationMember"("conversationId", "userId", "clearedAt");
