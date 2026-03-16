-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "pinnedMessageId" INTEGER;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "forwardedFromId" INTEGER,
ADD COLUMN     "forwardedFromUserId" INTEGER,
ADD COLUMN     "metadata" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "statusEmoji" TEXT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_forwardedFromId_fkey" FOREIGN KEY ("forwardedFromId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_forwardedFromUserId_fkey" FOREIGN KEY ("forwardedFromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
