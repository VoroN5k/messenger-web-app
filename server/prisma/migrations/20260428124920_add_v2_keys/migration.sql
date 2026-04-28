-- AlterTable
ALTER TABLE "GroupSenderKey" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "encryptedPrivateKeyV2" TEXT;

-- CreateTable
CREATE TABLE "UserKeyBundleV2" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "bundle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKeyBundleV2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserKeyBundleV2_userId_key" ON "UserKeyBundleV2"("userId");

-- AddForeignKey
ALTER TABLE "UserKeyBundleV2" ADD CONSTRAINT "UserKeyBundleV2_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
