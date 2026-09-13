import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createMessageTemplateService } from '../services/messageTemplates.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(['review', 'promotional', 'transactional', 'other']);
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
      errors.push('category must be one of: review, promotional, transactional, other.');
    } else {
      values.category = payload.category;
    }
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

export function createMessageTemplatesRouter({ messageTemplateService, businessService } = {}) {
  const router = Router();
  let resolvedTemplateService = messageTemplateService;
  let resolvedBusinessService = businessService;

  function getTemplateService() {
    if (!resolvedTemplateService) resolvedTemplateService = createMessageTemplateService();
    return resolvedTemplateService;
  }

  function getBusinessService() {
    if (!resolvedBusinessService) resolvedBusinessService = createBusinessService();
    return resolvedBusinessService;
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

  router.get('/', async (request, response) => {
    const { business_id: businessId } = request.query;
    if (!isValidUuid(businessId)) {
      return response.status(400).json({ error: 'business_id query parameter must be a valid UUID.' });
    }
    if (!(await findBusiness(businessId, response))) return undefined;

    const { data, error } = await getTemplateService().listByBusinessId(businessId);
    if (error) return sendDatabaseError(response, error);
    return response.status(200).json({ data });
  });

  router.get('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'message template id must be a valid UUID.' });
    }
    const { data, error } = await getTemplateService().findById(request.params.id);
    if (error) return sendDatabaseError(response, error);
    if (!data) return response.status(404).json({ error: 'Message template not found.' });
    return response.status(200).json({ data });
  });

  router.post('/', async (request, response) => {
    const { errors, values } = validateTemplate(request.body ?? {}, { creating: true });
    if (errors.length) return response.status(400).json({ errors });
    if (!(await findBusiness(values.business_id, response))) return undefined;

    const { data, error } = await getTemplateService().create(values);
    if (error) return sendDatabaseError(response, error);
    return response.status(201).json({ data });
  });

  router.put('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'message template id must be a valid UUID.' });
    }
    const { errors, values } = validateTemplate(request.body ?? {});
    if (!Object.keys(values).length) errors.push('At least one editable field is required.');
    if (errors.length) return response.status(400).json({ errors });

    const { data, error } = await getTemplateService().update(request.params.id, values);
    if (error) return sendDatabaseError(response, error);
    if (!data) return response.status(404).json({ error: 'Message template not found.' });
    return response.status(200).json({ data });
  });

  router.delete('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'message template id must be a valid UUID.' });
    }
    const { data, error } = await getTemplateService().remove(request.params.id);
    if (error) return sendDatabaseError(response, error);
    if (!data) return response.status(404).json({ error: 'Message template not found.' });
    return response.status(204).send();
  });

  return router;
}
