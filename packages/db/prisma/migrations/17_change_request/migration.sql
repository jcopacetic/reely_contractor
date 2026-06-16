-- Change-requests: a two-party-agreed mid-flight contract amendment (scope / rate / timeline). A rate change
-- records the proposed new rate but does NOT touch the contract/billing until enacted (the deferred apply step
-- writes applied_at). Additive; a new table + two enums; never touches the charge path.

-- CreateEnum
CREATE TYPE "ChangeRequestKind" AS ENUM ('scope', 'rate', 'timeline', 'other');
CREATE TYPE "ChangeRequestStatus" AS ENUM ('proposed', 'agreed', 'withdrawn');

-- CreateTable
CREATE TABLE "change_request" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "kind" "ChangeRequestKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "proposed_rate_type" "BudgetType",
    "proposed_rate_amount" DECIMAL(12,2),
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'proposed',
    "client_approved" BOOLEAN NOT NULL DEFAULT false,
    "contractor_approved" BOOLEAN NOT NULL DEFAULT false,
    "last_edited_by_role" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreed_at" TIMESTAMP(3),

    CONSTRAINT "change_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_request_contract_id_created_at_idx" ON "change_request"("contract_id", "created_at");

-- AddForeignKey
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
