-- CreateEnum
CREATE TYPE "PlatformStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AppPlatformStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('active', 'paused', 'uninstalled', 'suspended');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "SsoProviderStatus" AS ENUM ('active', 'disabled', 'pending_setup');

-- CreateEnum
CREATE TYPE "SsoProtocol" AS ENUM ('oidc', 'saml');

-- CreateEnum
CREATE TYPE "SsoUserStatus" AS ENUM ('active', 'blocked', 'pending');

-- CreateEnum
CREATE TYPE "LoginEventType" AS ENUM ('login_initiated', 'login_success', 'login_failed', 'logout', 'token_refresh');

-- CreateTable
CREATE TABLE "platforms" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "PlatformStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon_url" VARCHAR(500),
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_platforms" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "status" "AppPlatformStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "app_platform_id" INTEGER NOT NULL,
    "platform_store_id" VARCHAR(100) NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "owner_email" VARCHAR(255) NOT NULL,
    "credentials" TEXT NOT NULL,
    "is_plus" BOOLEAN NOT NULL DEFAULT false,
    "country" VARCHAR(10),
    "status" "StoreStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "app_platform_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "monthly_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "annual_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "user_limit" INTEGER NOT NULL DEFAULT -1,
    "features" JSONB,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "store_id" UUID NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
    "current_user_count" INTEGER NOT NULL DEFAULT 0,
    "trial_ends_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "platform_charge_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_providers" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "provider_type" VARCHAR(50) NOT NULL,
    "protocol" "SsoProtocol" NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "icon_url" VARCHAR(500),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "button_style" JSONB,
    "display_location" JSONB,
    "config" TEXT NOT NULL,
    "scope_mappings" JSONB,
    "attribute_map" JSONB,
    "status" "SsoProviderStatus" NOT NULL DEFAULT 'pending_setup',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_users" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "sso_provider_id" UUID NOT NULL,
    "idp_customer_id" VARCHAR(255) NOT NULL,
    "platform_customer_id" VARCHAR(100),
    "email" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "password_hash" TEXT,
    "profile_data" JSONB,
    "last_login_at" TIMESTAMP(3),
    "login_count" INTEGER NOT NULL DEFAULT 0,
    "status" "SsoUserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" BIGSERIAL NOT NULL,
    "store_id" UUID NOT NULL,
    "sso_provider_id" UUID,
    "sso_user_id" UUID,
    "event_type" "LoginEventType" NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "error_code" VARCHAR(50),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platforms_name_key" ON "platforms"("name");

-- CreateIndex
CREATE UNIQUE INDEX "applications_name_key" ON "applications"("name");

-- CreateIndex
CREATE UNIQUE INDEX "app_platforms_application_id_platform_id_key" ON "app_platforms"("application_id", "platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "stores_domain_key" ON "stores"("domain");

-- CreateIndex
CREATE INDEX "stores_domain_idx" ON "stores"("domain");

-- CreateIndex
CREATE INDEX "stores_status_idx" ON "stores"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stores_app_platform_id_platform_store_id_key" ON "stores"("app_platform_id", "platform_store_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_app_platform_id_name_key" ON "plans"("app_platform_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_store_id_key" ON "subscriptions"("store_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "sso_providers_store_id_is_enabled_idx" ON "sso_providers"("store_id", "is_enabled");

-- CreateIndex
CREATE INDEX "sso_providers_provider_type_idx" ON "sso_providers"("provider_type");

-- CreateIndex
CREATE INDEX "sso_users_email_idx" ON "sso_users"("email");

-- CreateIndex
CREATE INDEX "sso_users_platform_customer_id_idx" ON "sso_users"("platform_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sso_users_store_id_sso_provider_id_idp_customer_id_key" ON "sso_users"("store_id", "sso_provider_id", "idp_customer_id");

-- CreateIndex
CREATE INDEX "login_events_store_id_created_at_idx" ON "login_events"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "login_events_event_type_idx" ON "login_events"("event_type");

-- CreateIndex
CREATE INDEX "login_events_error_code_idx" ON "login_events"("error_code");

-- AddForeignKey
ALTER TABLE "app_platforms" ADD CONSTRAINT "app_platforms_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_platforms" ADD CONSTRAINT "app_platforms_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_app_platform_id_fkey" FOREIGN KEY ("app_platform_id") REFERENCES "app_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_app_platform_id_fkey" FOREIGN KEY ("app_platform_id") REFERENCES "app_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_users" ADD CONSTRAINT "sso_users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_users" ADD CONSTRAINT "sso_users_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "sso_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "sso_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_sso_user_id_fkey" FOREIGN KEY ("sso_user_id") REFERENCES "sso_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
