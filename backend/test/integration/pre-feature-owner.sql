-- Seed a legacy owner shape before the feature-permission migration. The
-- backfill migration must add only the newly introduced permissions.
insert into public.business_memberships (id, business_id, user_id, role)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000031',
  'owner'
);

insert into public.business_member_permissions (membership_id, permission, allowed)
values
  ('30000000-0000-4000-8000-000000000001', 'view_chats', true),
  ('30000000-0000-4000-8000-000000000001', 'view_customer_activity', true),
  ('30000000-0000-4000-8000-000000000001', 'send_messages', true),
  ('30000000-0000-4000-8000-000000000001', 'manage_customers', true);
