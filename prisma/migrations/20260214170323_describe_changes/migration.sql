/*
  Warnings:

  - A unique constraint covering the columns `[googleId]` on the table `Users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "first_name_ar" DROP NOT NULL,
ALTER COLUMN "last_name_ar" DROP NOT NULL,
ALTER COLUMN "full_name_en" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Users_googleId_key" ON "Users"("googleId");
