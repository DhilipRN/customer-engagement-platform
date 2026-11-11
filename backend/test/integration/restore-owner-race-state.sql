
\set ON_ERROR_STOP on

select public.update_business_membership(
  (select id
   from public.business_memberships
   where business_id = '10000000-0000-4000-8000-000000000001'
     and user_id = '20000000-0000-4000-8000-000000000011'),
  '10000000-0000-4000-8000-000000000001',
  'owner',
  null,
  '20000000-0000-4000-8000-000000000012',
  '{"role":"receptionist"}'::jsonb,
  '{"role":"owner"}'::jsonb
);
