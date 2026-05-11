-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
