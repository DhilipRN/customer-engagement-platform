-- Atomic business membership operations.
--
-- These functions are intentionally callable only by the backend service role.
-- Route authorization remains responsible for deciding which authenticated
-- actor may call them.

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

  if jsonb_typeof(permissions) <> 'object'
     or exists (
       select 1
         from jsonb_object_keys(permissions) as permission_entry(permission_name)
        where permission_entry.permission_name not in ('view_chats', 'view_customer_activity', 'send_messages', 'manage_customers')
     )
     or exists (
       select 1
         from jsonb_each(permissions) as permission_entry(permission_name, permission_value)
        where jsonb_typeof(permission_entry.permission_value) <> 'boolean'
     ) then
    raise exception using errcode = '22023', message = 'permissions must contain only supported boolean values.';
  end if;

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
    (membership_row.id, 'manage_customers', coalesce((permissions->>'manage_customers')::boolean, p_role = 'owner'));

  return to_jsonb(membership_row) || jsonb_build_object(
    'permissions', jsonb_build_object(
      'view_chats', coalesce((permissions->>'view_chats')::boolean, true),
      'view_customer_activity', coalesce((permissions->>'view_customer_activity')::boolean, p_role = 'owner'),
      'send_messages', coalesce((permissions->>'send_messages')::boolean, p_role = 'owner'),
      'manage_customers', coalesce((permissions->>'manage_customers')::boolean, p_role = 'owner')
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

  if p_permissions is not null and (
    jsonb_typeof(p_permissions) <> 'object'
    or exists (
      select 1
        from jsonb_object_keys(p_permissions) as permission_entry(permission_name)
       where permission_entry.permission_name not in ('view_chats', 'view_customer_activity', 'send_messages', 'manage_customers')
    )
    or exists (
      select 1
        from jsonb_each(p_permissions) as permission_entry(permission_name, permission_value)
       where jsonb_typeof(permission_entry.permission_value) <> 'boolean'
    )
  ) then
    raise exception using errcode = '22023', message = 'permissions must contain only supported boolean values.';
  end if;

  -- Serialize all owner transitions for this business. The lock is held until
  -- this function's transaction commits.
  perform 1
    from public.business_memberships
   where business_id = p_business_id and role = 'owner'
   for update;

  select * into membership_row
    from public.business_memberships
   where id = p_membership_id and business_id = p_business_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Membership not found.';
  end if;

  if membership_row.role = 'owner'
     and p_role = 'receptionist'
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
    values
      (membership_row.id, 'view_chats', coalesce((permissions->>'view_chats')::boolean, membership_row.role = 'owner' or membership_row.role = 'receptionist')),
      (membership_row.id, 'view_customer_activity', coalesce((permissions->>'view_customer_activity')::boolean, membership_row.role = 'owner')),
      (membership_row.id, 'send_messages', coalesce((permissions->>'send_messages')::boolean, membership_row.role = 'owner')),
      (membership_row.id, 'manage_customers', coalesce((permissions->>'manage_customers')::boolean, membership_row.role = 'owner'))
    on conflict (membership_id, permission) do update set allowed = excluded.allowed;
  end if;

  return to_jsonb(membership_row);
end;
$$;

create or replace function public.delete_business_membership(
  p_membership_id uuid,
  p_business_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_row public.business_memberships;
begin
  perform 1
    from public.business_memberships
   where business_id = p_business_id and role = 'owner'
   for update;

  select * into membership_row
    from public.business_memberships
   where id = p_membership_id and business_id = p_business_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Membership not found.';
  end if;

  if membership_row.role = 'owner'
     and (select count(*) from public.business_memberships where business_id = p_business_id and role = 'owner') <= 1 then
    raise exception using errcode = 'P0001', message = 'A business must retain an owner.';
  end if;

  delete from public.business_memberships
   where id = p_membership_id and business_id = p_business_id
  returning * into membership_row;

  return to_jsonb(membership_row);
end;
$$;

revoke all on function public.create_business_membership(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_business_membership(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_business_membership(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_business_membership(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.update_business_membership(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.delete_business_membership(uuid, uuid) to service_role;
