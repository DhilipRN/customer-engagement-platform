\set ON_ERROR_STOP on

insert into public.integration_profile_assignment_race_signals (id, pid)
values ('assignment_first_assignment_started', pg_backend_pid());
commit;

begin;

select pg_advisory_xact_lock(hashtextextended('10000000-0000-4000-8000-000000000001'::text, 0));

select public.assign_client_profile_business(
  '20000000-0000-4000-8000-000000000051',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000099'
);

insert into public.integration_profile_assignment_race_signals (id, pid)
values ('assignment_first_assignment_ready', pg_backend_pid());

select pg_advisory_xact_lock(
  hashtextextended('connectly.profile_assignment_first.gate'::text, 0)
);

commit;
