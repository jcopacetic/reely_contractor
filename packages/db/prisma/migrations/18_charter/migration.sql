-- Kickoff charter: the front-door alignment doc (goals / working agreement / success criteria) + a close-out
-- reflection, ONE per contract. Both parties acknowledge to kick off. Additive; a new singleton table. The
-- formal review stays in contractor_review (linked, not duplicated); never touches the charge path.

-- CreateTable
CREATE TABLE "charter" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "goals" TEXT,
    "working_agreement" TEXT,
    "success_criteria" TEXT,
    "client_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "contractor_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "last_edited_by_role" TEXT,
    "kicked_off_at" TIMESTAMP(3),
    "close_out_note" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charter_contract_id_key" ON "charter"("contract_id");

-- AddForeignKey
ALTER TABLE "charter" ADD CONSTRAINT "charter_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
