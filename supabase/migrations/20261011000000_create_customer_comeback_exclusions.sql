-- Persistent Customer Comeback exclusions.
--
-- Business and customer deletion should remove dependent exclusions rather
-- than block the existing deletion flows. The creator is nullable so removing
-- a profile preserves the exclusion while clearing its audit reference.

create table public.customer_comeback_exclusions (
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  created_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, customer_id)
);

-- The primary key supports the common business_id + customer_id lookup.
-- This index supports customer-centered cleanup or ownership checks.
create index customer_comeback_exclusions_customer_id_idx
  on public.customer_comeback_exclusions (customer_id);
