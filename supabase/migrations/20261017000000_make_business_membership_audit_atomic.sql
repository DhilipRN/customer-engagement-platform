-- Make membership mutations and their audit events one transaction.
--
-- The audited overloads call the existing mutation functions and then insert
-- the corresponding append-only audit event before the transaction commits.
-- Any failure in either operation rolls back the complete transaction.

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
  if p_actor_user_id is null then
    raise exception using errcode = '22023', message = 'An audit actor is required.';
  end if;

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
    visibility
  ) values (
    'business',
    p_business_id,
    p_actor_user_id,
    'user',
    'business_membership.created',
    'business_membership',
    (membership_result->>'id')::uuid,
    null,
    false,
    p_audit_before,
    p_audit_after,
    'audit_only'
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
  if p_actor_user_id is null then
    raise exception using errcode = '22023', message = 'An audit actor is required.';
  end if;

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

  -- Return the permission state from the same transaction. This avoids a
  -- post-commit read in the service that could otherwise report a failed
  -- update after the audited mutation had already committed.
  membership_result := membership_result || jsonb_build_object(
    'permissions', jsonb_build_object(
      'view_chats', coalesce((select allowed from public.business_member_permissions where membership_id = p_membership_id and permission = 'view_chats'), false),
      'view_customer_activity', coalesce((select allowed from public.business_member_permissions where membership_id = p_membership_id and permission = 'view_customer_activity'), false),
      'send_messages', coalesce((select allowed from public.business_member_permissions where membership_id = p_membership_id and permission = 'send_messages'), false),
      'manage_customers', coalesce((select allowed from public.business_member_permissions where membership_id = p_membership_id and permission = 'manage_customers'), false)
    )
  );

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
    visibility
  ) values (
    'business',
    p_business_id,
    p_actor_user_id,
    'user',
    'business_membership.updated',
    'business_membership',
    p_membership_id,
    null,
    false,
    p_audit_before,
    p_audit_after,
    'audit_only'
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
  if p_actor_user_id is null then
    raise exception using errcode = '22023', message = 'An audit actor is required.';
  end if;

  if (p_audit_before is not null and jsonb_typeof(p_audit_before) <> 'object')
     or (p_audit_after is not null and jsonb_typeof(p_audit_after) <> 'object') then
    raise exception using errcode = '22023', message = 'Membership audit payloads must be JSON objects or null.';
  end if;

  select public.delete_business_membership(
    p_membership_id,
    p_business_id
  ) into membership_result;

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
    visibility
  ) values (
    'business',
    p_business_id,
    p_actor_user_id,
    'user',
    'business_membership.deleted',
    'business_membership',
    p_membership_id,
    null,
    false,
    p_audit_before,
    p_audit_after,
    'audit_only'
  );

  return membership_result;
end;
$$;

-- Prevent backend callers from using the pre-audit mutation signatures.
revoke execute on function public.create_business_membership(uuid, uuid, text, jsonb) from service_role;
revoke execute on function public.update_business_membership(uuid, uuid, text, jsonb) from service_role;
revoke execute on function public.delete_business_membership(uuid, uuid) from service_role;

revoke all on function public.create_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.delete_business_membership(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.create_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) to service_role;
grant execute on function public.update_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) to service_role;
grant execute on function public.delete_business_membership(uuid, uuid, uuid, jsonb, jsonb) to service_role;
