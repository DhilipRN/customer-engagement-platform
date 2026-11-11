import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createActivityEventService } from '../services/activityEvents.js';
import { createPermissionService } from '../middleware/permissions.js';
import { requireAdmin } from '../middleware/auth.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE_FIELDS = ['name', 'phone', 'email', 'address', 'google_review_link'];

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function validateBusiness(values, { requireName = false } = {}) {
  const errors = [];
  const sanitizedValues = {};

  for (const field of EDITABLE_FIELDS) {
    if (values[field] !== undefined) {
      if (typeof values[field] !== 'string') {
        errors.push(`${field} must be a string.`);
      } else {
        sanitizedValues[field] = values[field].trim();
      }
    }
  }

  if (requireName && !sanitizedValues.name) {
    errors.push('name is required.');
  }

  if (sanitizedValues.email && !/^\S+@\S+\.\S+$/.test(sanitizedValues.email)) {
    errors.push('email must be valid.');
  }

  if (sanitizedValues.google_review_link) {
    try {
      new URL(sanitizedValues.google_review_link);
    } catch {
      errors.push('google_review_link must be a valid URL.');
    }
  }

  return { errors, values: sanitizedValues };
}

function sendDatabaseError(response, error) {
  console.error(error);
  return response.status(500).json({ error: 'Unable to process the business request.' });
}

function auditSnapshot(business) {
  return Object.fromEntries(
    EDITABLE_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(business, field))
      .map((field) => [field, business[field]])
  );
}

function changedFields(before, after) {
  return EDITABLE_FIELDS.filter((field) => before[field] !== after[field]);
}

function safeAuditErrorMessage(error) {
  const message = typeof error?.message === 'string'
    ? error.message
    : String(error ?? 'Unknown audit persistence error.');

  return message
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(
      /(access[_-]?token|service[_-]?role[_-]?key|password)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]',
    );
}

const AUDIT_WARNING = 'Audit event could not be recorded.';

function sendAuditWarning(response, data, error, { operation, eventType, status } = {}) {
  console.error('Business audit event persistence failed', {
    operation,
    event_type: eventType,
    error: {
      code: error?.code ?? null,
      message: safeAuditErrorMessage(error),
    },
  });
  return response.status(status).json({
    data,
    warning: AUDIT_WARNING,
  });
}

export function createBusinessesRouter({
  businessService,
  activityEventService,
  permissionService,
} = {}) {
  const router = Router();
  let resolvedBusinessService = businessService;
  let resolvedActivityEventService = activityEventService;
  let resolvedPermissionService = permissionService;

  function getBusinessService() {
    if (!resolvedBusinessService) {
      resolvedBusinessService = createBusinessService();
    }

    return resolvedBusinessService;
  }

  function getActivityEventService() {
    if (!resolvedActivityEventService) {
      resolvedActivityEventService = createActivityEventService();
    }

    return resolvedActivityEventService;
  }

  function getPermissionService() {
    if (!resolvedPermissionService) {
      resolvedPermissionService = createPermissionService();
    }

    return resolvedPermissionService;
  }

  async function recordBusinessEvent(request, business, eventType, fields = {}) {
    try {
      const result = await getActivityEventService().create({
        scope_type: 'business',
        business_id: business.id,
        actor_user_id: request.user?.id ?? null,
        actor_type: 'user',
        event_type: eventType,
        entity_type: 'business',
        entity_id: business.id,
        customer_id: null,
        is_reconstructed: false,
        visibility: 'audit_only',
        ...fields,
      });

      if (result?.error) return result;
      if (!result?.data) {
        return { data: null, error: new Error('Activity event persistence returned no record.') };
      }
      return result;
    } catch (error) {
      return { data: null, error };
    }
  }

  router.get('/assigned', async (request, response) => {
    const businessId = request.profile?.business_id;

    if (!businessId) {
      return response.status(404).json({
        error: 'No business is assigned to this profile.',
      });
    }

    if (request.profile?.role !== 'admin') {
      if (!request.profile || !request.user) {
        return response.status(403).json({
          error: 'Authentication context is required for business access.',
        });
      }

      let authorization;
      try {
        authorization = await getPermissionService().getBusinessAuthorization(request, businessId);
      } catch (error) {
        return sendDatabaseError(response, error);
      }

      if (authorization?.error) {
        return sendDatabaseError(response, authorization.error);
      }

      if (!authorization?.data?.authorized) {
        return response.status(403).json({
          error: 'You do not have access to the assigned business.',
        });
      }
    }

    const { data, error } = await getBusinessService().findById(businessId);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Assigned business not found.' });
    }

    return response.status(200).json({ data });
  });

  router.get('/accessible', async (request, response) => {
    if (!request.profile || !request.user) {
      return response.status(403).json({
        error: 'Authentication context is required for business discovery.',
      });
    }

    if (request.profile.role === 'admin') {
      const { data, error } = await getBusinessService().list();

      if (error) return sendDatabaseError(response, error);
      return response.status(200).json({ data: data ?? [] });
    }

    const authorization = await getPermissionService().listAuthorizedBusinessIds(request);

    if (authorization?.error) {
      return sendDatabaseError(response, authorization.error);
    }

    if (!Array.isArray(authorization?.data)) {
      return response.status(403).json({
        error: 'Unable to determine accessible businesses.',
      });
    }

    const businesses = [];

    for (const businessId of authorization.data) {
      const result = await getBusinessService().findById(businessId);

      if (result.error) return sendDatabaseError(response, result.error);
      if (result.data) businesses.push(result.data);
    }

    return response.status(200).json({ data: businesses });
  });

  router.get('/:businessId/permissions', async (request, response) => {
    if (!isValidUuid(request.params.businessId)) {
      return response.status(400).json({ error: 'business id must be a valid UUID.' });
    }

    if (!request.profile || !request.user) {
      return response.status(403).json({
        error: 'Authentication context is required for permission discovery.',
      });
    }

    let authorization;
    try {
      authorization = await getPermissionService().getBusinessAuthorization(
        request,
        request.params.businessId,
      );
    } catch (error) {
      return sendDatabaseError(response, error);
    }

    if (authorization?.error) {
      return sendDatabaseError(response, authorization.error);
    }

    if (!authorization?.data?.authorized) {
      return response.status(403).json({ error: 'You do not have access to this business.' });
    }

    const business = await getBusinessService().findById(request.params.businessId);
    if (business.error) return sendDatabaseError(response, business.error);
    if (!business.data) return response.status(404).json({ error: 'Business not found.' });

    return response.status(200).json({
      data: {
        business_id: request.params.businessId,
        source: authorization.data.source,
        role: authorization.data.role,
        permissions: authorization.data.permissions,
      },
    });
  });

  router.use(requireAdmin);

  router.get('/', async (_request, response) => {
    const { data, error } = await getBusinessService().list();

    if (error) {
      return sendDatabaseError(response, error);
    }

    return response.status(200).json({ data });
  });

  router.get('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'business id must be a valid UUID.' });
    }

    const { data, error } = await getBusinessService().findById(request.params.id);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Business not found.' });
    }

    return response.status(200).json({ data });
  });

  router.post('/', async (request, response) => {
    const { errors, values } = validateBusiness(request.body ?? {}, { requireName: true });

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    const { data, error } = await getBusinessService().create(values);

    if (error) {
      return sendDatabaseError(response, error);
    }

    const auditResult = await recordBusinessEvent(
      request,
      data,
      'business.created',
      { after: auditSnapshot(data) },
    );
    if (auditResult.error) {
      return sendAuditWarning(response, data, auditResult.error, {
        operation: 'create',
        eventType: 'business.created',
        status: 201,
      });
    }

    return response.status(201).json({ data });
  });

  router.put('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'business id must be a valid UUID.' });
    }

    const { errors, values } = validateBusiness(request.body ?? {});

    if (!Object.keys(values).length) {
      errors.push('At least one editable field is required.');
    }

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    const existing = await getBusinessService().findById(request.params.id);
    if (existing.error) {
      return sendDatabaseError(response, existing.error);
    }

    if (!existing.data) {
      return response.status(404).json({ error: 'Business not found.' });
    }

    const before = auditSnapshot(existing.data);
    const { data, error } = await getBusinessService().update(request.params.id, values);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Business not found.' });
    }

    const after = auditSnapshot(data);
    const fields = changedFields(before, after);
    const auditResult = await recordBusinessEvent(
      request,
      data,
      'business.updated',
      {
        before: Object.fromEntries(fields.map((field) => [field, before[field]])),
        after: Object.fromEntries(fields.map((field) => [field, after[field]])),
      },
    );
    if (auditResult.error) {
      return sendAuditWarning(response, data, auditResult.error, {
        operation: 'update',
        eventType: 'business.updated',
        status: 200,
      });
    }

    return response.status(200).json({ data });
  });

  router.delete('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'business id must be a valid UUID.' });
    }

    const existing = await getBusinessService().findById(request.params.id);
    if (existing.error) {
      return sendDatabaseError(response, existing.error);
    }

    if (!existing.data) {
      return response.status(404).json({ error: 'Business not found.' });
    }

    const { data, error } = await getBusinessService().remove(request.params.id);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Business not found.' });
    }

    const auditResult = await recordBusinessEvent(
      request,
      existing.data,
      'business.deleted',
      { before: auditSnapshot(existing.data) },
    );
    if (auditResult.error) {
      return sendAuditWarning(response, data, auditResult.error, {
        operation: 'delete',
        eventType: 'business.deleted',
        status: 200,
      });
    }

    return response.status(204).send();
  });

  return router;
}
