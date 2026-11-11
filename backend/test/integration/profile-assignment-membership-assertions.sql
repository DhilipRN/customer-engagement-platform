\set ON_ERROR_STOP on

-- Exercise the profile-assignment transfer against explicit memberships.
insert into public.profiles (id, role, business_id)
values
  ('20000000-0000-0000-0000-000000000061', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-0000-0000-000000000063', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-0000-0000-000000000064', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-0000-0000-000000000065', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-0000-0000-000000000066', 'client', null),
  ('20000000-0000-4000-8000-000000000099', 'admin', null);

insert into public.business_memberships (id, business_id, user_id, role)
values
  ('40000000-0000-0000-0000-000000000061', '10000000-0000-4000-8000-000000000001', '20000000-0000-0000-0000-000000000061', 'receptionist'),
  ('40000000-0000-0000-0000-000000000063', '10000000-0000-4000-8000-000000000001', '20000000-0000-0000-0000-000000000063', 'receptionist'),
  ('40000000-0000-0000-0000-000000000064', '10000000-0000-4000-8000-000000000001', '20000000-0000-0000-0000-000000000064', 'receptionist'),
  ('40000000-0000-0000-0000-000000000065', '10000000-0000-4000-8000-000000000001', '20000000-0000-0000-0000-000000000065', 'receptionist'),
  ('40000000-0000-0000-0000-000000000066', '10000000-0000-4000-8000-000000000001', '20000000-0000-0000-0000-000000000066', 'receptionist'),
  ('40000000-0000-0000-0000-000000000067', '10000000-0000-4000-8000-000000000002', '20000000-0000-0000-0000-000000000066', 'receptionist');

insert into public.business_member_permissions (membership_id, permission, allowed)
select membership.id, permission_name, permission_name = 'view_chats'
  from public.business_memberships membership
 cross join unnest(array[
    'view_chats', 'view_customer_activity', 'send_messages', 'manage_customers',
    'view_appointments', 'manage_appointments', 'view_purchases', 'manage_purchases',
    'view_campaigns', 'manage_campaigns', 'view_message_templates',
    'manage_message_templates', 'view_automations', 'manage_automations'
  ]) as permissions(permission_name)
 where membership.id in (
   '40000000-0000-0000-0000-000000000061',
   '40000000-0000-0000-0000-000000000063',
   '40000000-0000-0000-0000-000000000064',
   '40000000-0000-0000-0000-000000000065',
   '40000000-0000-0000-0000-000000000066',
   '40000000-0000-0000-0000-000000000067'
 );

do $$
declare
  assignment_result jsonb;
begin
  select public.assign_client_profile_business(
    '20000000-0000-0000-0000-000000000061',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000099'
  ) into assignment_result;

  if assignment_result->>'business_id' <> '10000000-0000-4000-8000-000000000002' then
    raise exception 'successful assignment returned the wrong business';
  end if;

  if exists (
    select 1 from public.business_memberships
     where user_id = '20000000-0000-0000-0000-000000000061'
       and business_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'previous business membership was not removed';
  end if;

  if not exists (
    select 1 from public.business_memberships
     where user_id = '20000000-0000-0000-0000-000000000061'
       and business_id = '10000000-0000-4000-8000-000000000002'
       and role = 'receptionist'
  ) then
    raise exception 'new receptionist membership was not created';
  end if;

  if (select count(*) from public.business_member_permissions permission
      join public.business_memberships membership on membership.id = permission.membership_id
     where membership.user_id = '20000000-0000-0000-0000-000000000061'
       and membership.business_id = '10000000-0000-4000-8000-000000000002') <> 14
  then
    raise exception 'receptionist permission rows are incomplete';
  end if;

  if not exists (
    select 1 from public.business_member_permissions permission
      join public.business_memberships membership on membership.id = permission.membership_id
     where membership.user_id = '20000000-0000-0000-0000-000000000061'
       and membership.business_id = '10000000-0000-4000-8000-000000000002'
       and permission.permission = 'view_chats'
       and permission.allowed
  ) or exists (
    select 1 from public.business_member_permissions permission
      join public.business_memberships membership on membership.id = permission.membership_id
     where membership.user_id = '20000000-0000-0000-0000-000000000061'
       and membership.business_id = '10000000-0000-4000-8000-000000000002'
       and permission.permission <> 'view_chats'
       and permission.allowed
  ) then
    raise exception 'receptionist permission defaults are incorrect';
  end if;

  if exists (
    select 1 from public.business_member_permissions permission
      join public.business_memberships membership on membership.id = permission.membership_id
     where membership.user_id = '20000000-0000-0000-0000-000000000061'
       and membership.business_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'previous business permission rows were not removed';
  end if;

  if not exists (
    select 1 from public.business_memberships
     where id = '40000000-0000-0000-0000-000000000065'
       and business_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '20000000-0000-0000-0000-000000000065'
  ) then
    raise exception 'unrelated membership was changed';
  end if;
end;
$$;

-- Reassigning to the same business is idempotent and does not duplicate rows.
select public.assign_client_profile_business(
  '20000000-0000-0000-0000-000000000063',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000099'
);

do $$
begin
  if (select count(*) from public.business_memberships
       where user_id = '20000000-0000-0000-0000-000000000063'
       and business_id = '10000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'same-business assignment duplicated a membership';
  end if;
end;
$$;

-- A NULL legacy assignment must still reconcile all existing memberships to
-- the single target business rather than leaving an additional business link.
select public.assign_client_profile_business(
  '20000000-0000-0000-0000-000000000066',
  '10000000-0000-4000-8000-000000000002',
  null,
  '20000000-0000-4000-8000-000000000099'
);

do $$
begin
  if not exists (
    select 1 from public.profiles
     where id = '20000000-0000-0000-0000-000000000066'
       and business_id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'NULL expected assignment did not update the profile';
  end if;

  if exists (
    select 1 from public.business_memberships
     where user_id = '20000000-0000-0000-0000-000000000066'
       and business_id <> '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'NULL expected assignment left an additional membership';
  end if;

  if (select count(*) from public.business_memberships
       where user_id = '20000000-0000-0000-0000-000000000066') <> 1 then
    raise exception 'NULL expected assignment duplicated or removed the target membership';
  end if;

  if exists (
    select 1 from public.business_member_permissions permission
      join public.business_memberships membership on membership.id = permission.membership_id
     where membership.user_id = '20000000-0000-0000-0000-000000000066'
       and membership.business_id <> '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'NULL expected assignment left permissions for an additional membership';
  end if;
end;
$$;

-- Invalid authorization and validation inputs must leave state unchanged.
do $$
declare
  failed boolean;
begin
  failed := false;
  begin
    perform public.assign_client_profile_business(
      '20000000-0000-0000-0000-000000000063',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-0000-0000-000000000063'
    );
  exception when others then failed := true;
  end;
  if not failed then raise exception 'non-admin actor was accepted'; end if;

  failed := false;
  begin
    perform public.assign_client_profile_business(
      '20000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000001',
      null,
      '20000000-0000-4000-8000-000000000099'
    );
  exception when others then failed := true;
  end;
  if not failed then raise exception 'non-client target was accepted'; end if;

  failed := false;
  begin
    perform public.assign_client_profile_business(
      '20000000-0000-0000-0000-000000000063',
      '10000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000099'
    );
  exception when others then failed := true;
  end;
  if not failed then raise exception 'invalid business was accepted'; end if;

  failed := false;
  begin
    perform public.assign_client_profile_business(
      '20000000-0000-0000-0000-000000000063',
      '10000000-0000-4000-8000-000000000002',
      null,
      '20000000-0000-4000-8000-000000000099'
    );
  exception when others then failed := true;
  end;
  if not failed then raise exception 'stale expected business was accepted'; end if;

  if not exists (
    select 1 from public.profiles
     where id = '20000000-0000-0000-0000-000000000063'
       and business_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'rejected assignment changed the profile';
  end if;
end;
$$;

-- A failure after old-membership deletion must roll back the complete transfer.
create or replace function public.integration_fail_profile_assignment_membership()
returns trigger
language plpgsql
as $$
begin
  if new.event_type = 'business_membership.created'
     and new.after->>'user_id' = '20000000-0000-0000-0000-000000000064' then
    raise exception using errcode = 'P9011', message = 'integration membership transfer failure';
  end if;
  return new;
end;
$$;

create trigger integration_fail_profile_assignment_membership
before insert on public.activity_events
for each row execute function public.integration_fail_profile_assignment_membership();

do $$
declare
  failed boolean := false;
begin
  begin
    perform public.assign_client_profile_business(
      '20000000-0000-0000-0000-000000000064',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000099'
    );
  exception when others then failed := true;
  end;

  if not failed then raise exception 'membership transfer failure did not fail'; end if;
  if not exists (
    select 1 from public.profiles
     where id = '20000000-0000-0000-0000-000000000064'
       and business_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'failed transfer changed the profile';
  end if;
  if not exists (
    select 1 from public.business_memberships
     where id = '40000000-0000-0000-0000-000000000064'
  ) or exists (
    select 1 from public.business_memberships
     where user_id = '20000000-0000-0000-0000-000000000064'
       and business_id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'failed transfer did not roll back membership state';
  end if;
end;
$$;

drop trigger integration_fail_profile_assignment_membership on public.activity_events;
drop function public.integration_fail_profile_assignment_membership();
