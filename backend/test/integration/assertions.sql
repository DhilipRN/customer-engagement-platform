\set ON_ERROR_STOP on

-- Establish the initial owner for the integration tests.
-- Direct insertion is test setup only; production mutations remain protected.
insert into public.business_memberships (
  business_id,
  user_id,
  role
)
values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  'owner'
);

insert into public.business_member_permissions (
  membership_id,
  permission,
  allowed
)
select
  membership.id,
  permissions.permission,
  true
from public.business_memberships membership
cross join (
  values
    ('view_chats'),
    ('view_customer_activity'),
    ('send_messages'),
    ('manage_customers'),
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
) as permissions(permission)
where membership.business_id = '10000000-0000-4000-8000-000000000001'
  and membership.user_id = '20000000-0000-4000-8000-000000000011';
do $$
begin
  if (
    select count(*)
      from public.business_member_permissions permission
      join public.business_memberships membership
        on membership.id = permission.membership_id
     where membership.user_id = '20000000-0000-4000-8000-000000000011'
       and permission.permission in (
         'view_appointments', 'manage_appointments',
         'view_purchases', 'manage_purchases',
         'view_campaigns', 'manage_campaigns',
         'view_message_templates', 'manage_message_templates',
         'view_automations', 'manage_automations'
       )
       and permission.allowed
  ) <> 10 then
    raise exception 'owner feature permissions were not persisted';
  end if;
end;
$$;

do $$
begin
  if (
    select count(*)
      from public.business_member_permissions permission
     where permission.membership_id = '30000000-0000-4000-8000-000000000001'
       and permission.permission in (
         'view_appointments', 'manage_appointments',
         'view_purchases', 'manage_purchases',
         'view_campaigns', 'manage_campaigns',
         'view_message_templates', 'manage_message_templates',
         'view_automations', 'manage_automations'
       )
       and permission.allowed
  ) <> 10 then
    raise exception 'legacy owner permissions were not backfilled';
  end if;

  if (
    select count(*)
      from public.activity_events
     where entity_id = '30000000-0000-4000-8000-000000000001'
       and event_type = 'business_membership.permissions_backfilled'
  ) <> 1 then
    raise exception 'owner permission backfill audit event is missing or duplicated';
  end if;
end;
$$;

-- A second owner is used by the independent authorization-race workers.
select public.create_business_membership(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000012',
  'owner', '{}',
  '20000000-0000-4000-8000-000000000011', null,
  '{"user_id":"20000000-0000-4000-8000-000000000012","role":"owner"}'::jsonb
);

-- Permission-row failure must roll back the membership row.
create or replace function public.integration_fail_permission_insert()
returns trigger language plpgsql as $$
begin
  if new.permission = 'send_messages' then
    raise exception using errcode = 'P9001', message = 'integration permission failure';
  end if;
  return new;
end;
$$;
create trigger integration_fail_permission_insert
before insert on public.business_member_permissions
for each row execute function public.integration_fail_permission_insert();

do $$
declare failed boolean := false;
begin
  begin
    perform public.create_business_membership(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000021',
      'receptionist',
      '{"view_chats": true, "send_messages": true}'::jsonb,
      '20000000-0000-4000-8000-000000000011',
      null,
      '{"user_id":"20000000-0000-4000-8000-000000000021","role":"receptionist"}'::jsonb
    );
  exception when others then failed := true;
  end;
  if not failed then raise exception 'permission-row failure did not fail'; end if;
  if exists (select 1 from public.business_memberships where user_id = '20000000-0000-4000-8000-000000000021') then
    raise exception 'membership survived permission-row failure';
  end if;
end;
$$;
drop trigger integration_fail_permission_insert on public.business_member_permissions;
drop function public.integration_fail_permission_insert();

-- Audit failure must roll back create.
create or replace function public.integration_fail_created_audit()
returns trigger language plpgsql as $$
begin
  if new.event_type = 'business_membership.created' then
    raise exception using errcode = 'P9002', message = 'integration audit failure';
  end if;
  return new;
end;
$$;
create trigger integration_fail_created_audit
before insert on public.activity_events
for each row execute function public.integration_fail_created_audit();

do $$
declare failed boolean := false;
begin
  begin
    perform public.create_business_membership(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000022',
      'receptionist', '{}',
      '20000000-0000-4000-8000-000000000011', null,
      '{"user_id":"20000000-0000-4000-8000-000000000022","role":"receptionist"}'::jsonb
    );
  exception when others then failed := true;
  end;
  if not failed then raise exception 'create audit failure did not fail'; end if;
  if exists (select 1 from public.business_memberships where user_id = '20000000-0000-4000-8000-000000000022') then
    raise exception 'create membership survived audit failure';
  end if;
end;
$$;
drop trigger integration_fail_created_audit on public.activity_events;
drop function public.integration_fail_created_audit();

-- Establish a membership for update/delete rollback tests.
select public.create_business_membership(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000021',
  'receptionist', '{}',
  '20000000-0000-4000-8000-000000000011', null,
  '{"user_id":"20000000-0000-4000-8000-000000000021","role":"receptionist"}'::jsonb
);

do $$
begin
  if exists (
    select 1
      from public.business_member_permissions permission
      join public.business_memberships membership
        on membership.id = permission.membership_id
     where membership.user_id = '20000000-0000-4000-8000-000000000021'
       and permission.permission in (
         'view_appointments', 'manage_appointments',
         'view_purchases', 'manage_purchases',
         'view_campaigns', 'manage_campaigns',
         'view_message_templates', 'manage_message_templates',
         'view_automations', 'manage_automations'
       )
       and permission.allowed
  ) then
    raise exception 'new receptionist received an unintended feature permission';
  end if;
end;
$$;

create or replace function public.integration_fail_updated_audit()
returns trigger language plpgsql as $$
begin
  if new.event_type = 'business_membership.updated' then
    raise exception using errcode = 'P9003', message = 'integration update audit failure';
  end if;
  return new;
end;
$$;
create trigger integration_fail_updated_audit
before insert on public.activity_events
for each row execute function public.integration_fail_updated_audit();

do $$
declare failed boolean := false;
begin
  begin
    perform public.update_business_membership(
      (select id from public.business_memberships where user_id = '20000000-0000-4000-8000-000000000021'),
      '10000000-0000-4000-8000-000000000001', 'owner', null,
      '20000000-0000-4000-8000-000000000011',
      '{"role":"receptionist"}', '{"role":"owner"}'
    );
  exception when others then failed := true;
  end;
  if not failed then raise exception 'update audit failure did not fail'; end if;
  if not exists (select 1 from public.business_memberships where user_id = '20000000-0000-4000-8000-000000000021' and role = 'receptionist') then
    raise exception 'update survived audit failure';
  end if;
end;
$$;
drop trigger integration_fail_updated_audit on public.activity_events;
drop function public.integration_fail_updated_audit();

create or replace function public.integration_fail_deleted_audit()
returns trigger language plpgsql as $$
begin
  if new.event_type = 'business_membership.deleted' then
    raise exception using errcode = 'P9004', message = 'integration delete audit failure';
  end if;
  return new;
end;
$$;
create trigger integration_fail_deleted_audit
before insert on public.activity_events
for each row execute function public.integration_fail_deleted_audit();

do $$
declare failed boolean := false;
begin
  begin
    perform public.delete_business_membership(
      (select id from public.business_memberships where user_id = '20000000-0000-4000-8000-000000000021'),
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000011',
      '{"role":"receptionist"}', null
    );
  exception when others then failed := true;
  end;
  if not failed then raise exception 'delete audit failure did not fail'; end if;
  if not exists (select 1 from public.business_memberships where user_id = '20000000-0000-4000-8000-000000000021') then
    raise exception 'delete survived audit failure';
  end if;
end;
$$;
drop trigger integration_fail_deleted_audit on public.activity_events;
drop function public.integration_fail_deleted_audit();

-- Privilege and SECURITY DEFINER checks cover every audited and superseded
-- create, update, and delete signature.
do $$
declare
  item record;
  function_owner text;
  security_definer boolean;
  public_execute_found boolean;
  search_path_configured boolean;
begin
  for item in
    select *
    from (values
      ('public.create_business_membership(uuid,uuid,text,jsonb)', false),
      ('public.create_business_membership(uuid,uuid,text,jsonb,uuid,jsonb,jsonb)', true),
      ('public.update_business_membership(uuid,uuid,text,jsonb)', false),
      ('public.update_business_membership(uuid,uuid,text,jsonb,uuid,jsonb,jsonb)', true),
      ('public.delete_business_membership(uuid,uuid)', false),
      ('public.delete_business_membership(uuid,uuid,uuid,jsonb,jsonb)', true)
    ) as expected(signature, service_allowed)
  loop
    if to_regprocedure(item.signature) is null then
      raise exception 'Missing expected function: %', item.signature;
    end if;

    if has_function_privilege('service_role', item.signature, 'execute')
       is distinct from item.service_allowed then
      raise exception 'Unexpected service_role privilege for %', item.signature;
    end if;

    if has_function_privilege('anon', item.signature, 'execute') then
      raise exception 'anon can execute %', item.signature;
    end if;

    if has_function_privilege('authenticated', item.signature, 'execute') then
      raise exception 'authenticated can execute %', item.signature;
    end if;

    select
      role_name,
      is_security_definer,
      has_public_execute,
      has_search_path
    into
      function_owner,
      security_definer,
      public_execute_found,
      search_path_configured
    from (
      select
        owner_role.rolname as role_name,
        function_row.prosecdef as is_security_definer,
        exists (
          select 1
          from aclexplode(
            coalesce(
              function_row.proacl,
              acldefault('f', function_row.proowner)
            )
          ) acl
          where acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
        ) as has_public_execute,
        'search_path=public' = any(coalesce(function_row.proconfig, '{}'::text[])) as has_search_path
      from pg_proc function_row
      join pg_roles owner_role on owner_role.oid = function_row.proowner
      where function_row.oid = to_regprocedure(item.signature)
    ) function_state;

    if not security_definer or not search_path_configured then
      raise exception 'Function % is not safely configured as SECURITY DEFINER with search_path=public', item.signature;
    end if;

    if item.signature = 'public.update_business_membership(uuid,uuid,text,jsonb)'
       and function_owner = 'service_role' then
      raise exception 'service_role owns the unaudited update helper';
    end if;

    if public_execute_found then
      raise exception 'PUBLIC can execute %', item.signature;
    end if;
  end loop;
end;
$$;

-- Confirm that the audited update remains callable after the legacy overload is
-- revoked, and that it still writes exactly one audit event.
do $$
declare
  membership_id uuid;
  update_result jsonb;
begin
  select id
    into membership_id
    from public.business_memberships
   where business_id = '10000000-0000-4000-8000-000000000001'
     and user_id = '20000000-0000-4000-8000-000000000021';

  if membership_id is null then
    raise exception 'audited update fixture membership is missing';
  end if;

  select public.update_business_membership(
    membership_id,
    '10000000-0000-4000-8000-000000000001',
    'receptionist',
    '{"view_appointments": true}'::jsonb,
    '20000000-0000-4000-8000-000000000011',
    '{"role":"receptionist"}'::jsonb,
    '{"role":"receptionist","permissions":{"view_appointments":true}}'::jsonb
  ) into update_result;

  if update_result is null
     or update_result->'permissions'->>'view_appointments' <> 'true' then
    raise exception 'audited update did not return the updated permission state';
  end if;

  if (select count(*)
        from public.activity_events
       where entity_id = membership_id
         and event_type = 'business_membership.updated') <> 1 then
    raise exception 'audited update audit event count is incorrect';
  end if;
end;
$$;
