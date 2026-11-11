\set ON_ERROR_STOP on

do $$
begin
  if exists (
    select 1
      from public.business_memberships
     where id = '40000000-0000-4000-8000-000000000052'
  ) then
    raise exception 'deletion-first race membership was not deleted';
  end if;

  if exists (
    select 1
      from public.profiles
     where id = '20000000-0000-4000-8000-000000000052'
       and business_id is not null
  ) then
    raise exception 'deletion-first race restored a deleted business assignment';
  end if;

  if (select count(*) from public.activity_events
      where entity_id = '20000000-0000-4000-8000-000000000052'
        and event_type = 'user_profile.business_assigned') <> 0 then
    raise exception 'deletion-first stale assignment audit event was recorded';
  end if;

  if (select count(*) from public.activity_events
      where entity_id = '40000000-0000-4000-8000-000000000052'
        and event_type = 'business_membership.deleted') <> 1 then
    raise exception 'deletion-first deletion audit event count is incorrect';
  end if;

  if exists (
    select 1
      from public.business_memberships
     where id = '40000000-0000-4000-8000-000000000051'
  ) or exists (
    select 1
      from public.profiles
     where id = '20000000-0000-4000-8000-000000000051'
       and business_id is not null
  ) then
    raise exception 'assignment-first race state was not preserved';
  end if;

  if (select count(*) from public.activity_events
      where entity_id = '20000000-0000-4000-8000-000000000051'
        and event_type = 'user_profile.business_assigned') <> 1 then
    raise exception 'assignment-first assignment audit event count changed';
  end if;

  if (select count(*) from public.activity_events
      where entity_id = '40000000-0000-4000-8000-000000000051'
        and event_type = 'business_membership.deleted') <> 1 then
    raise exception 'assignment-first deletion audit event count changed';
  end if;
end;
$$;
