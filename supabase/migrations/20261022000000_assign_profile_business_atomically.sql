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
begin
  if p_profile_id is null or p_business_id is null or p_actor_user_id is null then
    raise exception using
      errcode = 'P0003',
      message = 'Admin authorization context is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));

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
