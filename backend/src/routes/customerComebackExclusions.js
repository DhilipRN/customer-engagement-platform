import { Router } from 'express';
import { createBusinessPermissionMiddleware, getAuthorizedBusinessId, requireBusinessAccess } from '../middleware/auth.js';
import { createCustomerService } from '../services/customers.js';
import { createCustomerComebackExclusionService } from '../services/customerComebackExclusions.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function sendDatabaseError(response, error) {
  console.error(error);
  return response.status(500).json({
    error: 'Unable to process the Customer Comeback exclusion request.',
  });
}

function isDuplicateError(error) {
  return error?.code === '23505' || error?.status === 409;
}

function getSubmittedBusinessId(request) {
  return request.method === 'GET' || request.method === 'DELETE'
    ? request.query.business_id
    : request.body?.business_id;
}

function resolveBusinessId(request, response) {
  const submittedBusinessId = getSubmittedBusinessId(request);

  if (request.profile?.role === 'admin') {
    if (!isValidUuid(submittedBusinessId)) {
      response.status(400).json({
        error: 'business_id must be a valid UUID.',
      });
      return null;
    }

    return submittedBusinessId;
  }

  const businessId = getAuthorizedBusinessId(request);
  if (!businessId) {
    response.status(403).json({
      error: 'An authorized business context is required.',
    });
    return null;
  }

  return businessId;
}

export function createCustomerComebackExclusionsRouter({
  customerService,
  exclusionService,
  businessAccessMiddleware,
  permissionService,
} = {}) {
  const router = Router();
  const accessMiddleware = businessAccessMiddleware ?? requireBusinessAccess;
  const requireViewAutomations = createBusinessPermissionMiddleware({ permissionService, permission: 'view_automations', permissionError: 'You do not have permission to view automations.', lookupError: 'Unable to verify automation access.' });
  const requireManageAutomations = createBusinessPermissionMiddleware({ permissionService, permission: 'manage_automations', permissionError: 'You do not have permission to manage automations.', lookupError: 'Unable to verify automation access.' });
  let resolvedCustomerService = customerService;
  let resolvedExclusionService = exclusionService;

  function getCustomerService() {
    resolvedCustomerService ??= createCustomerService();
    return resolvedCustomerService;
  }

  function getExclusionService() {
    resolvedExclusionService ??= createCustomerComebackExclusionService();
    return resolvedExclusionService;
  }

  router.get('/', accessMiddleware, requireViewAutomations, async (request, response) => {
    const businessId = resolveBusinessId(request, response);

    if (!businessId) return undefined;

    const { data, error } = await getExclusionService().listByBusinessId(businessId);

    if (error) return sendDatabaseError(response, error);

    return response.status(200).json({ data });
  });

  router.post('/', accessMiddleware, requireManageAutomations, async (request, response) => {
    const businessId = resolveBusinessId(request, response);

    if (!businessId) return undefined;

    const { customer_id: customerId } = request.body ?? {};

    if (!isValidUuid(customerId)) {
      return response.status(400).json({
        error: 'customer_id must be a valid UUID.',
      });
    }

    const customerResult = await getCustomerService().findById(customerId, businessId);

    if (customerResult.error) return sendDatabaseError(response, customerResult.error);

    if (!customerResult.data) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    const { data, error } = await getExclusionService().create(
      businessId,
      customerId,
      request.user?.id ?? null,
    );

    if (error) {
      if (isDuplicateError(error)) {
        return response.status(409).json({
          error: 'Customer is already excluded for this business.',
        });
      }

      return sendDatabaseError(response, error);
    }

    return response.status(201).json({ data });
  });

  router.delete('/:customerId', accessMiddleware, requireManageAutomations, async (request, response) => {
    const businessId = resolveBusinessId(request, response);

    if (!businessId) return undefined;

    if (!isValidUuid(request.params.customerId)) {
      return response.status(400).json({
        error: 'customer_id must be a valid UUID.',
      });
    }

    const { data, error } = await getExclusionService().remove(
      businessId,
      request.params.customerId,
    );

    if (error) return sendDatabaseError(response, error);

    if (!data) {
      return response.status(404).json({ error: 'Customer exclusion not found.' });
    }

    return response.status(204).send();
  });

  return router;
}
