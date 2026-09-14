import { Router } from 'express';
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
} = {}) {
  const router = Router();

  let automations = reviewAutomationService;
  let businesses = businessService;
  let templates = messageTemplateService;

  const getAutomations = () =>
    (automations ??= createReviewAutomationService());

  const getBusinesses = () =>
    (businesses ??= createBusinessService());

  const getTemplates = () =>
    (templates ??= createMessageTemplateService());

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