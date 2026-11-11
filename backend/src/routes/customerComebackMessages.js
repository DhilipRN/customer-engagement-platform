import { Router } from 'express';
import { createBusinessPermissionMiddleware, getAuthorizedBusinessId, requireBusinessAccess } from '../middleware/auth.js';
import { createBusinessService } from '../services/businesses.js';
import { createCustomerService } from '../services/customers.js';
import { createPurchaseService } from '../services/purchases.js';
import { createAppointmentService } from '../services/Appointments.js';
import { createMessageTemplateService } from '../services/messageTemplates.js';
import { createMessageService } from '../services/messages.js';
import { createCustomerComebackExclusionService } from '../services/customerComebackExclusions.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INACTIVITY_PERIODS = new Set(['30', '60', '90']);
const SUPPORTED_VARIABLES = new Set([
  'customer_name',
  'business_name',
  'review_link',
  'product_name',
  'purchase_date',
]);
const VARIABLE_PATTERN = /{{\s*([^{}\s]+)\s*}}/g;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function normalizeActivityDate(value) {
  if (typeof value !== 'string') return null;

  const trimmedValue = value.trim();
  const datePart = trimmedValue.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);

  if (
    Number.isNaN(calendarDate.valueOf()) ||
    calendarDate.toISOString().slice(0, 10) !== datePart
  ) {
    return null;
  }

  if (trimmedValue === datePart) return datePart;

  if (
    !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(
      trimmedValue
    )
  ) {
    return null;
  }

  const timestampValue = trimmedValue
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  const timestamp = new Date(timestampValue);

  return Number.isNaN(timestamp.valueOf())
    ? null
    : timestamp.toISOString().slice(0, 10);
}

function sendDatabaseError(response, error) {
  console.error(error);
  return response.status(500).json({
    error: 'Unable to queue the Customer Comeback message.',
  });
}

function resolveBusinessId(request, response) {
  if (request.profile?.role === 'admin') {
    const businessId = request.body?.business_id;

    if (!isValidUuid(businessId)) {
      response.status(400).json({ error: 'business_id must be a valid UUID.' });
      return null;
    }

    return businessId;
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

function renderTemplate(message, values) {
  const variables = [...message.matchAll(VARIABLE_PATTERN)].map(
    (match) => match[1]
  );

  const unsupported = variables.filter(
    (variable) => !SUPPORTED_VARIABLES.has(variable)
  );

  if (unsupported.length) {
    return {
      error: `Template contains unsupported variables: ${unsupported.join(', ')}.`,
    };
  }

  if (message.replace(VARIABLE_PATTERN, '').includes('{{') ||
      message.replace(VARIABLE_PATTERN, '').includes('}}')) {
    return { error: 'Template contains malformed variables.' };
  }

  const unavailable = variables.filter(
    (variable) => typeof values[variable] !== 'string' || !values[variable].trim()
  );

  if (unavailable.length) {
    return {
      error: `Template variables are unavailable: ${[...new Set(unavailable)].join(', ')}.`,
    };
  }

  return {
    message: message.replace(VARIABLE_PATTERN, (_match, variable) => values[variable]),
  };
}

function isDuplicateError(error) {
  return error?.code === '23505' || error?.status === 409;
}

export function createCustomerComebackMessagesRouter({
  businessService,
  customerService,
  purchaseService,
  appointmentService,
  messageTemplateService,
  exclusionService,
  messageService,
  businessAccessMiddleware,
  permissionService,
} = {}) {
  const router = Router();
  let resolvedBusinessService = businessService;
  let resolvedCustomerService = customerService;
  let resolvedPurchaseService = purchaseService;
  let resolvedAppointmentService = appointmentService;
  let resolvedMessageTemplateService = messageTemplateService;
  let resolvedExclusionService = exclusionService;
  let resolvedMessageService = messageService;
  const accessMiddleware = businessAccessMiddleware ?? requireBusinessAccess;
  const requireManageAutomations = createBusinessPermissionMiddleware({ permissionService, permission: 'manage_automations', permissionError: 'You do not have permission to manage automations.', lookupError: 'Unable to verify automation access.' });

  const get = (current, factory) => current ?? factory();

  router.post('/', accessMiddleware, requireManageAutomations, async (request, response) => {
    const businessId = resolveBusinessId(request, response);
    if (!businessId) return undefined;

    const {
      customer_id: customerId,
      template_id: templateId,
      days,
    } = request.body ?? {};

    if (!isValidUuid(customerId)) {
      return response.status(400).json({ error: 'customer_id must be a valid UUID.' });
    }

    if (!isValidUuid(templateId)) {
      return response.status(400).json({ error: 'template_id must be a valid UUID.' });
    }

    if (!INACTIVITY_PERIODS.has(String(days))) {
      return response.status(400).json({
        error: 'days must be one of: 30, 60, or 90.',
      });
    }

    resolvedBusinessService = get(resolvedBusinessService, createBusinessService);
    resolvedCustomerService = get(resolvedCustomerService, createCustomerService);
    resolvedPurchaseService = get(resolvedPurchaseService, createPurchaseService);
    resolvedAppointmentService = get(resolvedAppointmentService, createAppointmentService);
    resolvedMessageTemplateService = get(
      resolvedMessageTemplateService,
      createMessageTemplateService
    );
    resolvedExclusionService = get(
      resolvedExclusionService,
      createCustomerComebackExclusionService
    );
    resolvedMessageService = get(resolvedMessageService, createMessageService);

    const businessResult = await resolvedBusinessService.findById(businessId);
    if (businessResult.error) return sendDatabaseError(response, businessResult.error);
    if (!businessResult.data) {
      return response.status(404).json({ error: 'Business not found.' });
    }

    const customerResult = await resolvedCustomerService.findById(customerId, businessId);
    if (customerResult.error) return sendDatabaseError(response, customerResult.error);
    if (!customerResult.data) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    const customer = customerResult.data;
    if (customer.business_id !== businessId) {
      return response.status(400).json({
        error: 'customer_id does not belong to business_id.',
      });
    }

    if (customer.consent_given !== true) {
      return response.status(403).json({
        error: 'Customer has not provided consent to receive messages.',
      });
    }

    const exclusionResult = await resolvedExclusionService.listByBusinessId(businessId);
    if (exclusionResult.error) return sendDatabaseError(response, exclusionResult.error);
    if ((exclusionResult.data ?? []).some(
      (exclusion) => exclusion.business_id === businessId && exclusion.customer_id === customerId
    )) {
      return response.status(403).json({
        error: 'Customer is excluded from Customer Comeback messages.',
      });
    }

    const [purchaseResult, appointmentResult, templateResult] = await Promise.all([
      resolvedPurchaseService.list({ businessId, customerId }),
      resolvedAppointmentService.listCompletedByBusinessId(businessId),
      resolvedMessageTemplateService.findById(templateId, businessId),
    ]);

    if (purchaseResult.error) return sendDatabaseError(response, purchaseResult.error);
    if (appointmentResult.error) return sendDatabaseError(response, appointmentResult.error);
    if (templateResult.error) return sendDatabaseError(response, templateResult.error);
    if (!templateResult.data) {
      return response.status(404).json({ error: 'Message template not found.' });
    }
    if (templateResult.data.business_id !== businessId) {
      return response.status(400).json({
        error: 'template_id does not belong to business_id.',
      });
    }
    if (typeof templateResult.data.message !== 'string' || !templateResult.data.message.trim()) {
      return response.status(400).json({ error: 'Message template has no message content.' });
    }

    const purchases = (purchaseResult.data ?? [])
      .filter((purchase) =>
        purchase.business_id === businessId && purchase.customer_id === customerId
      )
      .map((purchase) => ({
        ...purchase,
        normalizedDate: normalizeActivityDate(purchase.purchase_date),
      }))
      .filter((purchase) => purchase.normalizedDate)
      .sort((left, right) => right.normalizedDate.localeCompare(left.normalizedDate));

    const latestPurchase = purchases[0] ?? null;
    const completedAppointments = (appointmentResult.data ?? [])
      .filter((appointment) =>
        appointment.status === 'completed' &&
        (appointment.business_id === undefined || appointment.business_id === businessId) &&
        appointment.customer_id === customerId
      )
      .map((appointment) => normalizeActivityDate(appointment.appointment_date))
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left));

    const latestCompletedAppointmentDate = completedAppointments[0] ?? null;
    const lastActivityDate = [
      latestPurchase?.normalizedDate ?? null,
      latestCompletedAppointmentDate,
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setUTCDate(cutoff.getUTCDate() - Number(days));
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    if (!lastActivityDate || lastActivityDate >= cutoffDate) {
      return response.status(400).json({
        error: 'Customer is not currently eligible for the selected inactivity period.',
      });
    }

    const values = {
      customer_name: customer.name,
      business_name: businessResult.data.name,
      review_link: businessResult.data.google_review_link,
      product_name: latestPurchase?.product_name,
      purchase_date: latestPurchase?.normalizedDate,
    };
    const rendered = renderTemplate(templateResult.data.message, values);

    if (rendered.error) return response.status(400).json({ error: rendered.error });

    const idempotencyKey = [
      'customer_comeback',
      businessId,
      customerId,
      templateId,
      String(days),
    ].join(':');

    const messageResult = await resolvedMessageService.create({
      business_id: businessId,
      customer_id: customerId,
      campaign_id: null,
      template_id: templateId,
      message_text: rendered.message,
      status: 'queued',
      scheduled_at: new Date().toISOString(),
      source: 'customer_comeback',
      idempotency_key: idempotencyKey,
      metadata: { inactivity_days: Number(days) },
    });

    if (messageResult.error) {
      if (isDuplicateError(messageResult.error)) {
        return response.status(409).json({
          error: 'A Customer Comeback message is already queued for this customer and template.',
        });
      }

      return sendDatabaseError(response, messageResult.error);
    }

    return response.status(201).json({ data: messageResult.data });
  });

  return router;
}
