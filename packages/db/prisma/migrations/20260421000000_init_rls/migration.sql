-- Enable pgcrypto voor PII-encryptie + gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Row-level security voor tenant-isolatie.
-- De app zet `SET LOCAL app.tenant_id = '<uuid>'` per request (TenantContext plugin).

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_employees ON employees
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_audit ON audit_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Tenants-tabel: alleen toegankelijk via bootstrap-role, niet via app-role.
-- Geen RLS nodig — wordt alleen gelezen door auth-flow vóór tenant-context bestaat.

-- Helper-functie voor PII decrypt — key uit settings, alleen services met juiste role.
-- Productie: key rotation via KMS, niet inline. Dit is de dev/staging-variant.
CREATE OR REPLACE FUNCTION pii_decrypt(cipher bytea)
RETURNS text AS $$
  SELECT CASE
    WHEN cipher IS NULL THEN NULL
    ELSE pgp_sym_decrypt(cipher, current_setting('app.pii_key', true))
  END;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION pii_encrypt(plaintext text)
RETURNS bytea AS $$
  SELECT CASE
    WHEN plaintext IS NULL THEN NULL
    ELSE pgp_sym_encrypt(plaintext, current_setting('app.pii_key', true))
  END;
$$ LANGUAGE sql SECURITY DEFINER;
