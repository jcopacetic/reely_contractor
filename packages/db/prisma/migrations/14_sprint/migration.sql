-- Contract sprints: a two-party-negotiated collection of tasks (with effort points) + a time-to-deliver.
-- Additive; participant-scoped. items = jsonb [{ title, effortPoints }].

-- CreateEnum
CREATE TYPE "SprintStatus" AS ENUM ('proposed', 'agreed', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "sprint" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "status" "SprintStatus" NOT NULL DEFAULT 'proposed',
    "ttd_days" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "client_approved" BOOLEAN NOT NULL DEFAULT false,
    "contractor_approved" BOOLEAN NOT NULL DEFAULT false,
    "last_edited_by_role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreed_at" TIMESTAMP(3),
    CONSTRAINT "sprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sprint_contract_id_created_at_idx" ON "sprint"("contract_id", "created_at");

-- AddForeignKey
ALTER TABLE "sprint" ADD CONSTRAINT "sprint_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
