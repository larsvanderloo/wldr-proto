-- AUTH-0001 — users + refresh_tokens + tenants.email_domain
-- Zie ADR-0006 voor volledige context.
--
-- Backward-compatible per CLAUDE.md non-negotiable:
--  * tenants.email_domain is NULL-able + UNIQUE (bestaande rijen blijven valide).
--  * users + refresh_tokens zijn nieuwe tabellen — geen bestaande data.
--  * RLS-policies zijn analoog aan employees (current_setting('app.tenant_id')).
--  * Audit-trigger op users gebruikt current_setting('app.user_id') met
--    fallback op NEW.id voor self-registration / system-actions.

-- =====================================================================
-- 1. tenants.email_domain
-- =====================================================================

ALTER TABLE "tenants"
  ADD COLUMN "email_domain" TEXT;

CREATE UNIQUE INDEX "tenants_email_domain_key" ON "tenants"("email_domain");

-- =====================================================================
-- 2. user_role enum
-- =====================================================================

CREATE TYPE "user_role" AS ENUM ('hr_admin', 'manager', 'employee');

-- =====================================================================
-- 3. users
-- =====================================================================

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "employee_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");
CREATE INDEX "users_tenant_id_role_idx" ON "users"("tenant_id", "role");

ALTER TABLE "users"
  ADD CONSTRAINT "users_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users"
  ADD CONSTRAINT "users_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- 4. refresh_tokens
-- =====================================================================

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");
CREATE INDEX "refresh_tokens_tenant_id_expires_at_idx" ON "refresh_tokens"("tenant_id", "expires_at");

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- 5. RLS-policies (zie ADR-0002 voor patroon)
-- =====================================================================

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_users" ON "users"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_refresh_tokens" ON "refresh_tokens"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =====================================================================
-- 6. Audit-trigger op users
--
-- audit_events.user_id is NOT NULL. Bij self-registration / system-actions
-- bestaat er nog geen current_setting('app.user_id') — in dat geval gebruiken
-- we NEW.id (de user wordt op zichzelf geaudit). Voor admin-mutaties zet de
-- service-laag SET LOCAL app.user_id = '<actor>' in dezelfde transactie en
-- wordt die gebruikt.
--
-- Geen trigger op refresh_tokens (high-volume + ephemeral, zie ADR-0006 § 1).
-- =====================================================================

CREATE OR REPLACE FUNCTION audit_users_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id UUID;
  v_target_id UUID;
  v_tenant_id UUID;
  v_action TEXT;
  v_metadata JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_id := OLD.id;
    v_tenant_id := OLD.tenant_id;
    v_action := 'user.delete';
    v_metadata := jsonb_build_object('email', OLD.email, 'role', OLD.role);
  ELSIF TG_OP = 'UPDATE' THEN
    v_target_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
    v_action := 'user.update';
    v_metadata := jsonb_build_object(
      'changed_fields', (
        SELECT jsonb_agg(key)
        FROM jsonb_each(to_jsonb(NEW)) AS n(key, value)
        WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key)
          AND n.key <> 'updated_at'
      )
    );
  ELSE -- INSERT
    v_target_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
    v_action := 'user.create';
    v_metadata := jsonb_build_object('email', NEW.email, 'role', NEW.role);
  END IF;

  -- Actor-resolve: SET LOCAL app.user_id (admin-mutaties) of fallback op target.
  BEGIN
    v_actor_id := current_setting('app.user_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;
  IF v_actor_id IS NULL THEN
    v_actor_id := v_target_id;
  END IF;

  INSERT INTO audit_events (id, tenant_id, user_id, action, entity_type, entity_id, metadata, occurred_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_actor_id, v_action, 'user', v_target_id, v_metadata, now());

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER users_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "users"
  FOR EACH ROW
  EXECUTE FUNCTION audit_users_changes();
