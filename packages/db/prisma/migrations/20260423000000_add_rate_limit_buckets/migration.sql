-- Migration: add_rate_limit_buckets
-- Doel: Postgres-backed token-bucket als vervanging voor in-memory rate-limiter.
-- Zie ADR-0007 §V2 voor rationale en algoritme.
--
-- Backward-compat: pure additive migratie, geen bestaande tabellen of kolommen geraakt.
-- Geen RLS: bewust (zie schema-comment). De tabel bevat geen tenant-data.
-- Geen audit-trigger: rate-limit-events zijn geen security-relevante audit-data.
-- Reversibility: DROP TABLE is de down-migration (geen data-afhankelijkheden).

CREATE TABLE rate_limit_buckets (
  bucket_key  TEXT PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  reset_at    TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_buckets_reset_at_idx ON rate_limit_buckets(reset_at);
