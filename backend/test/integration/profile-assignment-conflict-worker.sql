\set ON_ERROR_STOP on

insert into public.integration_profile_assignment_race_signals (id, pid)
values ('deletion_first_assignment_ready', pg_backend_pid());
commit;

begin;

select public.assign_client_profile_business(
  '20000000-0000-4000-8000-000000000052',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000099'
);

commit;
