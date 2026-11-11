-- Business-scoped memberships and permissions for configurable receptionist access.
--
-- Existing profiles.role and profiles.business_id remain unchanged. Existing
-- admins and clients do not require rows in these tables; backend authorization
-- will provide compatibility fallbacks for them.

create table public.business_memberships (
  id uuid not null default gen_random_uuid() primary key,
  business_id uuid not null
    references public.businesses (id) on delete cascade,
  user_id uuid not null
    references public.profiles (id) on delete cascade,
  role text not null
    check (role in ('owner', 'receptionist')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_memberships_user_id_idx
  on public.business_memberships (user_id);

create index business_memberships_business_id_idx
  on public.business_memberships (business_id);

create table public.business_member_permissions (
  membership_id uuid not null
    references public.business_memberships (id) on delete cascade,
  permission text not null
    check (
      permission in (
        'view_chats',
        'view_customer_activity',
        'send_messages',
        'manage_customers'
      )
    ),
  allowed boolean not null default false,
  primary key (membership_id, permission)
);

-- The service-role backend is the only intended database access path. No
-- direct frontend access is granted; route-level authorization will enforce
-- business membership and permission checks in the backend.
alter table public.business_memberships enable row level security;
revoke all on table public.business_memberships from anon, authenticated;

alter table public.business_member_permissions enable row level security;
revoke all on table public.business_member_permissions from anon, authenticated;

