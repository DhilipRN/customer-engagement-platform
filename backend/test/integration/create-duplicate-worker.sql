\set ON_ERROR_STOP on
begin;
select public.create_business_membership(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000022',
  'receptionist', '{}',
  '20000000-0000-4000-8000-000000000011', null,
  '{"user_id":"20000000-0000-4000-8000-000000000022","role":"receptionist"}'::jsonb
);
select pg_sleep(1);
commit;
