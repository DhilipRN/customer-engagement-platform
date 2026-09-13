import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';

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

export function createBusinessesRouter({ businessService } = {}) {
  const router = Router();
  let resolvedBusinessService = businessService;

  function getBusinessService() {
    if (!resolvedBusinessService) {
      resolvedBusinessService = createBusinessService();
    }

    return resolvedBusinessService;
  }

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

    const { data, error } = await getBusinessService().update(request.params.id, values);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Business not found.' });
    }

    return response.status(200).json({ data });
  });

  router.delete('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'business id must be a valid UUID.' });
    }

    const { data, error } = await getBusinessService().remove(request.params.id);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Business not found.' });
    }

    return response.status(204).send();
  });

  return router;
}
