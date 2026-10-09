import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/env.js';

let supabase;

function getSupabaseClient() {
  if (!supabase) {
    const { url, serviceRoleKey } = getSupabaseConfig();

    supabase = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabase;
}

export async function requireAuth(request, response, next) {
  const authorization = request.headers.authorization;

  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ')
  ) {
    return response.status(401).json({
      error: 'Authentication required.',
    });
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    return response.status(401).json({
      error: 'Authentication required.',
    });
  }

  try {
    const { data, error } =
      await getSupabaseClient().auth.getUser(token);

    if (error || !data?.user) {
      return response.status(401).json({
        error: 'Invalid or expired authentication token.',
      });
    }

  const { data: profile, error: profileError } =
  await getSupabaseClient()
    .from('profiles')
    .select('id, role, business_id')
    .eq('id', data.user.id)
    .single();

if (profileError || !profile) {
  return response.status(403).json({
    error: 'User profile not found.',
  });
}

request.user = data.user;
request.profile = profile;

return next();

  } catch (error) {
    console.error('Authentication check failed:', error);

    return response.status(401).json({
      error: 'Unable to authenticate request.',
    });
  }
}

export function requireAdmin(request, response, next) {
  if (!request.profile || request.profile.role !== 'admin') {
    return response.status(403).json({
      error: 'Admin access required.',
    });
  }

  return next();
}

export function requireBusinessAccess(request, response, next) {
  if (!request.profile) {
    return next();
  }

  if (request.profile.role === 'admin') {
    return next();
  }

  if (request.profile.role === 'client' && !request.profile.business_id) {
    return response.status(403).json({
      error: 'A business assignment is required for client access.',
    });
  }

  const queryBusinessId = request.query.business_id;
  const bodyBusinessId = request.body?.business_id;

  if (
    queryBusinessId &&
    bodyBusinessId &&
    queryBusinessId !== bodyBusinessId
  ) {
    return response.status(403).json({
      error: 'Conflicting business identifiers are not allowed.',
    });
  }

  const businessId = bodyBusinessId || queryBusinessId;

  if (!businessId) {
    return next();
  }

  if (request.profile.business_id !== businessId) {
    return response.status(403).json({
      error: 'You do not have access to this business.',
    });
  }

  return next();
}
