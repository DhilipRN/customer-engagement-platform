-- Extend business-member permissions without changing existing memberships.
-- The audited RPC overloads remain service-role-only and continue to call the
-- atomic four-argument functions below.

alter table public.business_member_permissions
  drop constraint if exists business_member_permissions_permission_check;

alter table public.business_member_permissions
  add constraint business_member_permissions_permission_check
  check (
    permission in (
      'view_chats',
      'view_customer_activity',
      'send_messages',
      'manage_customers',
      'view_appointments',
      'manage_appointments',
      'view_purchases',
      'manage_purchases',
      'view_campaigns',
      'manage_campaigns',
      'view_message_templates',
      'manage_message_templates',
      'view_automations',
      'manage_automations'
    )
  );

create or replace function public.validate_business_member_permissions(
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_permissions) <> 'object'
     or exists (
       select 1
         from jsonb_object_keys(p_permissions) as permission_entry(permission_name)
        where permission_entry.permission_name not in (
          'view_chats', 'view_customer_activity', 'send_messages',
          'manage_customers', 'view_appointments', 'manage_appointments',
          'view_purchases', 'manage_purchases', 'view_campaigns',
          'manage_campaigns', 'view_message_templates',
          'manage_message_templates', 'view_automations', 'manage_automations'
        )
     )
     or exists (
       select 1
         from jsonb_each(p_permissions) as permission_entry(permission_name, permission_value)
        where jsonb_typeof(permission_entry.permission_value) <> 'boolean'
     ) then
    raise exception using errcode = '22023', message = 'permissions must contain only supported boolean values.';
  end if;
end;
$$;

create or replace function public.create_business_membership(
  p_business_id uuid,
  p_user_id uuid,
  p_role text,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_row public.business_memberships;
  permissions jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
  if p_role not in ('owner', 'receptionist') then
    raise exception using errcode = '22023', message = 'role must be owner or receptionist.';
  end if;

  perform public.validate_business_member_permissions(permissions);

  if not exists (
    select 1 from public.profiles where id = p_user_id and role = 'client'
  ) then
    raise exception using errcode = '22023', message = 'Only client users can be business members.';
  end if;

  insert into public.business_memberships (business_id, user_id, role)
  values (p_business_id, p_user_id, p_role)
  returning * into membership_row;

  insert into public.business_member_permissions (membership_id, permission, allowed)
  values
    (membership_row.id, 'view_chats', coalesce((permissions->>'view_chats')::boolean, true)),
    (membership_row.id, 'view_customer_activity', coalesce((permissions->>'view_customer_activity')::boolean, p_role = 'owner')),
    (membership_row.id, 'send_messages', coalesce((permissions->>'send_messages')::boolean, p_role = 'owner')),
    (membership_row.id, 'manage_customers', coalesce((permissions->>'manage_customers')::boolean, p_role = 'owner')),
    (membership_row.id, 'view_appointments', coalesce((permissions->>'view_appointments')::boolean, p_role = 'owner')),
    (membership_row.id, 'manage_appointments', coalesce((permissions->>'manage_appointments')::boolean, p_role = 'owner')),
    (membership_row.id, 'view_purchases', coalesce((permissions->>'view_purchases')::boolean, p_role = 'owner')),
    (membership_row.id, 'manage_purchases', coalesce((permissions->>'manage_purchases')::boolean, p_role = 'owner')),
    (membership_row.id, 'view_campaigns', coalesce((permissions->>'view_campaigns')::boolean, p_role = 'owner')),
    (membership_row.id, 'manage_campaigns', coalesce((permissions->>'manage_campaigns')::boolean, p_role = 'owner')),
    (membership_row.id, 'view_message_templates', coalesce((permissions->>'view_message_templates')::boolean, p_role = 'owner')),
    (membership_row.id, 'manage_message_templates', coalesce((permissions->>'manage_message_templates')::boolean, p_role = 'owner')),
    (membership_row.id, 'view_automations', coalesce((permissions->>'view_automations')::boolean, p_role = 'owner')),
    (membership_row.id, 'manage_automations', coalesce((permissions->>'manage_automations')::boolean, p_role = 'owner'));

  return to_jsonb(membership_row) || jsonb_build_object(
    'permissions', jsonb_build_object(
      'view_chats', coalesce((permissions->>'view_chats')::boolean, true),
      'view_customer_activity', coalesce((permissions->>'view_customer_activity')::boolean, p_role = 'owner'),
      'send_messages', coalesce((permissions->>'send_messages')::boolean, p_role = 'owner'),
      'manage_customers', coalesce((permissions->>'manage_customers')::boolean, p_role = 'owner'),
      'view_appointments', coalesce((permissions->>'view_appointments')::boolean, p_role = 'owner'),
      'manage_appointments', coalesce((permissions->>'manage_appointments')::boolean, p_role = 'owner'),
      'view_purchases', coalesce((permissions->>'view_purchases')::boolean, p_role = 'owner'),
      'manage_purchases', coalesce((permissions->>'manage_purchases')::boolean, p_role = 'owner'),
      'view_campaigns', coalesce((permissions->>'view_campaigns')::boolean, p_role = 'owner'),
      'manage_campaigns', coalesce((permissions->>'manage_campaigns')::boolean, p_role = 'owner'),
      'view_message_templates', coalesce((permissions->>'view_message_templates')::boolean, p_role = 'owner'),
      'manage_message_templates', coalesce((permissions->>'manage_message_templates')::boolean, p_role = 'owner'),
      'view_automations', coalesce((permissions->>'view_automations')::boolean, p_role = 'owner'),
      'manage_automations', coalesce((permissions->>'manage_automations')::boolean, p_role = 'owner')
    )
  );
end;
$$;

create or replace function public.update_business_membership(
  p_membership_id uuid,
  p_business_id uuid,
  p_role text default null,
  p_permissions jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_row public.business_memberships;
  permissions jsonb;
begin
  if p_role is not null and p_role not in ('owner', 'receptionist') then
    raise exception using errcode = '22023', message = 'role must be owner or receptionist.';
  end if;

  if p_permissions is not null then
    perform public.validate_business_member_permissions(p_permissions);
  end if;

  perform 1 from public.business_memberships
   where business_id = p_business_id and role = 'owner' for update;

  select * into membership_row from public.business_memberships
   where id = p_membership_id and business_id = p_business_id for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Membership not found.';
  end if;

  if membership_row.role = 'owner' and p_role = 'receptionist'
     and (select count(*) from public.business_memberships where business_id = p_business_id and role = 'owner') <= 1 then
    raise exception using errcode = 'P0001', message = 'A business must retain an owner.';
  end if;

  update public.business_memberships
     set role = coalesce(p_role, role), updated_at = now()
   where id = p_membership_id and business_id = p_business_id
   returning * into membership_row;

  if p_permissions is not null then
    permissions := p_permissions;
    insert into public.business_member_permissions (membership_id, permission, allowed)
    select membership_row.id, permission_name,
           coalesce((permissions->>permission_name)::boolean, membership_row.role = 'owner')
      from unnest(array[
        'view_chats', 'view_customer_activity', 'send_messages', 'manage_customers',
        'view_appointments', 'manage_appointments', 'view_purchases', 'manage_purchases',
        'view_campaigns', 'manage_campaigns', 'view_message_templates',
        'manage_message_templates', 'view_automations', 'manage_automations'
      ]) as permission_names(permission_name)
    on conflict (membership_id, permission) do update set allowed = excluded.allowed;
  end if;

  return to_jsonb(membership_row);
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
    p_membership_id, p_business_id, p_role, p_permissions
  ) into membership_result;

  membership_result := membership_result || jsonb_build_object(
    'permissions', coalesce((
      select jsonb_object_agg(permission, allowed)
        from public.business_member_permissions
       where membership_id = p_membership_id
    ), '{}'::jsonb)
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

-- The existing audited overloads call these functions, so their actor,
-- locking, audit, and service_role guarantees remain unchanged.
revoke all on function public.validate_business_member_permissions(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_business_membership(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_business_membership(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.update_business_membership(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.update_business_membership(uuid, uuid, text, jsonb, uuid, jsonb, jsonb) to service_role;
