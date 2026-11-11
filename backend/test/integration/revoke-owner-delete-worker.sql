\set ON_ERROR_STOP on
begin;
select pg_advisory_xact_lock(180181);
select public.delete_business_membership(
  (select id from public.business_memberships where user_id = '20000000-0000-4000-8000-000000000011'),
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000012',
  '{"role":"owner"}', null
);
commit;
