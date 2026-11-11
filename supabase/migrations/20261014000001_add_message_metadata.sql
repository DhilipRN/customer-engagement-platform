-- Store backward-compatible metadata for source-specific message safeguards.
-- Existing messages remain unchanged because the column is nullable.

alter table public.messages
  add column metadata jsonb null;

-- Rollback (manual, after confirming no dependent application code remains):
-- alter table public.messages
--   drop column if exists metadata;
