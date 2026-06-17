-- Optional agreement documents on a contract (NDA / IP assignment / confidentiality / IC agreement / non-solicit
-- / custom). A participant adds it; both parties e-sign (typed name + timestamp = the audit trail). Additive.

-- CreateEnum
CREATE TYPE "ContractDocKind" AS ENUM ('nda', 'ip_assignment', 'confidentiality', 'ic_agreement', 'non_solicit', 'custom');

-- CreateTable
CREATE TABLE "contract_doc" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "kind" "ContractDocKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "added_by_role" TEXT NOT NULL,
    "client_signed_at" TIMESTAMP(3),
    "client_signer_name" TEXT,
    "contractor_signed_at" TIMESTAMP(3),
    "contractor_signer_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_doc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_doc_contract_id_idx" ON "contract_doc"("contract_id");

-- AddForeignKey
ALTER TABLE "contract_doc" ADD CONSTRAINT "contract_doc_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
