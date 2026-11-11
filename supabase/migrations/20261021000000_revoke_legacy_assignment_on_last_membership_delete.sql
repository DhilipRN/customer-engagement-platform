-- Revoke a matching legacy profile assignment when an explicit membership
-- deletion removes the user's last business membership.
--
-- Legacy-only clients are unaffected because this function is reached only
-- when an existing membership is explicitly deleted. The profile assignment
-- is cleared only when it still matches the deleted membership's business.

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
  membership_row public.business_memberships;
  membership_result jsonb;
  deleted_user_id uuid;
begin
  perform public.assert_business_membership_manager(p_business_id, p_actor_user_id);

  if (p_audit_before is not null and jsonb_typeof(p_audit_before) <> 'object')
     or (p_audit_after is not null and jsonb_typeof(p_audit_after) <> 'object') then
    raise exception using errcode = '22023', message = 'Membership audit payloads must be JSON objects or null.';
  end if;

  select * into membership_row
    from public.business_memberships
   where id = p_membership_id and business_id = p_business_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Membership not found.';
  end if;

  deleted_user_id := membership_row.user_id;

  -- Delegate the actual deletion and last-owner protection to the existing
  -- validated mutation function.
  select public.delete_business_membership(
    p_membership_id,
    p_business_id
  ) into membership_result;

  if not exists (
    select 1
      from public.business_memberships
     where user_id = deleted_user_id
  ) then
    update public.profiles
       set business_id = null
     where id = deleted_user_id
       and business_id = p_business_id;
  end if;

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

-- Preserve the audited service-role-only execution boundary.
revoke all on function public.delete_business_membership(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.delete_business_membership(uuid, uuid, uuid, jsonb, jsonb)
  to service_role;

revoke execute on function public.delete_business_membership(uuid, uuid)
  from service_role;
