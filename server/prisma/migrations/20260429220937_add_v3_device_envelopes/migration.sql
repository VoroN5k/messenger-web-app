-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "senderDeviceId" INTEGER;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceId" INTEGER;

-- CreateTable
CREATE TABLE "Device" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "bundle" TEXT NOT NULL,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageKeyEnvelope" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "ciphertext" TEXT NOT NULL,

    CONSTRAINT "MessageKeyEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "MessageKeyEnvelope_messageId_idx" ON "MessageKeyEnvelope"("messageId");

-- CreateIndex
CREATE INDEX "MessageKeyEnvelope_deviceId_idx" ON "MessageKeyEnvelope"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageKeyEnvelope_messageId_deviceId_key" ON "MessageKeyEnvelope"("messageId", "deviceId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderDeviceId_fkey" FOREIGN KEY ("senderDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageKeyEnvelope" ADD CONSTRAINT "MessageKeyEnvelope_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageKeyEnvelope" ADD CONSTRAINT "MessageKeyEnvelope_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
