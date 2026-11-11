\set ON_ERROR_STOP on

create table if not exists public.integration_profile_assignment_race_signals (
  id text primary key,
  pid bigint not null
);

alter table public.integration_profile_assignment_race_signals
  add column if not exists pid bigint;

truncate public.integration_profile_assignment_race_signals;

insert into public.profiles (id, role, business_id)
values
  ('20000000-0000-4000-8000-000000000051', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000052', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000099', 'admin', null)
on conflict (id) do update
set role = excluded.role,
    business_id = excluded.business_id;

insert into public.business_memberships (id, business_id, user_id, role)
values
  ('40000000-0000-4000-8000-000000000051', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000051', 'receptionist'),
  ('40000000-0000-4000-8000-000000000052', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000052', 'receptionist')
on conflict (id) do nothing;
