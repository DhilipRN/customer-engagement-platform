-- Backfill only the newly introduced feature permissions for existing owners.
-- Existing permission choices are never overwritten, and the statement is
-- idempotent so rerunning the migration creates no duplicate rows or events.

with feature_permissions(permission) as (
  values
    ('view_appointments'),
    ('manage_appointments'),
    ('view_purchases'),
    ('manage_purchases'),
    ('view_campaigns'),
    ('manage_campaigns'),
    ('view_message_templates'),
    ('manage_message_templates'),
    ('view_automations'),
    ('manage_automations')
), inserted_permissions as (
  insert into public.business_member_permissions (membership_id, permission, allowed)
  select membership.id, feature.permission, true
    from public.business_memberships membership
    cross join feature_permissions feature
   where membership.role = 'owner'
     and not exists (
       select 1
         from public.business_member_permissions existing
        where existing.membership_id = membership.id
          and existing.permission = feature.permission
     )
  on conflict (membership_id, permission) do nothing
  returning membership_id, permission
), changed_memberships as (
  select membership_id
    from inserted_permissions
   group by membership_id
)
insert into public.activity_events (
  scope_type,
  business_id,
  actor_user_id,
  actor_type,
  event_type,
  entity_type,
  entity_id,
  customer_id,
  is_reconstructed,
  before,
  after,
  metadata,
  visibility
)
select
  'business',
  membership.business_id,
  null,
  'system',
  'business_membership.permissions_backfilled',
  'business_membership',
  membership.id,
  null,
  false,
  null,
  jsonb_object_agg(inserted.permission, true),
  jsonb_build_object('operation', 'owner_feature_permission_backfill'),
  'audit_only'
from changed_memberships changed
join public.business_memberships membership
  on membership.id = changed.membership_id
join inserted_permissions inserted
  on inserted.membership_id = membership.id
group by membership.business_id, membership.id;
