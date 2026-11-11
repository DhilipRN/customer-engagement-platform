\set ON_ERROR_STOP on
begin;
select pg_sleep(1);
select pg_advisory_xact_lock(180181);
select public.create_business_membership(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000022',
  'receptionist', '{}',
  '20000000-0000-4000-8000-000000000011', null,
  '{"user_id":"20000000-0000-4000-8000-000000000022","role":"receptionist"}'::jsonb
);
commit;
