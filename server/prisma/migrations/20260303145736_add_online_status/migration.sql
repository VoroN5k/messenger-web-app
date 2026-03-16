/*
  Warnings:

  - You are about to drop the column `IsOnline` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "IsOnline",
ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false;
