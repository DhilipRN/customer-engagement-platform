\set ON_ERROR_STOP on

create or replace function public.integration_fail_profile_assignment_audit()
returns trigger
language plpgsql
as $$
begin
  if new.event_type = 'user_profile.business_assigned' then
    raise exception using errcode = 'P9010', message = 'integration profile assignment audit failure';
  end if;
  return new;
end;
$$;

create trigger integration_fail_profile_assignment_audit
before insert on public.activity_events
for each row execute function public.integration_fail_profile_assignment_audit();

do $$
declare
  failed boolean := false;
begin
  begin
    perform public.assign_client_profile_business(
      '20000000-0000-4000-8000-000000000051',
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000099'
    );
  exception when others then
    failed := true;
  end;

  if not failed then
    raise exception 'profile assignment audit failure did not fail';
  end if;

  if not exists (
    select 1
      from public.profiles
     where id = '20000000-0000-4000-8000-000000000051'
       and business_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'profile assignment survived audit failure';
  end if;

  if exists (
    select 1
      from public.activity_events
     where entity_id = '20000000-0000-4000-8000-000000000051'
       and event_type = 'user_profile.business_assigned'
  ) then
    raise exception 'profile assignment audit event survived rollback';
  end if;
end;
$$;

drop trigger integration_fail_profile_assignment_audit on public.activity_events;
drop function public.integration_fail_profile_assignment_audit();
