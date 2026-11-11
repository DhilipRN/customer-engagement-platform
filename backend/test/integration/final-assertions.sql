\set ON_ERROR_STOP on
do $$
begin
  if not exists (
    select 1 from public.business_memberships
    where business_id = '10000000-0000-4000-8000-000000000001'
      and user_id = '20000000-0000-4000-8000-000000000011'
      and role = 'owner'
  ) then
    raise exception 'concurrent owner operations removed or demoted the last owner';
  end if;
end;
$$;
