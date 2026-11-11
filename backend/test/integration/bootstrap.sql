create extension if not exists pgcrypto;

do $$
declare
  required_role text;
  role_attributes record;
begin
  foreach required_role in array array['service_role', 'authenticated', 'anon'] loop
    select rolsuper, rolcanlogin, rolinherit
      into role_attributes
      from pg_roles
     where rolname = required_role;

    if not found then
      raise exception 'Required PostgreSQL role % is missing.', required_role;
    end if;

    if role_attributes.rolsuper
       or role_attributes.rolcanlogin
       or role_attributes.rolinherit then
      raise exception 'Required PostgreSQL role % must be non-superuser, non-login, and non-inheriting.', required_role;
    end if;
  end loop;
end;
$$;

create table public.businesses (
  id uuid primary key
);

create table public.profiles (
  id uuid primary key,
  role text not null,
  business_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key
);

insert into public.businesses (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

insert into public.profiles (id, role, business_id) values
  ('20000000-0000-4000-8000-000000000011', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000012', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000021', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000022', 'client', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000031', 'client', '10000000-0000-4000-8000-000000000002');
