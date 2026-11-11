\set ON_ERROR_STOP on
select public.create_business_membership(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  'owner', '{}',
  '20000000-0000-4000-8000-000000000012', null,
  '{"user_id":"20000000-0000-4000-8000-000000000011","role":"owner"}'::jsonb
);
select public.delete_business_membership(
  (select id from public.business_memberships where user_id = '20000000-0000-4000-8000-000000000012'),
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  '{"role":"owner"}', null
);
