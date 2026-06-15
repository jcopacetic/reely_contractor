-- Client reviews of the contractor (weekly + final). Weekly = contractor approve-for-display; final = always public.
CREATE TYPE "ReviewKind" AS ENUM ('weekly', 'final');

CREATE TABLE "contractor_review" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "contractor_user_id" TEXT NOT NULL,
    "author_ref" TEXT NOT NULL,
    "author_label" TEXT,
    "kind" "ReviewKind" NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "week_of" TIMESTAMP(3),
    "approved_for_display" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contractor_review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contractor_review_contract_id_week_of_key" ON "contractor_review"("contract_id", "week_of");
CREATE INDEX "contractor_review_contractor_user_id_idx" ON "contractor_review"("contractor_user_id");

ALTER TABLE "contractor_review" ADD CONSTRAINT "contractor_review_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
