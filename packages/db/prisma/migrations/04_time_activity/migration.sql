-- CreateTable
CREATE TABLE "time_activity" (
    "id" UUID NOT NULL,
    "time_entry_id" UUID NOT NULL,
    "contractor_user_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "activity_pct" INTEGER,
    "title" TEXT,
    "screenshot_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "time_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_token" (
    "id" UUID NOT NULL,
    "contractor_user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "extension_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_activity_time_entry_id_captured_at_idx" ON "time_activity"("time_entry_id", "captured_at");
CREATE UNIQUE INDEX "extension_token_token_hash_key" ON "extension_token"("token_hash");
CREATE INDEX "extension_token_contractor_user_id_idx" ON "extension_token"("contractor_user_id");

-- AddForeignKey
ALTER TABLE "time_activity" ADD CONSTRAINT "time_activity_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
