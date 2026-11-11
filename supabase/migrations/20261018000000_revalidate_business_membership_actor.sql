-- Revalidate the actor inside the same transaction as every audited
-- membership mutation. The route-level check remains useful for early
-- responses, but this closes the authorization race between that check and
-- the service-role RPC call.

create or replace function public.assert_business_membership_manager(
  p_business_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  actor_membership_role text;
begin
  if p_business_id is null or p_actor_user_id is null then
    raise exception using errcode = 'P0003', message = 'A business owner or admin is required.';
  end if;


  -- Serialize membership mutations per business, even when the current
  -- owner row is demoted or deleted by a concurrent transaction.
  perform pg_advisory_xact_lock(
    hashtextextended(p_business_id::text, 0)
  );

  select role
    into actor_role
    from public.profiles
   where id = p_actor_user_id
   for update;

  if actor_role = 'admin' then
    return;
  end if;

  select role
    into actor_membership_role
    from public.business_memberships
   where business_id = p_business_id and user_id = p_actor_user_id
   for update;

  if actor_role <> 'client' or actor_membership_role is distinct from 'owner' then
    raise exception using errcode = 'P0003', message = 'A business owner or admin is required.';
  end if;
end;
$$;

create or replace function public.create_business_membership(
  p_business_id uuid,
  p_user_id uuid,
  p_role text,
  p_permissions jsonb,
  p_actor_user_id uuid,
  p_audit_before jsonb,
  p_audit_after jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_result jsonb;
begin
  perform public.assert_business_membership_manager(p_business_id, p_actor_user_id);

  if (p_audit_before is not null and jsonb_typeof(p_audit_before) <> 'object')
     or (p_audit_after is not null and jsonb_typeof(p_audit_after) <> 'object') then
    raise exception using errcode = '22023', message = 'Membership audit payloads must be JSON objects or null.';
  end if;

  select public.create_business_membership(
    p_business_id,
    p_user_id,
    p_role,
    p_permissions
  ) into membership_result;

  insert into public.activity_events (
    scope_type, business_id, actor_user_id, actor_type, event_type,
    entity_type, entity_id, customer_id, is_reconstructed, before, after,
    visibility
  ) values (
    'business', p_business_id, p_actor_user_id, 'user',
    'business_membership.created', 'business_membership',
    (membership_result->>'id')::uuid, null, false, p_audit_before,
    p_audit_after, 'audit_only'
  );

  return membership_result;
end;
$$;

create or replace function public.update_business_membership(
  p_membership_id uuid,
  p_business_id uuid,
  p_role text,
  p_permissions jsonb,
  p_actor_user_id uuid,
  p_audit_before jsonb,
  p_audit_after jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_result jsonb;
begin
  perform public.assert_business_membership_manager(p_business_id, p_actor_user_id);

  if (p_audit_before is not null and jsonb_typeof(p_audit_before) <> 'object')
     or (p_audit_after is not null and jsonb_typeof(p_audit_after) <> 'object') then
    raise exception using errcode = '22023', message = 'Membership audit payloads must be JSON objects or null.';
  end if;

  select public.update_business_membership(
    p_membership_id,
    p_business_id,
    p_role,
    p_permissions
  ) into membership_result;

  membership_result := membership_result || jsonb_build_object(
    'permissions', jsonb_build_object(
      'view_chats', coalesce((select allowed from public.business_member_permissions where membership_id = p_membership_id and permission = 'view_chats'), false),
      'view_customer_activity', coalesce((select allowed from public.business_member_permissions where membership_id = p_membership_id and permission = 'view_customer_activity'), false),
      'send_messages', coalesce((select allowed from public.business_member_permissions where membership_id = p_membership_id and permission = 'send_messages'), false),
      'manage_customers', coalesce((select allowed from public.business_member_permissions where membership_id = p_membership_id and permission = 'manage_customers'), false)
    )
  );

  insert into public.activity_events (
    scope_type, business_id, actor_user_id, actor_type, event_type,
    entity_type, entity_id, customer_id, is_reconstructed, before, after,
    visibility
  ) values (
    'business', p_business_id, p_actor_user_id, 'user',
    'business_membership.updated', 'business_membership', p_membership_id,
    null, false, p_audit_before, p_audit_after, 'audit_only'
  );

  return membership_result;
end;
$$;

create or replace function public.delete_business_membership(
  p_membership_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_audit_before jsonb,
  p_audit_after jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_result jsonb;
begin
  perform public.assert_business_membership_manager(p_business_id, p_actor_user_id);

  if (p_audit_before is not null and jsonb_typeof(p_audit_before) <> 'object')
     or (p_audit_after is not null and jsonb_typeof(p_audit_after) <> 'object') then
    raise exception using errcode = '22023', message = 'Membership audit payloads must be JSON objects or null.';
  end if;

  select public.delete_business_membership(
    p_membership_id,
    p_business_id
  ) into membership_result;

  insert into public.activity_events (
    scope_type, business_id, actor_user_id, actor_type, event_type,
    entity_type, entity_id, customer_id, is_reconstructed, before, after,
    visibility
  ) values (
    'business', p_business_id, p_actor_user_id, 'user',
    'business_membership.deleted', 'business_membership', p_membership_id,
    null, false, p_audit_before, p_audit_after, 'audit_only'
  );

  return membership_result;
end;
$$;

-- The helper is callable only by the definer-owned audited functions. Direct
-- application callers must use the audited service-role RPCs.
revoke all on function public.assert_business_membership_manager(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.delete_business_membership(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.create_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) to service_role;
grant execute on function public.update_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) to service_role;
grant execute on function public.delete_business_membership(uuid, uuid, uuid, jsonb, jsonb) to service_role;

-- Ensure legacy, unaudited mutation signatures remain inaccessible.
revoke execute on function public.create_business_membership(uuid, uuid, text, jsonb) from service_role;
revoke execute on function public.update_business_membership(uuid, uuid, text, jsonb) from service_role;
revoke execute on function public.delete_business_membership(uuid, uuid) from service_role;