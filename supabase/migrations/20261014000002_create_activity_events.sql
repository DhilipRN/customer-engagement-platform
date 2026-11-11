-- Append-only activity and audit events.
--
-- Existing domain rows remain the source of truth for reconstructed activity.
-- New application code should write is_reconstructed = false events only after
-- the corresponding operation succeeds.

create table public.activity_events (
  id uuid not null default gen_random_uuid() primary key,
  scope_type text not null
    check (scope_type in ('business', 'platform')),
  -- Deliberately not a foreign key: this identifier must remain available in
  -- historical events after the existing business deletion flow removes the
  -- related business row.
  business_id uuid null,
  actor_user_id uuid null
    references public.profiles (id) on delete set null,
  actor_type text not null
    check (actor_type in ('user', 'system')),
  event_type text not null,
  entity_type text not null,
  entity_id uuid null,
  customer_id uuid null
    references public.customers (id) on delete set null,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  is_reconstructed boolean not null default false,
  before jsonb null,
  after jsonb null,
  metadata jsonb null,
  visibility text not null
    check (visibility in ('customer_timeline', 'audit_only')),
  check (
    (scope_type = 'business' and business_id is not null) or
    (scope_type = 'platform' and business_id is null)
  )
);

create index activity_events_business_occurred_at_idx
  on public.activity_events (business_id, occurred_at);

create index activity_events_customer_occurred_at_idx
  on public.activity_events (customer_id, occurred_at);

create index activity_events_entity_occurred_at_idx
  on public.activity_events (entity_type, entity_id, occurred_at);

create index activity_events_event_occurred_at_idx
  on public.activity_events (event_type, occurred_at);

-- The service-role backend is the only intended database access path.
-- No policies are created, so normal application roles cannot read or write
-- audit data directly. Route-level authorization will be required when the
-- backend audit and timeline endpoints are implemented.
alter table public.activity_events enable row level security;
revoke all on table public.activity_events from anon, authenticated;

-- Enforce append-only behavior at the database level. The service-role client
-- is used by the backend, but it must not update or delete audit rows through
-- normal application paths. Privileged database maintenance may temporarily
-- disable this trigger as the table owner; that exception is intentional and
-- must not be exposed through an application endpoint.
create or replace function public.prevent_activity_events_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'activity_events is append-only';
end;
$$;

revoke all on function public.prevent_activity_events_mutation() from public;

create trigger activity_events_append_only_guard
before update or delete on public.activity_events
for each row
execute function public.prevent_activity_events_mutation();

-- Rollback (manual, after confirming no dependent application code remains):
-- drop trigger if exists activity_events_append_only_guard
--   on public.activity_events;
-- drop function if exists public.prevent_activity_events_mutation();
-- drop table if exists public.activity_events;
