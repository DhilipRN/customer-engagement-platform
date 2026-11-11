\set ON_ERROR_STOP on

insert into public.integration_profile_assignment_race_signals (id, pid)
values ('deletion_first_deletion_started', pg_backend_pid());
commit;

begin;

select pg_advisory_xact_lock(hashtextextended('10000000-0000-4000-8000-000000000001'::text, 0));

select public.delete_business_membership(
  '40000000-0000-4000-8000-000000000052',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000011',
  '{"role":"receptionist"}'::jsonb,
  null
);

select pg_advisory_xact_lock(
  hashtextextended('connectly.profile_deletion_first.gate'::text, 0)
);

commit;
