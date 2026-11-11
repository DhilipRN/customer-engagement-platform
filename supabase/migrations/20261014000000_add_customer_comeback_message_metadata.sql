-- Identify Customer Comeback messages and prevent duplicate submissions.
-- Existing messages remain unchanged because both columns are nullable.

alter table public.messages
  add column source text null,
  add column idempotency_key text null;

create unique index messages_business_idempotency_key_unique_idx
  on public.messages (business_id, idempotency_key)
  where idempotency_key is not null;

-- Rollback (manual, after confirming no dependent application code remains):
-- drop index if exists public.messages_business_idempotency_key_unique_idx;
-- alter table public.messages
--   drop column if exists source,
--   drop column if exists idempotency_key;
