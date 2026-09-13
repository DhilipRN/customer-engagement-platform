import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createCustomerService } from '../services/customers.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE_FIELDS = ['name', 'phone', 'email', 'consent_given'];

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function validateCustomer(payload, { creating = false } = {}) {
  const errors = [];
  const values = {};

  for (const field of EDITABLE_FIELDS) {
    if (payload[field] !== undefined) {
      if (field === 'consent_given') {
        if (typeof payload[field] !== 'boolean') {
          errors.push('consent_given must be a boolean.');
        } else {
          values[field] = payload[field];
        }
      } else if (typeof payload[field] !== 'string') {
        errors.push(`${field} must be a string.`);
      } else {
        values[field] = payload[field].trim();
      }
    }
  }

  if (creating) {
    if (!isValidUuid(payload.business_id)) {
      errors.push('business_id must be a valid UUID.');
    } else {
      values.business_id = payload.business_id;
    }

    if (!values.name) {
      errors.push('name is required.');
    }

    if (!values.phone) {
      errors.push('phone is required.');
    }

    if (values.consent_given === undefined) {
      errors.push('consent_given must be explicitly provided.');
    }
  }

  if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) {
    errors.push('email must be valid.');
  }

  return { errors, values };
}

function sendDatabaseError(response, error) {
  console.error(error);
  return response.status(500).json({ error: 'Unable to process the customer request.' });
}

export function createCustomersRouter({ customerService, businessService } = {}) {
  const router = Router();
  let resolvedCustomerService = customerService;
  let resolvedBusinessService = businessService;

  function getCustomerService() {
    if (!resolvedCustomerService) {
      resolvedCustomerService = createCustomerService();
    }

    return resolvedCustomerService;
  }

  function getBusinessService() {
    if (!resolvedBusinessService) {
      resolvedBusinessService = createBusinessService();
    }

    return resolvedBusinessService;
  }

  async function findBusiness(businessId, response) {
    const { data, error } = await getBusinessService().findById(businessId);

    if (error) {
      sendDatabaseError(response, error);
      return null;
    }

    if (!data) {
      response.status(404).json({ error: 'Business not found.' });
      return null;
    }

    return data;
  }

  router.get('/', async (request, response) => {
    const { business_id: businessId } = request.query;

    if (!isValidUuid(businessId)) {
      return response.status(400).json({ error: 'business_id query parameter must be a valid UUID.' });
    }

    if (!(await findBusiness(businessId, response))) {
      return undefined;
    }

    const { data, error } = await getCustomerService().listByBusinessId(businessId);

    if (error) {
      return sendDatabaseError(response, error);
    }

    return response.status(200).json({ data });
  });

  router.get('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'customer id must be a valid UUID.' });
    }

    const { data, error } = await getCustomerService().findById(request.params.id);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    return response.status(200).json({ data });
  });

  router.post('/', async (request, response) => {
    const { errors, values } = validateCustomer(request.body ?? {}, { creating: true });

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    if (!(await findBusiness(values.business_id, response))) {
      return undefined;
    }

    const { data, error } = await getCustomerService().create(values);

    if (error) {
      return sendDatabaseError(response, error);
    }

    return response.status(201).json({ data });
  });

  router.put('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'customer id must be a valid UUID.' });
    }

    const { errors, values } = validateCustomer(request.body ?? {});

    if (!Object.keys(values).length) {
      errors.push('At least one editable field is required.');
    }

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    const { data, error } = await getCustomerService().update(request.params.id, values);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    return response.status(200).json({ data });
  });

  router.delete('/:id', async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'customer id must be a valid UUID.' });
    }

    const { data, error } = await getCustomerService().remove(request.params.id);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    return response.status(204).send();
  });

  return router;
}
