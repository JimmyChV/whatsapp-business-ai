-- SaaS schema v7: admin profiles + module media/cloud metadata hardening
-- Safe to run multiple times.

ALTER TABLE IF EXISTS tenants
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE IF EXISTS tenants
    ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE IF EXISTS tenants
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS wa_modules
    ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE IF EXISTS wa_modules
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
