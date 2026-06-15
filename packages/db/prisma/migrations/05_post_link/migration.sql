-- AlterTable: work-activity feed posts (e.g. a job posting) link to their artifact
ALTER TABLE "post" ADD COLUMN     "link_url" TEXT,
ADD COLUMN     "link_label" TEXT;
