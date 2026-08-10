-- Migration: Create password_policies
-- Purpose: Store tenant-scoped password policy metadata while Clerk/application logic enforces rules.
-- Note: Forward migration is executable. Rollback SQL is commented at the bottom.

BEGIN;

-- 1. Create prefixed ID sequence.
CREATE SEQUENCE IF NOT EXISTS public.password_policy_id_seq
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1
  CACHE 1
  NO CYCLE;

-- 2. Create password policy table.
CREATE TABLE IF NOT EXISTS public.password_policies (
  tenant_id text NOT NULL,
  policy_id text NOT NULL DEFAULT ('PWP' || lpad(nextval('public.password_policy_id_seq'::regclass)::text, 6, '0')),
  policy_name text NOT NULL,
  min_length integer NOT NULL DEFAULT 12,
  require_uppercase boolean NOT NULL DEFAULT true,
  require_lowercase boolean NOT NULL DEFAULT true,
  require_number boolean NOT NULL DEFAULT true,
  require_symbol boolean NOT NULL DEFAULT true,
  prevent_email_in_password boolean NOT NULL DEFAULT true,
  prevent_username_in_password boolean NOT NULL DEFAULT true,
  max_repeated_chars integer NOT NULL DEFAULT 2,
  password_history_count integer NOT NULL DEFAULT 5,
  expiry_days integer NULL,
  lockout_threshold integer NOT NULL DEFAULT 5,
  lockout_minutes integer NOT NULL DEFAULT 15,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_policies_pkey PRIMARY KEY (policy_id),
  CONSTRAINT password_policies_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT password_policies_tenant_policy_name_key
    UNIQUE (tenant_id, policy_name),
  CONSTRAINT password_policies_min_length_check
    CHECK (min_length >= 8),
  CONSTRAINT password_policies_max_repeated_chars_check
    CHECK (max_repeated_chars >= 1),
  CONSTRAINT password_policies_password_history_count_check
    CHECK (password_history_count >= 0),
  CONSTRAINT password_policies_expiry_days_check
    CHECK (expiry_days IS NULL OR expiry_days >= 1),
  CONSTRAINT password_policies_lockout_threshold_check
    CHECK (lockout_threshold >= 1),
  CONSTRAINT password_policies_lockout_minutes_check
    CHECK (lockout_minutes >= 1),
  CONSTRAINT password_policies_policy_id_format_check
    CHECK (policy_id ~ '^PWP[0-9]{6}$')
);

-- 3. Add indexes.
CREATE INDEX IF NOT EXISTS idx_password_policies_tenant_id
  ON public.password_policies (tenant_id);

CREATE INDEX IF NOT EXISTS idx_password_policies_tenant_active
  ON public.password_policies (tenant_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS ux_password_policies_one_active_per_tenant
  ON public.password_policies (tenant_id)
  WHERE is_active = true;

COMMIT;

-- Risk notes:
-- - This creates metadata only; it does not enforce Clerk password rules by itself.
-- - The partial unique index permits only one active password policy per tenant.
-- - This does not enable RLS on password_policies. Phase 1 RLS handles that separately.

-- Rollback SQL:
-- BEGIN;
--
-- DROP TABLE IF EXISTS public.password_policies;
--
-- DROP SEQUENCE IF EXISTS public.password_policy_id_seq;
--
-- COMMIT;
