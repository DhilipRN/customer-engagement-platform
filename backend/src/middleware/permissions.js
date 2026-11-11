import { getSupabaseClient } from '../config/supabase.js';

export const SUPPORTED_PERMISSIONS = Object.freeze([
  'view_chats',
  'view_customer_activity',
  'send_messages',
  'manage_customers',
  'view_appointments',
  'manage_appointments',
  'view_purchases',
  'manage_purchases',
  'view_campaigns',
  'manage_campaigns',
  'view_message_templates',
  'manage_message_templates',
  'view_automations',
  'manage_automations',
]);

const SUPPORTED_PERMISSION_SET = new Set(SUPPORTED_PERMISSIONS);
const MEMBERSHIP_ROLES = new Set(['owner', 'receptionist']);

function emptyPermissions() {
  return Object.fromEntries(
    SUPPORTED_PERMISSIONS.map((permission) => [permission, false])
  );
}

function result({
  authorized = false,
  source = 'none',
  role = null,
  membership = null,
  permissions,
  reason = null,
  error = null,
}) {
  return {
    data: {
      authorized,
      source,
      role,
      membership,
      permissions: permissions ?? emptyPermissions(),
      reason,
    },
    error,
  };
}

function hasCompleteAuthContext(request) {
  const userId = request?.user?.id;
  const profileId = request?.profile?.id;

  return Boolean(userId && profileId && userId === profileId);
}

function allPermissions() {
  return Object.fromEntries(
    SUPPORTED_PERMISSIONS.map((permission) => [permission, true])
  );
}

export function createPermissionService(supabaseClient = getSupabaseClient()) {
  return {
    async listAuthorizedBusinessIds(request) {
      if (!hasCompleteAuthContext(request)) {
        return {
          data: null,
          error: null,
          reason: 'authorization_context_missing',
        };
      }

      const { profile, user } = request;

      if (profile.role === 'admin') {
        return { data: null, error: null, role: 'admin' };
      }

      if (profile.role !== 'client') {
        return { data: null, error: null, reason: 'unsupported_role' };
      }

      try {
        const { data: memberships, error } = await supabaseClient
          .from('business_memberships')
          .select('business_id, role')
          .eq('user_id', user.id);

        if (error) {
          return { data: null, error, reason: 'membership_lookup_failed' };
        }

        const validMemberships = (Array.isArray(memberships) ? memberships : [])
          .filter((membership) => MEMBERSHIP_ROLES.has(membership.role));

        if (validMemberships.length > 0) {
          return {
            data: [...new Set(validMemberships.map((membership) => membership.business_id))],
            error: null,
            source: 'membership',
          };
        }

        return {
          data: profile.business_id ? [profile.business_id] : [],
          error: null,
          source: 'legacy-client',
        };
      } catch (error) {
        return { data: null, error, reason: 'authorization_lookup_failed' };
      }
    },

    async getBusinessAuthorization(request, businessId) {
      if (!hasCompleteAuthContext(request) || !businessId) {
        return result({ reason: 'authorization_context_missing' });
      }

      const { profile, user } = request;

      if (profile.role === 'admin') {
        return result({
          authorized: true,
          source: 'admin',
          role: profile.role,
          permissions: allPermissions(),
        });
      }

      if (profile.role !== 'client') {
        return result({ reason: 'unsupported_role' });
      }

      try {
        const { data: memberships, error: membershipError } =
          await supabaseClient
            .from('business_memberships')
            .select('id, business_id, user_id, role')
            .eq('user_id', user.id);

        if (membershipError) {
          return result({
            reason: 'membership_lookup_failed',
            error: membershipError,
          });
        }

        const userMemberships = Array.isArray(memberships) ? memberships : [];
        const membership = userMemberships.find(
          (candidate) => candidate.business_id === businessId
        );

        if (userMemberships.length > 0) {
          if (!membership || !MEMBERSHIP_ROLES.has(membership.role)) {
            return result({ reason: 'business_membership_required' });
          }

          const { data: permissionRows, error: permissionError } =
            await supabaseClient
              .from('business_member_permissions')
              .select('permission, allowed')
              .eq('membership_id', membership.id)
              .in('permission', SUPPORTED_PERMISSIONS);

          if (permissionError) {
            return result({
              reason: 'permission_lookup_failed',
              error: permissionError,
            });
          }

          const permissions = emptyPermissions();

          for (const row of Array.isArray(permissionRows) ? permissionRows : []) {
            if (SUPPORTED_PERMISSION_SET.has(row.permission)) {
              permissions[row.permission] = row.allowed === true;
            }
          }

          return result({
            authorized: true,
            source: 'membership',
            role: membership.role,
            membership,
            permissions,
          });
        }

        if (profile.business_id === businessId) {
          return result({
            authorized: true,
            source: 'legacy-client',
            role: profile.role,
            permissions: allPermissions(),
          });
        }

        return result({ reason: 'business_access_denied' });
      } catch (error) {
        return result({
          reason: 'authorization_lookup_failed',
          error,
        });
      }
    },
  };
}
