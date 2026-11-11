
import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createCustomerService } from '../services/customers.js';
import { createPurchaseService } from '../services/purchases.js';
import { createReviewAutomationService } from '../services/reviewAutomations.js';
import { createMessageTemplateService } from '../services/messageTemplates.js';
import { createMessageService } from '../services/messages.js';
import { createActivityEventService } from '../services/activityEvents.js';
import { createBusinessPermissionMiddleware, getAuthorizedBusinessId, requireBusinessAccess } from '../middleware/auth.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EDITABLE_FIELDS = ['product_name', 'amount', 'purchase_date'];

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validatePurchase(payload, { creating = false } = {}) {
  const errors = [];
  const values = {};

  for (const field of EDITABLE_FIELDS) {
    if (payload[field] !== undefined) {
      if (field === 'amount') {
        if (
          typeof payload.amount !== 'number' ||
          !Number.isFinite(payload.amount) ||
          payload.amount < 0
        ) {
          errors.push('amount must be a non-negative number.');
        } else {
          values.amount = payload.amount;
        }
      } else if (field === 'purchase_date') {
        if (!isValidDate(payload.purchase_date)) {
          errors.push('purchase_date must be a valid YYYY-MM-DD date.');
        } else {
          values.purchase_date = payload.purchase_date;
        }
      } else if (
        typeof payload.product_name !== 'string' ||
        !payload.product_name.trim()
      ) {
        errors.push('product_name must be a non-empty string.');
      } else {
        values.product_name = payload.product_name.trim();
      }
    }
  }

  if (creating) {
    if (!isValidUuid(payload.business_id)) {
      errors.push('business_id must be a valid UUID.');
    } else {
      values.business_id = payload.business_id;
    }

    if (!isValidUuid(payload.customer_id)) {
      errors.push('customer_id must be a valid UUID.');
    } else {
      values.customer_id = payload.customer_id;
    }

    for (const field of EDITABLE_FIELDS) {
      if (
        values[field] === undefined &&
        !errors.some((error) => error.startsWith(field))
      ) {
        errors.push(`${field} is required.`);
      }
    }
  }

  return { errors, values };
}

function sendDatabaseError(response, error) {
  console.error(error);

  return response.status(500).json({
    error: 'Unable to process the purchase request.',
  });
}

function sendAuditError(response, error) {
  console.error('Unable to record purchase activity event:', error?.message ?? error);

  return response.status(500).json({
    error: 'Purchase operation succeeded, but its audit event could not be recorded.',
  });
}

function auditSnapshot(purchase, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(purchase, field))
      .map((field) => [field, purchase[field]])
  );
}

function changedFields(before, after, fields) {
  return fields.filter((field) => before[field] !== after[field]);
}

export function createPurchasesRouter({
  purchaseService,
  businessService,
  customerService,
  reviewAutomationService,
  messageTemplateService,
  messageService,
  activityEventService,
  businessAccessMiddleware,
  permissionService,
} = {}) {
  const router = Router();
  const accessMiddleware = businessAccessMiddleware ?? requireBusinessAccess;
  const requireViewPurchases = createBusinessPermissionMiddleware({ permissionService, permission: 'view_purchases', permissionError: 'You do not have permission to view purchases.', lookupError: 'Unable to verify purchase access.' });
  const requireManagePurchases = createBusinessPermissionMiddleware({ permissionService, permission: 'manage_purchases', permissionError: 'You do not have permission to manage purchases.', lookupError: 'Unable to verify purchase access.' });

  let resolvedPurchaseService = purchaseService;
  let resolvedBusinessService = businessService;
  let resolvedCustomerService = customerService;
  let resolvedReviewAutomationService = reviewAutomationService;
  let resolvedMessageTemplateService = messageTemplateService;
  let resolvedMessageService = messageService;
  let resolvedActivityEventService = activityEventService;

  function getPurchaseService() {
    if (!resolvedPurchaseService) {
      resolvedPurchaseService = createPurchaseService();
    }

    return resolvedPurchaseService;
  }

  function getBusinessService() {
    if (!resolvedBusinessService) {
      resolvedBusinessService = createBusinessService();
    }

    return resolvedBusinessService;
  }

  function getCustomerService() {
    if (!resolvedCustomerService) {
      resolvedCustomerService = createCustomerService();
    }

    return resolvedCustomerService;
  }

  function getReviewAutomationService() {
    if (!resolvedReviewAutomationService) {
      resolvedReviewAutomationService = createReviewAutomationService();
    }

    return resolvedReviewAutomationService;
  }

  function getMessageTemplateService() {
    if (!resolvedMessageTemplateService) {
      resolvedMessageTemplateService = createMessageTemplateService();
    }

    return resolvedMessageTemplateService;
  }

  function getMessageService() {
    if (!resolvedMessageService) {
      resolvedMessageService = createMessageService();
    }

    return resolvedMessageService;
  }

  function getActivityEventService() {
    if (!resolvedActivityEventService) {
      resolvedActivityEventService = createActivityEventService();
    }

    return resolvedActivityEventService;
  }

  async function recordPurchaseEvent(request, purchase, eventType, fields) {
    try {
      const result = await getActivityEventService().create({
        scope_type: 'business',
        business_id: purchase.business_id,
        actor_user_id: request.user?.id ?? null,
        actor_type: 'user',
        event_type: eventType,
        entity_type: 'purchase',
        entity_id: purchase.id,
        customer_id: purchase.customer_id,
        is_reconstructed: false,
        visibility: 'customer_timeline',
        ...fields,
      });

      if (result?.error) {
        return result;
      }

      if (!result?.data) {
        return {
          data: null,
          error: new Error('Activity event persistence returned no record.'),
        };
      }

      return result;
    } catch (error) {
      return { data: null, error };
    }
  }

  async function validateBusinessAndCustomer(
    { businessId, customerId },
    response
  ) {
    const businessResult = await getBusinessService().findById(businessId);

    if (businessResult.error) {
      sendDatabaseError(response, businessResult.error);
      return false;
    }

    if (!businessResult.data) {
      response.status(404).json({ error: 'Business not found.' });
      return false;
    }

    if (!customerId) return true;

    const customerResult = await getCustomerService().findById(customerId);

    if (customerResult.error) {
      sendDatabaseError(response, customerResult.error);
      return false;
    }

    if (!customerResult.data) {
      response.status(404).json({ error: 'Customer not found.' });
      return false;
    }

    if (customerResult.data.business_id !== businessId) {
      response.status(400).json({
        error: 'customer_id does not belong to business_id.',
      });
      return false;
    }

    return true;
  }

  async function queueReviewRequest(purchase) {
    try {
      const automationResult =
        await getReviewAutomationService().findByBusinessId(
          purchase.business_id
        );

      if (automationResult.error) {
        console.error(
          'Unable to retrieve review automation:',
          automationResult.error
        );
        return;
      }

      const automation = automationResult.data;

      if (
        !automation ||
        !automation.enabled ||
        !automation.template_id
      ) {
        return;
      }

      const [customerResult, businessResult] = await Promise.all([
        getCustomerService().findById(purchase.customer_id),
        getBusinessService().findById(purchase.business_id),
      ]);

      if (customerResult.error || businessResult.error) {
        console.error(
          'Unable to retrieve review request details:',
          customerResult.error ?? businessResult.error
        );
        return;
      }

      const customer = customerResult.data;
      const business = businessResult.data;

      if (
        !customer ||
        !business ||
        customer.business_id !== purchase.business_id ||
        customer.consent_given !== true
      ) {
        return;
      }

      if (!business.google_review_link) {
        return;
      }

      const templateResult =
        await getMessageTemplateService().findById(automation.template_id);

      if (templateResult.error) {
        console.error(
          'Unable to retrieve review template:',
          templateResult.error
        );
        return;
      }

      const template = templateResult.data;

      if (
        !template ||
        template.business_id !== purchase.business_id ||
        template.category !== 'review' ||
        typeof template.message !== 'string'
      ) {
        return;
      }

      const variables = {
        customer_name: customer.name ?? '',
        business_name: business.name ?? '',
        review_link: business.google_review_link,
        product_name: purchase.product_name ?? '',
        purchase_date: purchase.purchase_date ?? '',
      };

      const messageText = template.message.replace(
        /{{\s*(customer_name|business_name|review_link|product_name|purchase_date)\s*}}/g,
        (_match, variable) => variables[variable]
      );

      const scheduledAt = new Date(
        Date.now() + automation.delay_minutes * 60 * 1000
      ).toISOString();

      const { error } = await getMessageService().create({
        business_id: purchase.business_id,
        customer_id: purchase.customer_id,
        campaign_id: null,
       purchase_id: purchase.id,
        template_id: template.id,
        message_text: messageText,
        status: 'queued',
        scheduled_at: scheduledAt,
      });

      if (error) {
        console.error('Unable to queue review request:', error);
      }
    } catch (error) {
      console.error('Unexpected review automation error:', error);
    }
  }

  router.get('/', accessMiddleware, requireViewPurchases, async (request, response) => {
    const {
      business_id: businessId,
      customer_id: customerId,
    } = request.query;

    if (!isValidUuid(businessId)) {
      return response.status(400).json({
        error: 'business_id query parameter must be a valid UUID.',
      });
    }

    if (customerId !== undefined && !isValidUuid(customerId)) {
      return response.status(400).json({
        error: 'customer_id query parameter must be a valid UUID.',
      });
    }

    if (
      !(await validateBusinessAndCustomer(
        { businessId, customerId },
        response
      ))
    ) {
      return undefined;
    }

    const { data, error } = await getPurchaseService().list({
      businessId,
      customerId,
    });

    if (error) return sendDatabaseError(response, error);

    return response.status(200).json({ data });
  });

  router.get('/:id', accessMiddleware, requireViewPurchases, async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({
        error: 'purchase id must be a valid UUID.',
      });
    }

    const businessScope = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
    if (request.profile && request.profile.role !== 'admin' && !businessScope) {
      return response.status(403).json({ error: 'An authorized business context is required.' });
    }
    const { data, error } = await getPurchaseService().findById(request.params.id, businessScope);

    if (error) return sendDatabaseError(response, error);

    if (!data) {
      return response.status(404).json({ error: 'Purchase not found.' });
    }

    return response.status(200).json({ data });
  });

 router.post('/', accessMiddleware, requireManagePurchases, async (request, response) => {
    const { errors, values } = validatePurchase(
      request.body ?? {},
      { creating: true }
    );

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    if (
      !(await validateBusinessAndCustomer(
        {
          businessId: values.business_id,
          customerId: values.customer_id,
        },
        response
      ))
    ) {
      return undefined;
    }

    const { data, error } = await getPurchaseService().create(values);

    if (error) return sendDatabaseError(response, error);

    const auditResult = await recordPurchaseEvent(
      request,
      data,
      'purchase.created',
      { after: auditSnapshot(data, EDITABLE_FIELDS) },
    );

    if (auditResult.error) {
      return sendAuditError(response, auditResult.error);
    }

    await queueReviewRequest(data);

    return response.status(201).json({ data });
  });

 router.put('/:id', accessMiddleware, requireManagePurchases, async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({
        error: 'purchase id must be a valid UUID.',
      });
    }

    const { errors, values } = validatePurchase(request.body ?? {});

    if (!Object.keys(values).length) {
      errors.push('At least one editable field is required.');
    }

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    const businessScope = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
    if (request.profile && request.profile.role !== 'admin' && !businessScope) {
      return response.status(403).json({ error: 'An authorized business context is required.' });
    }
    const {
      data: existingPurchase,
      error: existingPurchaseError,
    } = await getPurchaseService().findById(
      request.params.id,
      businessScope
    );

    if (existingPurchaseError) return sendDatabaseError(response, existingPurchaseError);

    if (!existingPurchase) {
      return response.status(404).json({ error: 'Purchase not found.' });
    }

    const before = auditSnapshot(existingPurchase, EDITABLE_FIELDS);

   const { data, error } = await getPurchaseService().update(
      request.params.id,
      values,
      businessScope
    );

    if (error) return sendDatabaseError(response, error);

    if (!data) {
      return response.status(404).json({ error: 'Purchase not found.' });
    }

    const after = auditSnapshot(data, EDITABLE_FIELDS);
    const changed = changedFields(before, after, EDITABLE_FIELDS);

    const auditResult = await recordPurchaseEvent(
      request,
      data,
      'purchase.updated',
      {
        before: auditSnapshot(before, changed),
        after: auditSnapshot(after, changed),
      },
    );

    if (auditResult.error) {
      return sendAuditError(response, auditResult.error);
    }

    return response.status(200).json({ data });
  });

 router.delete('/:id', accessMiddleware, requireManagePurchases, async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({
        error: 'purchase id must be a valid UUID.',
      });
    }

   const businessScope = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
   if (request.profile && request.profile.role !== 'admin' && !businessScope) {
     return response.status(403).json({ error: 'An authorized business context is required.' });
   }
    const {
      data: existingPurchase,
      error: existingPurchaseError,
    } = await getPurchaseService().findById(request.params.id, businessScope);

    if (existingPurchaseError) {
      return sendDatabaseError(response, existingPurchaseError);
    }

    if (!existingPurchase) {
      return response.status(404).json({ error: 'Purchase not found.' });
    }

    const { data: deletedPurchase, error } = await getPurchaseService().remove(
      request.params.id,
      businessScope
    );

    if (error) return sendDatabaseError(response, error);

    if (!deletedPurchase) {
      return response.status(404).json({ error: 'Purchase not found.' });
    }

    const auditResult = await recordPurchaseEvent(
      request,
      existingPurchase,
      'purchase.deleted',
      { before: auditSnapshot(existingPurchase, EDITABLE_FIELDS) },
    );

    if (auditResult.error) {
      return sendAuditError(response, auditResult.error);
    }

    return response.status(204).send();
  });

  return router;
}
