import { getSupabaseClient } from '../config/supabase.js';

export const BUSINESS_MEMBER_PERMISSIONS = Object.freeze([
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

const permissionSet = new Set(BUSINESS_MEMBER_PERMISSIONS);

function defaultPermissions(role) {
  const permissions = Object.fromEntries(
    BUSINESS_MEMBER_PERMISSIONS.map((permission) => [permission, false])
  );

  if (role === 'owner') {
    return Object.fromEntries(
      BUSINESS_MEMBER_PERMISSIONS.map((permission) => [permission, true])
    );
  }

  permissions.view_chats = true;
  return permissions;
}

function permissionMap(rows) {
  const permissions = Object.fromEntries(
    BUSINESS_MEMBER_PERMISSIONS.map((permission) => [permission, false])
  );

  for (const row of Array.isArray(rows) ? rows : []) {
    if (permissionSet.has(row.permission)) {
      permissions[row.permission] = row.allowed === true;
    }
  }

  return permissions;
}

export function createBusinessMembershipService(client = getSupabaseClient()) {
  const find = async (membershipId, businessId) => {
    let query = client
      .from('business_memberships')
      .select('*')
      .eq('id', membershipId);

    if (businessId) query = query.eq('business_id', businessId);
    const membership = await query.maybeSingle();
    if (membership.error || !membership.data) return membership;

    const permissions = await listPermissions(membership.data.id);
    if (permissions.error) return { data: null, error: permissions.error };

    return {
      data: {
        ...membership.data,
        permissions: permissionMap(permissions.data),
      },
      error: null,
    };
  };

  const listPermissions = (membershipId) => client
    .from('business_member_permissions')
    .select('permission, allowed')
    .eq('membership_id', membershipId);

  const countOwners = (businessId) => client
    .from('business_memberships')
    .select('id')
    .eq('business_id', businessId)
    .eq('role', 'owner');

  return {
    async listByBusinessId(businessId) {
      const memberships = await client
        .from('business_memberships')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true });

      if (memberships.error) return memberships;

      const data = [];
      for (const membership of memberships.data ?? []) {
        const permissions = await listPermissions(membership.id);
        if (permissions.error) return { data: null, error: permissions.error };
        data.push({
          ...membership,
          permissions: permissionMap(permissions.data),
        });
      }

      return { data, error: null };
    },

    find,

    async findByBusinessAndUser(businessId, userId) {
      return client
        .from('business_memberships')
        .select('*')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .maybeSingle();
    },

    async findProfile(userId) {
      return client
        .from('profiles')
        .select('id, role, business_id')
        .eq('id', userId)
        .maybeSingle();
    },

    async listEligibleClientUsers(businessId) {
      const [profiles, memberships] = await Promise.all([
        client
          .from('profiles')
          .select('id')
          .eq('role', 'client'),
        client
          .from('business_memberships')
          .select('user_id')
          .eq('business_id', businessId),
      ]);

      if (profiles.error) return { data: null, error: profiles.error };
      if (memberships.error) return { data: null, error: memberships.error };

      const existingMemberIds = new Set(
        (memberships.data ?? []).map((membership) => membership.user_id)
      );
      const eligibleIds = (profiles.data ?? [])
        .map((profile) => profile.id)
        .filter((userId) => !existingMemberIds.has(userId));

      if (!client.auth?.admin?.listUsers) {
        return {
          data: eligibleIds.map((id) => ({ id, email: '' })),
          error: null,
        };
      }

      const usersResult = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersResult.error) return { data: null, error: usersResult.error };
      const usersById = new Map((usersResult.data?.users ?? []).map((user) => [user.id, user]));

      return {
        data: eligibleIds.map((id) => ({
          id,
          email: usersById.get(id)?.email ?? '',
        })),
        error: null,
      };
    },

    async create({ businessId, userId, role, permissions, audit }) {
      return client.rpc('create_business_membership', {
        p_business_id: businessId,
        p_user_id: userId,
        p_role: role,
        p_permissions: permissions,
        p_actor_user_id: audit.actor_user_id,
        p_audit_before: audit.before ?? null,
        p_audit_after: audit.after ?? null,
      });
    },

    async update(membershipId, businessId, { role, permissions, audit }) {
      const result = await client.rpc('update_business_membership', {
        p_membership_id: membershipId,
        p_business_id: businessId,
        p_role: role ?? null,
        p_permissions: permissions ?? null,
        p_actor_user_id: audit.actor_user_id,
        p_audit_before: audit.before ?? null,
        p_audit_after: audit.after ?? null,
      });
      if (result.error || !result.data) return result;

      if (result.data.permissions && typeof result.data.permissions === 'object' && !Array.isArray(result.data.permissions)) {
        return result;
      }

      const storedPermissions = await listPermissions(membershipId);
      if (storedPermissions.error) return { data: null, error: storedPermissions.error };
      return {
        data: {
          ...result.data,
          permissions: permissionMap(storedPermissions.data),
        },
        error: null,
      };
    },

    countOwners,

    async remove(membershipId, businessId, audit) {
      return client.rpc('delete_business_membership', {
        p_membership_id: membershipId,
        p_business_id: businessId,
        p_actor_user_id: audit.actor_user_id,
        p_audit_before: audit.before ?? null,
        p_audit_after: audit.after ?? null,
      });
    },
  };
}

export { defaultPermissions };
