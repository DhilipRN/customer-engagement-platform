\set ON_ERROR_STOP on

-- A profile with no membership remains a valid legacy-only client shape.
insert into public.profiles (id, role, business_id)
values ('20000000-0000-4000-8000-000000000041', 'client', '10000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1 from public.business_memberships
    where user_id = '20000000-0000-4000-8000-000000000041'
  ) or not exists (
    select 1 from public.profiles
    where id = '20000000-0000-4000-8000-000000000041'
      and business_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'legacy-only client setup is invalid';
  end if;
end;
$$;

-- Deleting the last membership clears the matching legacy assignment.
select id as deleted_membership_id
  from public.business_memberships
 where business_id = '10000000-0000-4000-8000-000000000001'
   and user_id = '20000000-0000-4000-8000-000000000021';
\gset last_membership_

create temporary table integration_last_deleted_membership (
  id uuid not null
);

insert into integration_last_deleted_membership (id)
values (:'last_membership_deleted_membership_id'::uuid);

select public.delete_business_membership(
  :'last_membership_deleted_membership_id'::uuid,
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  '{"role":"receptionist"}'::jsonb,
  null
);

do $$
begin
  if exists (
    select 1 from public.business_memberships
    where user_id = '20000000-0000-4000-8000-000000000021'
  ) then
    raise exception 'last membership was not deleted';
  end if;

  if exists (
    select 1 from public.profiles
    where id = '20000000-0000-4000-8000-000000000021'
      and business_id is not null
  ) then
    raise exception 'matching legacy assignment was not cleared';
  end if;

  if (select count(*) from public.activity_events
      where entity_id = (select id from integration_last_deleted_membership)
        and event_type = 'business_membership.deleted') <> 1 then
    raise exception 'last membership deletion audit event is missing or duplicated';
  end if;
end;
$$;

-- Keep a legacy assignment when another membership remains.
insert into public.business_memberships (id, business_id, user_id, role)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000022', 'receptionist'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000022', 'receptionist');

select public.delete_business_membership(
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  '{"role":"receptionist"}'::jsonb,
  null
);

do $$
begin
  if not exists (
    select 1 from public.business_memberships
    where id = '40000000-0000-4000-8000-000000000002'
      and business_id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'remaining membership was removed unexpectedly';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = '20000000-0000-4000-8000-000000000022'
      and business_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'legacy assignment was cleared while another membership remained';
  end if;
end;
$$;

-- A last membership deletion must not clear an unrelated legacy assignment.
insert into public.profiles (id, role, business_id)
values ('20000000-0000-4000-8000-000000000042', 'client', '10000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.business_memberships (id, business_id, user_id, role)
values (
  '40000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000042',
  'receptionist'
);

select public.delete_business_membership(
  '40000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  '{"role":"receptionist"}'::jsonb,
  null
);

do $$
begin
  if exists (
    select 1 from public.business_memberships
    where id = '40000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'unrelated-assignment membership was not deleted';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = '20000000-0000-4000-8000-000000000042'
      and business_id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'unrelated legacy assignment was cleared after last membership deletion';
  end if;

  if (select count(*) from public.activity_events
      where entity_id = '40000000-0000-4000-8000-000000000004'
        and event_type = 'business_membership.deleted'
        and business_id = '10000000-0000-4000-8000-000000000001'
        and visibility = 'audit_only') <> 1 then
    raise exception 'unrelated-assignment deletion audit event is missing or duplicated';
  end if;
end;
$$;

-- Do not clear an assignment for a different business.
insert into public.business_memberships (id, business_id, user_id, role)
values ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000031', 'receptionist');

select public.delete_business_membership(
  '40000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  '{"role":"receptionist"}'::jsonb,
  null
);

do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = '20000000-0000-4000-8000-000000000031'
      and business_id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'unrelated legacy assignment was cleared';
  end if;
end;
$$;
