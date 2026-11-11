-- Keep membership updates on the actor-revalidated audited RPC path.

revoke all on function public.update_business_membership(
  uuid,
  uuid,
  text,
  jsonb
) from public, anon, authenticated, service_role;
