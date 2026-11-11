-- Add role selection to the profile assignment API without changing the
-- existing four-argument function signature.

create or replace function public.assign_client_profile_business(
  p_profile_id uuid,
  p_business_id uuid,
  p_expected_business_id uuid,
  p_actor_user_id uuid,
  p_membership_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_result jsonb;
  assigned_membership public.business_memberships;
  membership_permissions jsonb;
begin
  if p_membership_role not in ('owner', 'receptionist') then
    raise exception using
      errcode = '22023',
      message = 'membership role must be owner or receptionist.';
  end if;

  membership_permissions := case
    when p_membership_role = 'owner' then jsonb_build_object(
      'view_chats', true,
      'view_customer_activity', true,
      'send_messages', true,
      'manage_customers', true,
      'view_appointments', true,
      'manage_appointments', true,
      'view_purchases', true,
      'manage_purchases', true,
      'view_campaigns', true,
      'manage_campaigns', true,
      'view_message_templates', true,
      'manage_message_templates', true,
      'view_automations', true,
      'manage_automations', true
    )
    else jsonb_build_object(
      'view_chats', true,
      'view_customer_activity', false,
      'send_messages', false,
      'manage_customers', false,
      'view_appointments', false,
      'manage_appointments', false,
      'view_purchases', false,
      'manage_purchases', false,
      'view_campaigns', false,
      'manage_campaigns', false,
      'view_message_templates', false,
      'manage_message_templates', false,
      'view_automations', false,
      'manage_automations', false
    )
  end;

  -- Reuse the existing atomic assignment path for business transfer,
  -- profile update, authorization, and its audit event. It defaults newly
  -- created memberships to receptionist, then the audited role mutation
  -- below applies the requested role and defaults in the same transaction.
  select public.assign_client_profile_business(
    p_profile_id,
    p_business_id,
    p_expected_business_id,
    p_actor_user_id
  ) into assignment_result;

  select *
    into assigned_membership
    from public.business_memberships
   where business_id = p_business_id
     and user_id = p_profile_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Business membership was not created.';
  end if;

  select public.update_business_membership(
    assigned_membership.id,
    p_business_id,
    p_membership_role,
    membership_permissions,
    p_actor_user_id,
    jsonb_build_object(
      'user_id', assigned_membership.user_id,
      'role', assigned_membership.role
    ),
    jsonb_build_object(
      'user_id', p_profile_id,
      'role', p_membership_role,
      'permissions', membership_permissions
    )
  ) into assignment_result;

  return assignment_result;
end;
$$;

revoke all on function public.assign_client_profile_business(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.assign_client_profile_business(uuid, uuid, uuid, uuid, text)
  to service_role;
