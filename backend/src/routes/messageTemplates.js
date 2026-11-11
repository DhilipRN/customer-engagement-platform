import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createMessageTemplateService, normalizeMessageTemplate } from '../services/messageTemplates.js';
import { createActivityEventService } from '../services/activityEvents.js';
import { createBusinessPermissionMiddleware, getAuthorizedBusinessId, requireBusinessAccess } from '../middleware/auth.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set([
  'utility',
  'marketing',
  'authentication',
  'review',
  'promotional',
  'transactional',
  'other',
]);
const LANGUAGES = new Set(['en', 'te', 'hi']);
const META_CATEGORIES = new Set(['utility', 'marketing', 'authentication']);
const STORAGE_CATEGORY_MAP = {
  utility: 'transactional',
  marketing: 'promotional',
  authentication: 'other',
};
const SUPPORTED_VARIABLES = new Set([
  'customer_name',
  'business_name',
  'review_link',
  'product_name',
  'purchase_date',
]);

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function findUnsupportedVariables(message) {
  const variables = [...message.matchAll(/{{\s*([^{}\s]+)\s*}}/g)].map((match) => match[1]);
  const unsupported = variables.filter((variable) => !SUPPORTED_VARIABLES.has(variable));
  const malformed = /{{|}}/.test(message.replace(/{{\s*[^{}\s]+\s*}}/g, ''));

  return { malformed, unsupported };
}

function validateMetadata(metadata) {
  if (metadata === undefined) return { errors: [], value: undefined };
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { errors: ['metadata must be an object.'] };
  }

  const errors = [];
  const value = {};
  const allowedKeys = new Set(['meta_category', 'meta_template_name', 'language', 'header', 'footer', 'buttons']);

  for (const key of Object.keys(metadata)) {
    if (!allowedKeys.has(key)) errors.push(`metadata.${key} is not supported.`);
  }

  if (metadata.meta_category !== undefined) {
    if (typeof metadata.meta_category !== 'string' || !META_CATEGORIES.has(metadata.meta_category)) {
      errors.push('metadata.meta_category must be one of: utility, marketing, authentication.');
    } else {
      value.meta_category = metadata.meta_category;
    }
  }

  for (const field of ['meta_template_name', 'header', 'footer']) {
    if (metadata[field] !== undefined) {
      if (typeof metadata[field] !== 'string' || metadata[field].length > 1024) {
        errors.push(`metadata.${field} must be a string no longer than 1024 characters.`);
      } else if (metadata[field].trim()) {
        value[field] = metadata[field].trim();
      }
    }
  }

  if (metadata.language !== undefined) {
    if (typeof metadata.language !== 'string' || !LANGUAGES.has(metadata.language)) {
      errors.push('metadata.language must be one of: en, te, hi.');
    } else {
      value.language = metadata.language;
    }
  }

  if (metadata.buttons !== undefined) {
    if (!Array.isArray(metadata.buttons) || metadata.buttons.length > 3) {
      errors.push('metadata.buttons must contain no more than 3 buttons.');
    } else {
      value.buttons = metadata.buttons.map((button, index) => {
        if (!button || typeof button !== 'object' || Array.isArray(button)) {
          errors.push(`metadata.buttons[${index}] must be an object.`);
          return null;
        }
        if (!['quick_reply', 'cta'].includes(button.type)) errors.push(`metadata.buttons[${index}].type is invalid.`);
        if (typeof button.text !== 'string' || !button.text.trim() || button.text.length > 80) errors.push(`metadata.buttons[${index}].text is invalid.`);
        if (button.type === 'cta' && (typeof button.url !== 'string' || !/^https?:\/\//i.test(button.url))) errors.push(`metadata.buttons[${index}].url must be a valid http(s) URL.`);
        return {
          type: button.type,
          text: typeof button.text === 'string' ? button.text.trim() : '',
          ...(button.type === 'cta' ? { url: button.url } : {}),
        };
      }).filter(Boolean);
    }
  }

  return { errors, value };
}

function validateTemplate(payload, { creating = false } = {}) {
  const errors = [];
  const values = {};

  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      errors.push('name must be a non-empty string.');
    } else {
      values.name = payload.name.trim();
    }
  }

  if (payload.category !== undefined) {
    if (typeof payload.category !== 'string' || !CATEGORIES.has(payload.category)) {
      errors.push('category must be one of: utility, marketing, authentication, review, promotional, transactional, other.');
    } else {
      values.category = payload.category;
    }
  }

  const metadata = validateMetadata(payload.metadata);
  errors.push(...metadata.errors);
  if (metadata.value !== undefined && !metadata.errors.length) values.metadata = metadata.value;

  if (values.category && META_CATEGORIES.has(values.category)) {
    const metaCategory = values.category;
    values.category = STORAGE_CATEGORY_MAP[metaCategory];
    values.metadata = {
      ...(values.metadata ?? {}),
      meta_category: metaCategory,
    };
  }

  if (payload.message !== undefined) {
    if (typeof payload.message !== 'string' || !payload.message.trim()) {
      errors.push('message must be a non-empty string.');
    } else {
      const message = payload.message.trim();
      const { malformed, unsupported } = findUnsupportedVariables(message);
      if (malformed) errors.push('message contains malformed template variables.');
      if (unsupported.length) errors.push(`message contains unsupported variables: ${unsupported.join(', ')}.`);
      values.message = message;
    }
  }

  if (creating) {
    if (!isValidUuid(payload.business_id)) {
      errors.push('business_id must be a valid UUID.');
    } else {
      values.business_id = payload.business_id;
    }

    for (const field of ['name', 'category', 'message']) {
      if (values[field] === undefined && !errors.some((error) => error.startsWith(field))) {
        errors.push(`${field} is required.`);
      }
    }
  }

  return { errors, values };
}

function sendDatabaseError(response, error) {
  console.error(error);
  return response.status(500).json({ error: 'Unable to process the message template request.' });
}

function normalizeTemplateResponse(data) {
  return Array.isArray(data)
    ? data.map(normalizeMessageTemplate)
    : normalizeMessageTemplate(data);
}

const AUDITED_TEMPLATE_FIELDS = ['name', 'category', 'message', 'metadata'];

function auditSnapshot(template) {
  return Object.fromEntries(
    AUDITED_TEMPLATE_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(template, field))
      .map((field) => [field, template[field]])
  );
}

function changedFields(before, after) {
  return AUDITED_TEMPLATE_FIELDS.filter((field) =>
    field === 'metadata'
      ? JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)
      : before[field] !== after[field]
  );
}

function sendAuditError(response, error) {
  console.error('Unable to record message-template activity event:', error?.message ?? error);
  return response.status(500).json({
    error: 'Message-template operation succeeded, but its audit event could not be recorded.',
  });
}

export function createMessageTemplatesRouter({ messageTemplateService, businessService, activityEventService, businessAccessMiddleware, permissionService } = {}) {
  const router = Router();
  const accessMiddleware = businessAccessMiddleware ?? requireBusinessAccess;
  const requireViewTemplates = createBusinessPermissionMiddleware({ permissionService, permission: 'view_message_templates', permissionError: 'You do not have permission to view message templates.', lookupError: 'Unable to verify message-template access.' });
  const requireManageTemplates = createBusinessPermissionMiddleware({ permissionService, permission: 'manage_message_templates', permissionError: 'You do not have permission to manage message templates.', lookupError: 'Unable to verify message-template access.' });
  let resolvedTemplateService = messageTemplateService;
  let resolvedBusinessService = businessService;
  let resolvedActivityEventService = activityEventService;

  function getTemplateService() {
    if (!resolvedTemplateService) resolvedTemplateService = createMessageTemplateService();
    return resolvedTemplateService;
  }

  function getBusinessService() {
    if (!resolvedBusinessService) resolvedBusinessService = createBusinessService();
    return resolvedBusinessService;
  }

  function getActivityEventService() {
    if (!resolvedActivityEventService) resolvedActivityEventService = createActivityEventService();
    return resolvedActivityEventService;
  }

  async function recordTemplateEvent(request, template, eventType, fields = {}) {
    try {
      const result = await getActivityEventService().create({
        scope_type: 'business',
        business_id: template.business_id,
        actor_user_id: request.user?.id ?? null,
        actor_type: 'user',
        event_type: eventType,
        entity_type: 'message_template',
        entity_id: template.id,
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

  async function findBusiness(businessId, response) {
    const { data, error } = await getBusinessService().findById(businessId);
    if (error) {
      sendDatabaseError(response, error);
      return false;
    }
    if (!data) {
      response.status(404).json({ error: 'Business not found.' });
      return false;
    }
    return true;
  }

  router.get('/', accessMiddleware, requireViewTemplates, async (request, response) => {
    const { business_id: businessId } = request.query;
    if (!isValidUuid(businessId)) {
      return response.status(400).json({ error: 'business_id query parameter must be a valid UUID.' });
    }
    if (!(await findBusiness(businessId, response))) return undefined;

    const { data, error } = await getTemplateService().listByBusinessId(businessId);
    if (error) return sendDatabaseError(response, error);
    return response.status(200).json({ data: normalizeTemplateResponse(data) });
  });

  router.get('/:id', accessMiddleware, requireViewTemplates, async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'message template id must be a valid UUID.' });
    }
    const businessScope = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
    if (request.profile && request.profile.role !== 'admin' && !businessScope) {
      return response.status(403).json({ error: 'An authorized business context is required.' });
    }
    const { data, error } = await getTemplateService().findById(request.params.id, businessScope);
    if (error) return sendDatabaseError(response, error);
    if (!data) return response.status(404).json({ error: 'Message template not found.' });
    return response.status(200).json({ data: normalizeTemplateResponse(data) });
  });

  router.post('/', accessMiddleware, requireManageTemplates, async (request, response) => {
    const { errors, values } = validateTemplate(request.body ?? {}, { creating: true });
    if (errors.length) return response.status(400).json({ errors });
    if (!(await findBusiness(values.business_id, response))) return undefined;

    const { data, error } = await getTemplateService().create(values);
    if (error) return sendDatabaseError(response, error);

    const auditResult = await recordTemplateEvent(
      request,
      data,
      'message_template.created',
      { after: auditSnapshot(data) },
    );
    if (auditResult.error) return sendAuditError(response, auditResult.error);

    return response.status(201).json({ data: normalizeTemplateResponse(data) });
  });

  router.put('/:id', accessMiddleware, requireManageTemplates, async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'message template id must be a valid UUID.' });
    }
    const { errors, values } = validateTemplate(request.body ?? {});
    if (!Object.keys(values).length) errors.push('At least one editable field is required.');
    if (errors.length) return response.status(400).json({ errors });

    const businessScope = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
    if (request.profile && request.profile.role !== 'admin' && !businessScope) {
      return response.status(403).json({ error: 'An authorized business context is required.' });
    }
    const existing = await getTemplateService().findById(request.params.id, businessScope);
    if (existing.error) return sendDatabaseError(response, existing.error);
    if (!existing.data) return response.status(404).json({ error: 'Message template not found.' });
    const before = auditSnapshot(existing.data);

    const { data, error } = await getTemplateService().update(
      request.params.id,
      values,
      businessScope,
    );
    if (error) return sendDatabaseError(response, error);
    if (!data) return response.status(404).json({ error: 'Message template not found.' });

    const after = auditSnapshot(data);
    const changed = changedFields(before, after);
    const auditResult = await recordTemplateEvent(
      request,
      data,
      'message_template.updated',
      {
        before: Object.fromEntries(changed.map((field) => [field, before[field]])),
        after: Object.fromEntries(changed.map((field) => [field, after[field]])),
      },
    );
    if (auditResult.error) return sendAuditError(response, auditResult.error);

    return response.status(200).json({ data: normalizeTemplateResponse(data) });
  });

  router.delete('/:id', accessMiddleware, requireManageTemplates, async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'message template id must be a valid UUID.' });
    }
    const businessScope = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
    if (request.profile && request.profile.role !== 'admin' && !businessScope) {
      return response.status(403).json({ error: 'An authorized business context is required.' });
    }
    const existing = await getTemplateService().findById(request.params.id, businessScope);
    if (existing.error) return sendDatabaseError(response, existing.error);
    if (!existing.data) return response.status(404).json({ error: 'Message template not found.' });
    const { data, error } = await getTemplateService().remove(
      request.params.id,
      businessScope,
    );
    if (error) return sendDatabaseError(response, error);
    if (!data) return response.status(404).json({ error: 'Message template not found.' });

    const auditResult = await recordTemplateEvent(
      request,
      existing.data,
      'message_template.deleted',
      { before: auditSnapshot(existing.data) },
    );
    if (auditResult.error) return sendAuditError(response, auditResult.error);

    return response.status(204).send();
  });

  return router;
}
