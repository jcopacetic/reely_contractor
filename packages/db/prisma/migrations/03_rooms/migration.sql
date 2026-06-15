-- DropTable (the old 1:1 DM — empty in prod, no data to migrate)
DROP TABLE "dm_message";
DROP TABLE "dm_thread";

-- CreateEnum
CREATE TYPE "RoomKind" AS ENUM ('direct', 'hire', 'team');
CREATE TYPE "RoomParticipantKind" AS ENUM ('contractor', 'tenant');

-- CreateTable
CREATE TABLE "room" (
    "id" UUID NOT NULL,
    "kind" "RoomKind" NOT NULL,
    "tenant_ref" TEXT,
    "board_ref" TEXT,
    "title" TEXT,
    "created_by" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_participant" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "kind" "RoomParticipantKind" NOT NULL,
    "contractor_user_id" TEXT,
    "tenant_ref" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    CONSTRAINT "room_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_message" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "sender_tenant_ref" TEXT,
    "sender_label" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_read" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "room_read_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_tenant_ref_idx" ON "room"("tenant_ref");
CREATE UNIQUE INDEX "room_participant_room_id_contractor_user_id_key" ON "room_participant"("room_id", "contractor_user_id");
CREATE INDEX "room_participant_contractor_user_id_idx" ON "room_participant"("contractor_user_id");
CREATE INDEX "room_participant_room_id_idx" ON "room_participant"("room_id");
CREATE INDEX "room_message_room_id_created_at_idx" ON "room_message"("room_id", "created_at");
CREATE UNIQUE INDEX "room_read_room_id_user_id_key" ON "room_read"("room_id", "user_id");

-- AddForeignKey
ALTER TABLE "room_participant" ADD CONSTRAINT "room_participant_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_message" ADD CONSTRAINT "room_message_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_read" ADD CONSTRAINT "room_read_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
