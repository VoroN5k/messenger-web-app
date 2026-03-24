-- AlterTable
ALTER TABLE "User" ADD COLUMN     "encryptedPrivateKey" TEXT,
ADD COLUMN     "privateKeySalt" TEXT;
