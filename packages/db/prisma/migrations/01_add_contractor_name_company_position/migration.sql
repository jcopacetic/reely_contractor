-- AlterTable
ALTER TABLE "contractor_profile" ADD COLUMN     "company" TEXT,
ADD COLUMN     "first_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "last_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "position" TEXT;

