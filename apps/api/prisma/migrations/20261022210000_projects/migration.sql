-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'REJECTED', 'SPAM');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('EN', 'UK');

-- CreateEnum
CREATE TYPE "IdempotencyScope" AS ENUM ('SAVE', 'RECALCULATE', 'LEAD');

-- CreateTable
CREATE TABLE "calculations" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "latest_version_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_versions" (
    "id" UUID NOT NULL,
    "calculation_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshot_schema_version" INTEGER NOT NULL,
    "pricing_version" TEXT NOT NULL,
    "total_usd_cents" INTEGER NOT NULL,
    "total_uah_kopecks" INTEGER,
    "incomplete" BOOLEAN NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "calculation_version_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "comment" TEXT,
    "consent_text" TEXT NOT NULL,
    "consent_at" TIMESTAMPTZ(3) NOT NULL,
    "locale" "Locale" NOT NULL,
    "expired_at_submission" BOOLEAN NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "revision" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_status_changes" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "from_status" "LeadStatus",
    "to_status" "LeadStatus" NOT NULL,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "author_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects_settings" (
    "id" INTEGER NOT NULL,
    "calculation_validity_days" INTEGER NOT NULL,
    "lead_retention_days" INTEGER NOT NULL,
    "lead_form_notice" JSONB NOT NULL,
    "last_retention_run_at" TIMESTAMPTZ(3),
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "projects_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" "IdempotencyScope" NOT NULL,
    "key" UUID NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result_id" UUID NOT NULL,
    "fake_lead_number" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "calculations_public_id_key" ON "calculations"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_versions_calculation_id_number_key" ON "calculation_versions"("calculation_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "leads_number_key" ON "leads"("number");

-- CreateIndex
CREATE INDEX "leads_calculation_version_id_idx" ON "leads"("calculation_version_id");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "lead_status_changes_lead_id_changed_at_idx" ON "lead_status_changes"("lead_id", "changed_at");

-- CreateIndex
CREATE INDEX "lead_notes_lead_id_created_at_idx" ON "lead_notes"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- AddForeignKey
ALTER TABLE "calculation_versions" ADD CONSTRAINT "calculation_versions_calculation_id_fkey" FOREIGN KEY ("calculation_id") REFERENCES "calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_calculation_version_id_fkey" FOREIGN KEY ("calculation_version_id") REFERENCES "calculation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_changes" ADD CONSTRAINT "lead_status_changes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_changes" ADD CONSTRAINT "lead_status_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects_settings" ADD CONSTRAINT "projects_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateFunction
CREATE FUNCTION "calculation_versions_reject_update"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'calculation versions are immutable';
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
CREATE TRIGGER "calculation_versions_immutable"
    BEFORE UPDATE ON "calculation_versions"
    FOR EACH ROW EXECUTE FUNCTION "calculation_versions_reject_update"();

-- AddCheckConstraint
ALTER TABLE "projects_settings" ADD CONSTRAINT "projects_settings_singleton_check" CHECK ("id" = 1);

-- InsertDefaultSettings
INSERT INTO "projects_settings" ("id", "calculation_validity_days", "lead_retention_days", "lead_form_notice", "revision", "updated_at")
VALUES (
    1,
    14,
    30,
    '{"en": "We keep your request for {days} days, then delete it automatically.", "uk": "Ми зберігаємо вашу заявку {days} днів, після чого вона автоматично видаляється."}',
    gen_random_uuid(),
    CURRENT_TIMESTAMP
);
