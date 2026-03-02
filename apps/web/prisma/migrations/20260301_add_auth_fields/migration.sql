-- Migration: Add auth fields to User + AuthEvent
-- Applies schema changes needed for the real auth system.
-- Run with: pnpm db:migrate

-- ─── User: auth fields ────────────────────────────────────────────────────────

-- Password hash (bcrypt, cost 12)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

-- Email verification
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verification_token" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_verification_token_key" ON "User"("verification_token");
CREATE INDEX IF NOT EXISTS "User_verification_token_idx" ON "User"("verification_token");

-- Refresh token (opaque random string — stored raw, 384-bit entropy)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "refresh_token" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_refresh_token_key" ON "User"("refresh_token");
CREATE INDEX IF NOT EXISTS "User_refresh_token_idx" ON "User"("refresh_token");

-- Password reset token
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_reset_token"      TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_reset_expires_at" TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS "User_password_reset_token_key" ON "User"("password_reset_token");

-- ─── AuthEvent: additional fields ────────────────────────────────────────────

ALTER TABLE "AuthEvent" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "AuthEvent" ADD COLUMN IF NOT EXISTS "success"    BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── Note on User.id type ────────────────────────────────────────────────────
-- The schema now uses @default(uuid()) for User.id.
-- For NEW installations: Prisma will generate UUID v4 IDs automatically.
-- For EXISTING installations with CUID-based IDs:
--   Existing rows will keep their CUID IDs (still valid strings).
--   New rows will get UUID v4 IDs.
--   The auth middleware UUID validation will reject CUID-based subjects.
--   If you have existing users, run the following to migrate their IDs:
--     (Consult your DBA for a zero-downtime migration strategy.)
