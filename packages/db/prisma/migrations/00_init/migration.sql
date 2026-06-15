-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "ContractorStatus" AS ENUM ('applicant', 'vetted', 'suspended');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('apply', 'invite');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('submitted', 'in_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('sent', 'accepted', 'expired');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('contractor', 'applicant', 'admin', 'client', 'system', 'controller');

-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('update', 'milestone', 'achievement');

-- CreateEnum
CREATE TYPE "PostVisibility" AS ENUM ('public', 'followers');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video_embed');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('like', 'celebrate', 'insightful', 'fire', 'support');

-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('hourly', 'fixed');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('open', 'closed', 'filled');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('submitted', 'countered', 'denied', 'accepted', 'withdrawn');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('active', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ContractItemKind" AS ENUM ('milestone', 'scope_add', 'deliverable', 'note');

-- CreateEnum
CREATE TYPE "ContractItemStatus" AS ENUM ('open', 'done', 'void');

-- CreateEnum
CREATE TYPE "TimeSource" AS ENUM ('timer', 'extension', 'manual');

-- CreateTable
CREATE TABLE "contractor_identity" (
    "id" UUID NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "status" "ContractorStatus" NOT NULL DEFAULT 'applicant',
    "vetted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" UUID NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "source" "ApplicationSource" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "video_link" TEXT,
    "reviewer_id" TEXT,
    "notes" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'sent',
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_profile" (
    "id" UUID NOT NULL,
    "contractor_identity_id" UUID NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "category_ids" JSONB NOT NULL DEFAULT '[]',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "public_slug" TEXT,
    "avatar_url" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "contracts_completed" INTEGER NOT NULL DEFAULT 0,
    "hours_logged" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "onboarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "skill_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_doc" (
    "id" UUID NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "doc_key" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_doc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post" (
    "id" UUID NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "PostKind" NOT NULL DEFAULT 'update',
    "visibility" "PostVisibility" NOT NULL DEFAULT 'followers',
    "source_ref" TEXT,
    "reaction_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_media" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "embed_html" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow" (
    "id" UUID NOT NULL,
    "follower_user_id" TEXT NOT NULL,
    "followee_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reaction" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" UUID NOT NULL,
    "type" "ReactionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_award" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "achievement_id" UUID NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_stats" (
    "clerk_user_id" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_day" TEXT,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_stats_pkey" PRIMARY KEY ("clerk_user_id")
);

-- CreateTable
CREATE TABLE "dm_thread" (
    "id" UUID NOT NULL,
    "user_a_user_id" TEXT NOT NULL,
    "user_b_user_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dm_message" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing" (
    "id" UUID NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "board_part_ref" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category_ids" TEXT[],
    "budget_type" "BudgetType" NOT NULL,
    "budget_amount" DECIMAL(12,2),
    "status" "ListingStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "bidder_user_id" TEXT NOT NULL,
    "rate_type" "BudgetType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "hours_estimate" DECIMAL(10,2),
    "message" TEXT,
    "status" "BidStatus" NOT NULL DEFAULT 'submitted',
    "counter_of_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract" (
    "id" UUID NOT NULL,
    "listing_id" UUID,
    "client_user_id" TEXT NOT NULL,
    "contractor_user_id" TEXT NOT NULL,
    "board_ref" TEXT,
    "title" TEXT NOT NULL,
    "rate_type" "BudgetType" NOT NULL,
    "rate_amount" DECIMAL(12,2) NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_item" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "kind" "ContractItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2),
    "status" "ContractItemStatus" NOT NULL DEFAULT 'open',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entry" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "contractor_user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "source" "TimeSource" NOT NULL DEFAULT 'timer',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "billing_cycle_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_event" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contractor_identity_clerk_user_id_key" ON "contractor_identity"("clerk_user_id");

-- CreateIndex
CREATE INDEX "contractor_identity_status_idx" ON "contractor_identity"("status");

-- CreateIndex
CREATE INDEX "application_clerk_user_id_idx" ON "application"("clerk_user_id");

-- CreateIndex
CREATE INDEX "application_status_idx" ON "application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_key" ON "invite"("code");

-- CreateIndex
CREATE INDEX "invite_email_idx" ON "invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_profile_contractor_identity_id_key" ON "contractor_profile"("contractor_identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_profile_clerk_user_id_key" ON "contractor_profile"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_profile_public_slug_key" ON "contractor_profile"("public_slug");

-- CreateIndex
CREATE UNIQUE INDEX "skill_category_name_key" ON "skill_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_category_slug_key" ON "skill_category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_doc_clerk_user_id_doc_key_key" ON "onboarding_doc"("clerk_user_id", "doc_key");

-- CreateIndex
CREATE INDEX "post_author_user_id_idx" ON "post"("author_user_id");

-- CreateIndex
CREATE INDEX "post_created_at_idx" ON "post"("created_at");

-- CreateIndex
CREATE INDEX "post_media_post_id_idx" ON "post_media"("post_id");

-- CreateIndex
CREATE INDEX "follow_followee_user_id_idx" ON "follow"("followee_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_follower_user_id_followee_user_id_key" ON "follow"("follower_user_id", "followee_user_id");

-- CreateIndex
CREATE INDEX "reaction_post_id_idx" ON "reaction"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "reaction_user_id_post_id_key" ON "reaction"("user_id", "post_id");

-- CreateIndex
CREATE INDEX "comment_post_id_idx" ON "comment"("post_id");

-- CreateIndex
CREATE INDEX "comment_parent_id_idx" ON "comment"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_key_key" ON "achievement"("key");

-- CreateIndex
CREATE INDEX "achievement_award_user_id_idx" ON "achievement_award"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_award_user_id_achievement_id_key" ON "achievement_award"("user_id", "achievement_id");

-- CreateIndex
CREATE INDEX "dm_thread_user_a_user_id_idx" ON "dm_thread"("user_a_user_id");

-- CreateIndex
CREATE INDEX "dm_thread_user_b_user_id_idx" ON "dm_thread"("user_b_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dm_thread_user_a_user_id_user_b_user_id_key" ON "dm_thread"("user_a_user_id", "user_b_user_id");

-- CreateIndex
CREATE INDEX "dm_message_thread_id_idx" ON "dm_message"("thread_id");

-- CreateIndex
CREATE INDEX "notification_user_id_idx" ON "notification"("user_id");

-- CreateIndex
CREATE INDEX "notification_created_at_idx" ON "notification"("created_at");

-- CreateIndex
CREATE INDEX "listing_owner_user_id_idx" ON "listing"("owner_user_id");

-- CreateIndex
CREATE INDEX "listing_board_part_ref_idx" ON "listing"("board_part_ref");

-- CreateIndex
CREATE INDEX "listing_status_idx" ON "listing"("status");

-- CreateIndex
CREATE INDEX "listing_category_ids_idx" ON "listing" USING GIN ("category_ids");

-- CreateIndex
CREATE INDEX "bid_listing_id_status_idx" ON "bid"("listing_id", "status");

-- CreateIndex
CREATE INDEX "bid_bidder_user_id_idx" ON "bid"("bidder_user_id");

-- CreateIndex
CREATE INDEX "contract_contractor_user_id_idx" ON "contract"("contractor_user_id");

-- CreateIndex
CREATE INDEX "contract_client_user_id_idx" ON "contract"("client_user_id");

-- CreateIndex
CREATE INDEX "contract_status_idx" ON "contract"("status");

-- CreateIndex
CREATE INDEX "contract_board_ref_idx" ON "contract"("board_ref");

-- CreateIndex
CREATE INDEX "contract_item_contract_id_idx" ON "contract_item"("contract_id");

-- CreateIndex
CREATE INDEX "time_entry_contract_id_idx" ON "time_entry"("contract_id");

-- CreateIndex
CREATE INDEX "time_entry_contractor_user_id_idx" ON "time_entry"("contractor_user_id");

-- CreateIndex
CREATE INDEX "time_entry_contract_id_approved_idx" ON "time_entry"("contract_id", "approved");

-- CreateIndex
CREATE INDEX "app_event_type_idx" ON "app_event"("type");

-- CreateIndex
CREATE INDEX "app_event_source_idx" ON "app_event"("source");

-- CreateIndex
CREATE INDEX "app_event_occurred_at_idx" ON "app_event"("occurred_at");

-- CreateIndex
CREATE INDEX "feature_flag_key_idx" ON "feature_flag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_key_user_id_key" ON "feature_flag"("key", "user_id");

-- AddForeignKey
ALTER TABLE "contractor_profile" ADD CONSTRAINT "contractor_profile_contractor_identity_id_fkey" FOREIGN KEY ("contractor_identity_id") REFERENCES "contractor_identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_award" ADD CONSTRAINT "achievement_award_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_message" ADD CONSTRAINT "dm_message_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "dm_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid" ADD CONSTRAINT "bid_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid" ADD CONSTRAINT "bid_counter_of_id_fkey" FOREIGN KEY ("counter_of_id") REFERENCES "bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_item" ADD CONSTRAINT "contract_item_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

