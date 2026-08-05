-- AlterTable
ALTER TABLE "clinic_settings" ADD COLUMN     "delayThreshold" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "gracePeriod" INTEGER NOT NULL DEFAULT 15;
