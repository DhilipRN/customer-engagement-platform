\set ON_ERROR_STOP on

insert into public.integration_profile_assignment_race_signals (id, pid)
values ('assignment_first_deletion_ready', pg_backend_pid());
commit;

begin;

select public.delete_business_membership(
  '40000000-0000-4000-8000-000000000051',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  '{"role":"receptionist"}'::jsonb,
  null
);

commit;
