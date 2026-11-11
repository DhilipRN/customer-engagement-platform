import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createPermissionService } from '../middleware/permissions.js';
import {
  BUSINESS_MEMBER_PERMISSIONS,
  createBusinessMembershipService,
  defaultPermissions,
} from '../services/businessMemberships.js';
import { validateActivityEvent } from '../services/activityEvents.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set(['owner', 'receptionist']);
const PERMISSIONS = new Set(BUSINESS_MEMBER_PERMISSIONS);
const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

function sendDatabaseError(response, error) {
  console.error(error);
  return response.status(500).json({ error: 'Unable to process business membership request.' });
}

function isOwnerConflict(error) {
  return error?.code === 'OWNER_REQUIRED'
    || error?.code === 'P0001'
    || error?.message === 'A business must retain an owner.';
}

function isMissingMembership(error) {
  return error?.code === 'P0002';
}

function isManagerAuthorizationFailure(error) {
  return error?.code === 'P0003'
    || error?.code === 'MEMBERSHIP_MANAGER_REQUIRED';
}

function validatePermissions(value, role, { required = false } = {}) {
  if (value === undefined && !required) return defaultPermissions(role);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'permissions must be an object.' };
  }

  const unknown = Object.keys(value).filter((permission) => !PERMISSIONS.has(permission));
  if (unknown.length) return { error: `Unsupported permissions: ${unknown.join(', ')}.` };

  const permissions = defaultPermissions(role);
  for (const permission of BUSINESS_MEMBER_PERMISSIONS) {
    if (value[permission] !== undefined && typeof value[permission] !== 'boolean') {
      return { error: `${permission} must be boolean.` };
    }
    if (value[permission] !== undefined) permissions[permission] = value[permission];
  }
  return permissions;
}

function validateBusinessId(request, response) {
  if (!isUuid(request.params.businessId)) {
    response.status(400).json({ error: 'business id must be a valid UUID.' });
    return null;
  }
  return request.params.businessId;
}

function permissionAuditFields(permissions = {}) {
  return Object.fromEntries(
    BUSINESS_MEMBER_PERMISSIONS.map((permission) => [permission, permissions[permission] === true])
  );
}

function prepareMembershipAudit(request, businessId, eventType, membershipId, before, after) {
  const validation = validateActivityEvent({
    scope_type: 'business',
    business_id: businessId,
    actor_user_id: request.user.id,
    actor_type: 'user',
    event_type: eventType,
    entity_type: 'business_membership',
    entity_id: membershipId,
    customer_id: null,
    is_reconstructed: false,
    visibility: 'audit_only',
    before,
    after,
  });

  if (validation.errors.length) {
    return { data: null, error: { code: 'VALIDATION_ERROR', message: validation.errors.join(' ') } };
  }

  return { data: validation.values, error: null };
}

export function createBusinessMembershipsRouter({
  businessService,
  membershipService,
  permissionService,
} = {}) {
  const router = Router();
  let resolvedBusinessService = businessService;
  let resolvedMembershipService = membershipService;
  let resolvedPermissionService = permissionService;
  const B = () => resolvedBusinessService ??= createBusinessService();
  const M = () => resolvedMembershipService ??= createBusinessMembershipService();
  const P = () => resolvedPermissionService ??= createPermissionService();

  async function requireManager(request, response, next) {
    const businessId = validateBusinessId(request, response);
    if (!businessId) return undefined;
    if (!request.profile || !request.user) {
      return response.status(403).json({ error: 'Authentication context is required.' });
    }

    if (request.profile.role === 'admin') {
      request.membershipManagementBusinessId = businessId;
      return next();
    }

    let authorization;
    try {
      authorization = await P().getBusinessAuthorization(request, businessId);
    } catch (error) {
      return sendDatabaseError(response, error);
    }
    if (authorization?.error) return sendDatabaseError(response, authorization.error);
    if (!authorization?.data?.authorized || authorization.data.source !== 'membership' || authorization.data.membership?.role !== 'owner') {
      return response.status(403).json({ error: 'Only business owners can manage memberships.' });
    }
    request.membershipManagementBusinessId = businessId;
    return next();
  }

  router.get('/:businessId/member-candidates', requireManager, async (request, response) => {
    const businessId = request.membershipManagementBusinessId;
    const business = await B().findById(businessId);
    if (business.error) return sendDatabaseError(response, business.error);
    if (!business.data) return response.status(404).json({ error: 'Business not found.' });

    const result = await M().listEligibleClientUsers(businessId);
    if (result.error) return sendDatabaseError(response, result.error);
    return response.json({ data: result.data ?? [] });
  });

  router.get('/:businessId/members', requireManager, async (request, response) => {
    const result = await M().listByBusinessId(request.membershipManagementBusinessId);
    if (result.error) return sendDatabaseError(response, result.error);
    return response.json({ data: result.data ?? [] });
  });

  router.post('/:businessId/members', requireManager, async (request, response) => {
    const businessId = request.membershipManagementBusinessId;
    const { user_id: userId, role = 'receptionist', permissions } = request.body ?? {};
    if (!isUuid(userId)) return response.status(400).json({ error: 'user_id must be a valid UUID.' });
    if (!ROLES.has(role)) return response.status(400).json({ error: 'role must be owner or receptionist.' });
    const permissionValues = validatePermissions(permissions, role);
    if (permissionValues.error) return response.status(400).json({ error: permissionValues.error });

    const business = await B().findById(businessId);
    if (business.error) return sendDatabaseError(response, business.error);
    if (!business.data) return response.status(404).json({ error: 'Business not found.' });
    const profile = await M().findProfile(userId);
    if (profile.error) return sendDatabaseError(response, profile.error);
    if (!profile.data) return response.status(404).json({ error: 'User profile not found.' });
    if (profile.data.role !== 'client') return response.status(400).json({ error: 'Only client users can be business members.' });

    const audit = prepareMembershipAudit(request, businessId, 'business_membership.created', null, null, {
      user_id: userId,
      role,
      ...permissionAuditFields(permissionValues),
    });
    if (audit.error) return sendDatabaseError(response, audit.error);

    const result = await M().create({
      businessId,
      userId,
      role,
      permissions: permissionValues,
      audit: audit.data,
    });
    if (result.error) {
      if (result.error.code === '23505') return response.status(409).json({ error: 'User is already a member of this business.' });
      if (isManagerAuthorizationFailure(result.error)) return response.status(403).json({ error: 'Only business owners can manage memberships.' });
      return sendDatabaseError(response, result.error);
    }
    return response.status(201).json({ data: result.data });
  });

  router.put('/:businessId/members/:membershipId', requireManager, async (request, response) => {
    const businessId = request.membershipManagementBusinessId;
    if (!isUuid(request.params.membershipId)) return response.status(400).json({ error: 'membership id must be a valid UUID.' });
    const current = await M().find(request.params.membershipId, businessId);
    if (current.error) return sendDatabaseError(response, current.error);
    if (!current.data) return response.status(404).json({ error: 'Membership not found.' });

    const { role, permissions } = request.body ?? {};
    if (role === undefined && permissions === undefined) return response.status(400).json({ error: 'role or permissions is required.' });
    if (role !== undefined && !ROLES.has(role)) return response.status(400).json({ error: 'role must be owner or receptionist.' });
    const permissionValues = permissions === undefined ? undefined : validatePermissions(permissions, role ?? current.data.role, { required: true });
    if (permissionValues?.error) return response.status(400).json({ error: permissionValues.error });
    if (current.data.role === 'owner' && role === 'receptionist') {
      const owners = await M().countOwners(businessId);
      if (owners.error) return sendDatabaseError(response, owners.error);
      if ((owners.data ?? []).length <= 1) return response.status(409).json({ error: 'A business must retain an owner.' });
    }

    const audit = prepareMembershipAudit(request, businessId, 'business_membership.updated', request.params.membershipId, {
      user_id: current.data.user_id,
      role: current.data.role,
    }, {
      user_id: current.data.user_id,
      role: role ?? current.data.role,
      ...permissionAuditFields(permissionValues ?? current.data.permissions),
    });
    if (audit.error) return sendDatabaseError(response, audit.error);

    const result = await M().update(request.params.membershipId, businessId, {
      role,
      permissions: permissionValues,
      audit: audit.data,
    });
    if (result.error) {
      if (isOwnerConflict(result.error)) return response.status(409).json({ error: result.error.message });
      if (isMissingMembership(result.error)) return response.status(404).json({ error: 'Membership not found.' });
      if (isManagerAuthorizationFailure(result.error)) return response.status(403).json({ error: 'Only business owners can manage memberships.' });
      return sendDatabaseError(response, result.error);
    }
    return response.json({ data: result.data });
  });

  router.delete('/:businessId/members/:membershipId', requireManager, async (request, response) => {
    const businessId = request.membershipManagementBusinessId;
    if (!isUuid(request.params.membershipId)) return response.status(400).json({ error: 'membership id must be a valid UUID.' });
    const current = await M().find(request.params.membershipId, businessId);
    if (current.error) return sendDatabaseError(response, current.error);
    if (!current.data) return response.status(404).json({ error: 'Membership not found.' });
    const audit = prepareMembershipAudit(request, businessId, 'business_membership.deleted', request.params.membershipId, {
      user_id: current.data.user_id,
      role: current.data.role,
    }, null);
    if (audit.error) return sendDatabaseError(response, audit.error);

    const result = await M().remove(request.params.membershipId, businessId, audit.data);
    if (result.error) {
      if (isOwnerConflict(result.error)) return response.status(409).json({ error: result.error.message });
      if (isMissingMembership(result.error)) return response.status(404).json({ error: 'Membership not found.' });
      if (isManagerAuthorizationFailure(result.error)) return response.status(403).json({ error: 'Only business owners can manage memberships.' });
      return sendDatabaseError(response, result.error);
    }
    return response.status(204).send();
  });

  return router;
}
