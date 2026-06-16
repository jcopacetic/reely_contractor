-- Client card-on-file: a Stripe customer + default payment method per Board client (opaque clerk user id),
-- so platform-initiated weekly charges have a method to charge. No raw card data is stored here.

-- CreateEnum
CREATE TYPE "ClientBillingStatus" AS ENUM ('pending', 'ready');

-- CreateTable
CREATE TABLE "client_billing" (
    "id" UUID NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "default_payment_method_id" TEXT,
    "card_brand" TEXT,
    "card_last4" TEXT,
    "status" "ClientBillingStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "client_billing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_billing_client_user_id_key" ON "client_billing"("client_user_id");
CREATE UNIQUE INDEX "client_billing_stripe_customer_id_key" ON "client_billing"("stripe_customer_id");
