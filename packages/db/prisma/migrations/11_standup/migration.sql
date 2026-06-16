-- Contract stand-ups: a structured progress update (done / next / blockers) on a contract, posted by a
-- participant. The first of the chat-mediated agile ceremonies. Additive; participant-scoped.

-- CreateTable
CREATE TABLE "standup" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "by_user_id" TEXT NOT NULL,
    "done" TEXT NOT NULL,
    "next" TEXT NOT NULL,
    "blockers" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "standup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "standup_contract_id_created_at_idx" ON "standup"("contract_id", "created_at");

-- AddForeignKey
ALTER TABLE "standup" ADD CONSTRAINT "standup_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
