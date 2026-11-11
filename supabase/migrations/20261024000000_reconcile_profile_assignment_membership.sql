create or replace function public.assign_client_profile_business(
  p_profile_id uuid,
  p_business_id uuid,
  p_expected_business_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  target_profile public.profiles;
  previous_profile_business_id uuid;
  previous_membership public.business_memberships;
  assigned_membership public.business_memberships;
  membership_result jsonb;
  receptionist_permissions jsonb := jsonb_build_object(
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
  );
begin
  if p_profile_id is null or p_business_id is null or p_actor_user_id is null then
    raise exception using
      errcode = 'P0003',
      message = 'Admin authorization context is required.';
  end if;

  -- Read the current assignment before taking the business advisory locks so
  -- the locks can always be acquired in a deterministic order.
  select business_id
    into previous_profile_business_id
    from public.profiles
   where id = p_profile_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'User profile not found.';
  end if;

  if previous_profile_business_id is null
     or previous_profile_business_id = p_business_id then
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));
  elsif previous_profile_business_id < p_business_id then
    perform pg_advisory_xact_lock(hashtextextended(previous_profile_business_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(previous_profile_business_id::text, 0));
  end if;

  select *
    into actor_profile
    from public.profiles
   where id = p_actor_user_id
   for update;

  if not found or actor_profile.role <> 'admin' then
    raise exception using
      errcode = 'P0003',
      message = 'Admin access required.';
  end if;

  select *
    into target_profile
    from public.profiles
   where id = p_profile_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'User profile not found.';
  end if;

  if target_profile.role <> 'client' then
    raise exception using
      errcode = '22023',
      message = 'Only client users can be assigned to a business.';
  end if;

  if target_profile.business_id is distinct from p_expected_business_id then
    raise exception using
      errcode = 'P0004',
      message = 'Profile business assignment changed.';
  end if;

  if not exists (
    select 1
      from public.businesses
     where id = p_business_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Business not found.';
  end if;

  -- This assignment operation is a single-business transfer. Remove every
  -- other membership for the target client, including stale memberships
  -- left behind when the legacy profile assignment was NULL.
  for previous_membership in
    select *
      from public.business_memberships
     where user_id = p_profile_id
       and business_id is distinct from p_business_id
     order by business_id, id
     for update
  loop
    perform public.delete_business_membership(
      previous_membership.id,
      previous_membership.business_id,
      p_actor_user_id,
      jsonb_build_object(
        'user_id', previous_membership.user_id,
        'role', previous_membership.role
      ),
      null
    );
  end loop;

  select *
    into assigned_membership
    from public.business_memberships
   where business_id = p_business_id
     and user_id = p_profile_id
   for update;

  if not found then
    select public.create_business_membership(
      p_business_id,
      p_profile_id,
      'receptionist',
      receptionist_permissions,
      p_actor_user_id,
      null,
      jsonb_build_object(
        'user_id', p_profile_id,
        'role', 'receptionist',
        'permissions', receptionist_permissions
      )
    ) into membership_result;
  elsif p_expected_business_id is distinct from p_business_id then
    select public.update_business_membership(
      assigned_membership.id,
      p_business_id,
      'receptionist',
      receptionist_permissions,
      p_actor_user_id,
      jsonb_build_object(
        'user_id', assigned_membership.user_id,
        'role', assigned_membership.role
      ),
      jsonb_build_object(
        'user_id', p_profile_id,
        'role', 'receptionist',
        'permissions', receptionist_permissions
      )
    ) into membership_result;
  else
    membership_result := to_jsonb(assigned_membership);
  end if;

  update public.profiles
     set business_id = p_business_id,
         updated_at = now()
   where id = p_profile_id
  returning * into target_profile;

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
    visibility,
    before,
    after
  ) values (
    'platform',
    null,
    p_actor_user_id,
    'user',
    'user_profile.business_assigned',
    'user_profile',
    target_profile.id,
    null,
    false,
    'audit_only',
    jsonb_build_object(
      'profile_id', target_profile.id,
      'business_id', p_expected_business_id
    ),
    jsonb_build_object(
      'profile_id', target_profile.id,
      'business_id', p_business_id
    )
  );

  return jsonb_build_object(
    'id', target_profile.id,
    'role', target_profile.role,
    'business_id', target_profile.business_id,
    'created_at', target_profile.created_at,
    'updated_at', target_profile.updated_at
  );
end;
$$;

revoke all on function public.assign_client_profile_business(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_client_profile_business(uuid, uuid, uuid, uuid)
  to service_role;
