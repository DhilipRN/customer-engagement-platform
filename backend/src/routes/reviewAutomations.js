import { Router } from 'express';
import { createCustomerService } from '../services/customers.js';
import { createPurchaseService } from '../services/purchases.js';
import { createMessageService } from '../services/messages.js';
import { createBusinessService } from '../services/businesses.js';
import { createMessageTemplateService } from '../services/messageTemplates.js';
import { createReviewAutomationService } from '../services/reviewAutomations.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validId = (value) =>
  typeof value === 'string' && UUID.test(value);

const databaseError = (response, error) => {
  console.error(error);
  return response.status(500).json({
    error: 'Unable to process the review automation request.',
  });
};

export function createReviewAutomationsRouter({
  reviewAutomationService,
  businessService,
  messageTemplateService,
  customerService,
  purchaseService,
  messageService,
} = {}) {
  const router = Router();

let automations = reviewAutomationService;
let businesses = businessService;
let templates = messageTemplateService;
let customers = customerService;
let purchases = purchaseService;
let messages = messageService;

  const getAutomations = () =>
    (automations ??= createReviewAutomationService());

  const getBusinesses = () =>
    (businesses ??= createBusinessService());

  const getTemplates = () =>
    (templates ??= createMessageTemplateService());

    const getCustomers = () =>
    (customers ??= createCustomerService());

  const getPurchases = () =>
    (purchases ??= createPurchaseService());

  const getMessages = () =>
    (messages ??= createMessageService());

  async function validateParents(businessId, templateId, response) {
    const business = await getBusinesses().findById(businessId);

    if (business.error) {
      databaseError(response, business.error);
      return false;
    }

    if (!business.data) {
      response.status(404).json({
        error: 'Business not found.',
      });
      return false;
    }

    if (!templateId) {
      return true;
    }

    const template = await getTemplates().findById(templateId);

    if (template.error) {
      databaseError(response, template.error);
      return false;
    }

    if (!template.data) {
      response.status(404).json({
        error: 'Message template not found.',
      });
      return false;
    }

    if (template.data.business_id !== businessId) {
      response.status(400).json({
        error: 'template_id does not belong to business_id.',
      });
      return false;
    }

    return true;
  }

  router.get('/', async (request, response) => {
    const businessId = request.query.business_id;

    if (!validId(businessId)) {
      return response.status(400).json({
        error: 'business_id query parameter must be a valid UUID.',
      });
    }

    if (!(await validateParents(businessId, null, response))) {
      return undefined;
    }

    const { data, error } =
      await getAutomations().findByBusinessId(businessId);

    return error
      ? databaseError(response, error)
      : response.status(200).json({ data });
  });

    // List customers, purchases, and review-request history
  // for the selected business.
  router.get('/selected-customers', async (request, response) => {
    const businessId = request.query.business_id;

    if (!validId(businessId)) {
      return response.status(400).json({
        error: 'business_id query parameter must be a valid UUID.',
      });
    }

    if (!(await validateParents(businessId, null, response))) {
      return undefined;
    }

    const [customerResult, purchaseResult, messageResult] =
      await Promise.all([
        getCustomers().listByBusinessId(businessId),
        getPurchases().list({ businessId }),
        getMessages().list({ businessId }),
      ]);

    if (
      customerResult.error ||
      purchaseResult.error ||
      messageResult.error
    ) {
      return databaseError(
        response,
        customerResult.error ||
          purchaseResult.error ||
          messageResult.error
      );
    }

    const customers = customerResult.data ?? [];
    const purchases = purchaseResult.data ?? [];
    const messages = messageResult.data ?? [];

    const purchasesByCustomer = new Map();

    for (const purchase of purchases) {
      const customerPurchases =
        purchasesByCustomer.get(purchase.customer_id) ?? [];

      customerPurchases.push(purchase);
      purchasesByCustomer.set(
        purchase.customer_id,
        customerPurchases
      );
    }

    const reviewMessagesByPurchase = new Map();

    for (const message of messages) {
      if (!message.purchase_id) continue;

      reviewMessagesByPurchase.set(
        message.purchase_id,
        message
      );
    }

    const data = customers.map((customer) => {
      const customerPurchases =
        purchasesByCustomer.get(customer.id) ?? [];

      return {
        ...customer,
        purchase_count: customerPurchases.length,
        purchases: customerPurchases.map((purchase) => ({
          ...purchase,
          review_request:
            reviewMessagesByPurchase.get(purchase.id) ?? null,
        })),
      };
    });

    return response.status(200).json({ data });
  });

    // Schedule review requests for selected customers.
  router.post('/selected-requests', async (request, response) => {
    const {
      business_id: businessId,
      customer_ids: customerIds,
      template_id: templateId,
      delay_minutes: delayMinutes = 120,
    } = request.body ?? {};

    if (!validId(businessId)) {
      return response.status(400).json({
        error: 'business_id must be a valid UUID.',
      });
    }

    if (
      !Array.isArray(customerIds) ||
      customerIds.length === 0 ||
      !customerIds.every(validId)
    ) {
      return response.status(400).json({
        error: 'customer_ids must be a non-empty array of valid UUIDs.',
      });
    }

    if (!validId(templateId)) {
      return response.status(400).json({
        error: 'template_id must be a valid UUID.',
      });
    }

    if (
      !Number.isInteger(delayMinutes) ||
      delayMinutes < 0
    ) {
      return response.status(400).json({
        error: 'delay_minutes must be a non-negative integer.',
      });
    }

    const businessResult =
      await getBusinesses().findById(businessId);

    if (businessResult.error) {
      return databaseError(response, businessResult.error);
    }

    const business = businessResult.data;

    if (!business) {
      return response.status(404).json({
        error: 'Business not found.',
      });
    }

    if (!business.google_review_link) {
      return response.status(400).json({
        error: 'This business does not have a Google review link.',
      });
    }

    const templateResult =
      await getTemplates().findById(templateId);

    if (templateResult.error) {
      return databaseError(response, templateResult.error);
    }

    const template = templateResult.data;

    if (
      !template ||
      template.business_id !== businessId ||
      template.category !== 'review' ||
      typeof template.message !== 'string'
    ) {
      return response.status(400).json({
        error: 'Select a valid review template for this business.',
      });
    }

    const [
      customerResult,
      purchaseResult,
      messageResult,
    ] = await Promise.all([
      getCustomers().listByBusinessId(businessId),
      getPurchases().list({ businessId }),
      getMessages().list({ businessId }),
    ]);

    if (
      customerResult.error ||
      purchaseResult.error ||
      messageResult.error
    ) {
      return databaseError(
        response,
        customerResult.error ||
          purchaseResult.error ||
          messageResult.error
      );
    }

    const selectedIds = [...new Set(customerIds)];
    const customerList = customerResult.data ?? [];
    const purchasesList = purchaseResult.data ?? [];
    const messageList = messageResult.data ?? [];

    const customerMap = new Map(
      customerList.map((customer) => [customer.id, customer])
    );

    if (selectedIds.some((id) => !customerMap.has(id))) {
      return response.status(400).json({
        error: 'One or more selected customers do not belong to this business.',
      });
    }

    const purchasesByCustomer = new Map();

    for (const purchase of purchasesList) {
      const customerPurchases =
        purchasesByCustomer.get(purchase.customer_id) ?? [];

      customerPurchases.push(purchase);
      purchasesByCustomer.set(
        purchase.customer_id,
        customerPurchases
      );
    }

    const requestedPurchaseIds = new Set(
      messageList
        .filter((message) => message.purchase_id)
        .map((message) => message.purchase_id)
    );

    const scheduledAt = new Date(
      Date.now() + delayMinutes * 60_000
    ).toISOString();

    const results = [];

    for (const customerId of selectedIds) {
      const customer = customerMap.get(customerId);

      if (!customer.consent_given) {
        results.push({
          customerId,
          status: 'skipped_no_consent',
        });
        continue;
      }

      const customerPurchases =
        purchasesByCustomer.get(customerId) ?? [];

      customerPurchases.sort((a, b) =>
        String(b.purchase_date).localeCompare(
          String(a.purchase_date)
        )
      );

      const purchase = customerPurchases[0];

      if (!purchase) {
        results.push({
          customerId,
          status: 'skipped_no_purchase',
        });
        continue;
      }

      if (requestedPurchaseIds.has(purchase.id)) {
        results.push({
          customerId,
          purchaseId: purchase.id,
          status: 'already_requested',
        });
        continue;
      }

      const variables = {
        customer_name: customer.name ?? '',
        business_name: business.name ?? '',
        review_link: business.google_review_link,
        product_name: purchase.product_name ?? '',
        purchase_date: purchase.purchase_date ?? '',
      };

      const messageText = template.message.replace(
        /\{\{\s*(customer_name|business_name|review_link|product_name|purchase_date)\s*\}\}/g,
        (_match, variable) => variables[variable]
      );

      const messageResult = await getMessages().create({
        business_id: businessId,
        customer_id: customerId,
        campaign_id: null,
        purchase_id: purchase.id,
        template_id: template.id,
        message_text: messageText,
        status: 'queued',
        scheduled_at: scheduledAt,
      });

      if (messageResult.error) {
        if (messageResult.error.code === '23505') {
          results.push({
            customerId,
            purchaseId: purchase.id,
            status: 'already_requested',
          });
          continue;
        }

        console.error(
          'Unable to queue selected review request:',
          messageResult.error
        );

        results.push({
          customerId,
          purchaseId: purchase.id,
          status: 'error',
        });
        continue;
      }

      // Prevent another selected customer entry from queueing
      // the same purchase during this request.
      requestedPurchaseIds.add(purchase.id);

      results.push({
        customerId,
        purchaseId: purchase.id,
        messageId: messageResult.data.id,
        status: 'queued',
      });
    }

    return response.status(201).json({ data: results });
  });

  router.get('/:id', async (request, response) => {
    if (!validId(request.params.id)) {
      return response.status(400).json({
        error: 'review automation id must be a valid UUID.',
      });
    }

    const { data, error } =
      await getAutomations().findById(request.params.id);

    if (error) {
      return databaseError(response, error);
    }

    return data
      ? response.status(200).json({ data })
      : response.status(404).json({
          error: 'Review automation not found.',
        });
  });

  router.post('/', async (request, response) => {
    const {
      business_id,
      enabled,
      delay_minutes,
      template_id,
    } = request.body ?? {};

    const errors = [];

    if (!validId(business_id)) {
      errors.push('business_id must be a valid UUID.');
    }

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      errors.push('enabled must be a boolean.');
    }

    if (
      delay_minutes !== undefined &&
      (!Number.isInteger(delay_minutes) || delay_minutes < 0)
    ) {
      errors.push('delay_minutes must be a non-negative integer.');
    }

    if (template_id !== undefined && !validId(template_id)) {
      errors.push('template_id must be a valid UUID.');
    }

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    if (
      !(await validateParents(
        business_id,
        template_id,
        response
      ))
    ) {
      return undefined;
    }

    const values = {
      business_id,
      enabled: enabled ?? true,
      delay_minutes: delay_minutes ?? 120,
      template_id: template_id ?? null,
    };

    const { data, error } =
      await getAutomations().create(values);

    return error
      ? databaseError(response, error)
      : response.status(201).json({ data });
  });

  router.put('/:id', async (request, response) => {
    if (!validId(request.params.id)) {
      return response.status(400).json({
        error: 'review automation id must be a valid UUID.',
      });
    }

    const existing =
      await getAutomations().findById(request.params.id);

    if (existing.error) {
      return databaseError(response, existing.error);
    }

    if (!existing.data) {
      return response.status(404).json({
        error: 'Review automation not found.',
      });
    }

    const {
      enabled,
      delay_minutes,
      template_id,
    } = request.body ?? {};

    const errors = [];
    const values = {};

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        errors.push('enabled must be a boolean.');
      } else {
        values.enabled = enabled;
      }
    }

    if (delay_minutes !== undefined) {
      if (
        !Number.isInteger(delay_minutes) ||
        delay_minutes < 0
      ) {
        errors.push(
          'delay_minutes must be a non-negative integer.'
        );
      } else {
        values.delay_minutes = delay_minutes;
      }
    }

    if (template_id !== undefined) {
      if (!validId(template_id)) {
        errors.push('template_id must be a valid UUID.');
      } else {
        values.template_id = template_id;
      }
    }

    if (!Object.keys(values).length && !errors.length) {
      errors.push('At least one editable field is required.');
    }

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    if (
      values.template_id &&
      !(await validateParents(
        existing.data.business_id,
        values.template_id,
        response
      ))
    ) {
      return undefined;
    }

    const { data, error } =
      await getAutomations().update(
        request.params.id,
        values
      );

    return error
      ? databaseError(response, error)
      : response.status(200).json({ data });
  });

  router.delete('/:id', async (request, response) => {
    if (!validId(request.params.id)) {
      return response.status(400).json({
        error: 'review automation id must be a valid UUID.',
      });
    }

    const { data, error } =
      await getAutomations().remove(request.params.id);

    if (error) {
      return databaseError(response, error);
    }

    return data
      ? response.status(204).send()
      : response.status(404).json({
          error: 'Review automation not found.',
        });
  });

  return router;
}