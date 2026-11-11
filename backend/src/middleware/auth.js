import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/env.js';
import { createPermissionService } from './permissions.js';

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

export function getAuthorizedBusinessId(request) {
  const authorization = request?.businessAuthorization;

  if (authorization) {
    if (authorization.source === 'membership') {
      return authorization.membership?.business_id ?? null;
    }

    if (authorization.source === 'legacy-client') {
      return request.profile?.business_id ?? null;
    }

    return null;
  }

  if (request?.profile?.role === 'admin') {
    return null;
  }

  if (request?.profile?.role === 'client') {
    return request.profile.business_id ?? null;
  }

  return null;
}

export function createBusinessPermissionMiddleware({
  permissionService,
  permission,
  permissionError = 'You do not have permission to perform this action.',
  lookupError = 'Unable to verify permission access.',
} = {}) {
  let resolvedPermissionService = permissionService;

  return async function requireBusinessPermission(request, response, next) {
    if (!request.profile || !request.user || request.profile.role === 'admin') {
      return next();
    }

    let authorization = request.businessAuthorization;
    if (!authorization) {
      const businessId = request.body?.business_id
        || request.query?.business_id
        || getAuthorizedBusinessId(request);

      try {
        resolvedPermissionService ??= createPermissionService();
        const lookup = await resolvedPermissionService.getBusinessAuthorization(
          request,
          businessId,
        );
        if (lookup?.error) {
          console.error('Business permission lookup failed:', lookup.error);
          return response.status(500).json({ error: lookupError });
        }
        authorization = lookup?.data;
      } catch (error) {
        console.error('Business permission lookup failed:', error);
        return response.status(500).json({ error: lookupError });
      }
    }

    if (!authorization) {
      return response.status(500).json({ error: lookupError });
    }

    request.businessAuthorization = authorization;
    if (!authorization.authorized) {
      return response.status(403).json({ error: 'You do not have access to this business.' });
    }
    if (authorization.permissions?.[permission] !== true) {
      return response.status(403).json({ error: permissionError });
    }

    return next();
  };
}

export function createBusinessAccessMiddleware({ permissionService } = {}) {
  let resolvedPermissionService = permissionService;

  const getPermissionService = () => {
    resolvedPermissionService ??= createPermissionService();
    return resolvedPermissionService;
  };

  return async function requireBusinessAccess(request, response, next) {
    if (!request.profile) {
      return next();
    }

    if (request.profile.role === 'admin') {
      return next();
    }

    const queryBusinessId = request.query?.business_id;
    const bodyBusinessId = request.body?.business_id;

    if (
      request.profile.role === 'client' &&
      !request.profile.business_id &&
      !queryBusinessId &&
      !bodyBusinessId
    ) {
      return response.status(403).json({
        error: 'A business assignment is required for client access.',
      });
    }

    if (
      queryBusinessId &&
      bodyBusinessId &&
      queryBusinessId !== bodyBusinessId
    ) {
      return response.status(403).json({
        error: 'Conflicting business identifiers are not allowed.',
      });
    }

    if (!request.user) {
      if (!queryBusinessId && !bodyBusinessId) {
        return next();
      }

      const requestedBusinessId = bodyBusinessId || queryBusinessId;

      if (
        request.profile.role === 'client' &&
        request.profile.business_id === requestedBusinessId
      ) {
        return next();
      }

      return response.status(403).json({
        error: 'Authentication context is required for business access.',
      });
    }

    const businessId =
      bodyBusinessId ||
      queryBusinessId ||
      (request.profile.role === 'client'
        ? request.profile.business_id
        : null);

    if (!businessId) {
      return response.status(403).json({
        error: 'A business identifier is required for business access.',
      });
    }

    let authorization;

    try {
      authorization = await getPermissionService().getBusinessAuthorization(
        request,
        businessId,
      );
    } catch (error) {
      console.error('Business authorization lookup failed:', error);
      return response.status(500).json({
        error: 'Unable to verify business access.',
      });
    }

    if (authorization?.error) {
      console.error('Business authorization lookup failed:', authorization.error);
      return response.status(500).json({
        error: 'Unable to verify business access.',
      });
    }

    if (!authorization?.data?.authorized) {
      return response.status(403).json({
        error: 'You do not have access to this business.',
      });
    }

    request.businessAuthorization = authorization.data;
    return next();
  };
}

export const requireBusinessAccess = createBusinessAccessMiddleware();
