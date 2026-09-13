import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createCampaignService } from '../services/campaigns.js';
import { createMessageTemplateService } from '../services/messageTemplates.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['draft', 'scheduled', 'running', 'completed', 'cancelled']);
const TRANSITIONS = {
  draft: new Set(['draft', 'scheduled', 'cancelled']),
  scheduled: new Set(['draft', 'scheduled', 'running', 'cancelled']),
  running: new Set(['running', 'completed', 'cancelled']),
  completed: new Set(['completed']),
  cancelled: new Set(['cancelled']),
};

const validId = (value) => typeof value === 'string' && UUID.test(value);
const validDateTime = (value) => typeof value === 'string' && !Number.isNaN(new Date(value).valueOf());
const databaseError = (response, error) => {
  console.error(error);
  return response.status(500).json({ error: 'Unable to process the campaign request.' });
};

function validateCampaign(payload, { creating = false } = {}) {
  const errors = [];
  const values = {};
  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) errors.push('name must be a non-empty string.');
    else values.name = payload.name.trim();
  }
  if (payload.template_id !== undefined) {
    if (!validId(payload.template_id)) errors.push('template_id must be a valid UUID.');
    else values.template_id = payload.template_id;
  }
  if (payload.status !== undefined) {
    if (typeof payload.status !== 'string' || !STATUSES.has(payload.status)) errors.push('status is invalid.');
    else values.status = payload.status;
  }
  if (payload.scheduled_at !== undefined) {
    if (!validDateTime(payload.scheduled_at)) errors.push('scheduled_at must be a valid ISO date-time.');
    else values.scheduled_at = new Date(payload.scheduled_at).toISOString();
  }
  if (creating) {
    if (!validId(payload.business_id)) errors.push('business_id must be a valid UUID.');
    else values.business_id = payload.business_id;
    for (const field of ['name', 'template_id']) if (values[field] === undefined && !errors.some((error) => error.startsWith(field))) errors.push(`${field} is required.`);
    if (values.status === undefined) values.status = 'draft';
  }
  return { errors, values };
}

export function createCampaignsRouter({ campaignService, businessService, messageTemplateService } = {}) {
  const router = Router();
  let campaigns = campaignService;
  let businesses = businessService;
  let templates = messageTemplateService;
  const getCampaigns = () => (campaigns ??= createCampaignService());
  const getBusinesses = () => (businesses ??= createBusinessService());
  const getTemplates = () => (templates ??= createMessageTemplateService());

  async function validateParents(businessId, templateId, response) {
    const business = await getBusinesses().findById(businessId);
    if (business.error) return databaseError(response, business.error), false;
    if (!business.data) return response.status(404).json({ error: 'Business not found.' }), false;
    if (!templateId) return true;
    const template = await getTemplates().findById(templateId);
    if (template.error) return databaseError(response, template.error), false;
    if (!template.data) return response.status(404).json({ error: 'Message template not found.' }), false;
    if (template.data.business_id !== businessId) return response.status(400).json({ error: 'template_id does not belong to business_id.' }), false;
    return true;
  }

  router.get('/', async (request, response) => {
    const businessId = request.query.business_id;
    if (!validId(businessId)) return response.status(400).json({ error: 'business_id query parameter must be a valid UUID.' });
    if (!(await validateParents(businessId, null, response))) return undefined;
    const { data, error } = await getCampaigns().listByBusinessId(businessId);
    return error ? databaseError(response, error) : response.status(200).json({ data });
  });
  router.get('/:id', async (request, response) => {
    if (!validId(request.params.id)) return response.status(400).json({ error: 'campaign id must be a valid UUID.' });
    const { data, error } = await getCampaigns().findById(request.params.id);
    if (error) return databaseError(response, error);
    return data ? response.status(200).json({ data }) : response.status(404).json({ error: 'Campaign not found.' });
  });
  router.post('/', async (request, response) => {
    const { errors, values } = validateCampaign(request.body ?? {}, { creating: true });
    if (values.status === 'scheduled' && !values.scheduled_at) errors.push('scheduled_at is required when status is scheduled.');
    if (errors.length) return response.status(400).json({ errors });
    if (!(await validateParents(values.business_id, values.template_id, response))) return undefined;
    const { data, error } = await getCampaigns().create(values);
    return error ? databaseError(response, error) : response.status(201).json({ data });
  });
  router.put('/:id', async (request, response) => {
    if (!validId(request.params.id)) return response.status(400).json({ error: 'campaign id must be a valid UUID.' });
    const existing = await getCampaigns().findById(request.params.id);
    if (existing.error) return databaseError(response, existing.error);
    if (!existing.data) return response.status(404).json({ error: 'Campaign not found.' });
    const { errors, values } = validateCampaign(request.body ?? {});
    if (!Object.keys(values).length) errors.push('At least one editable field is required.');
    if (values.status && !TRANSITIONS[existing.data.status]?.has(values.status)) errors.push(`Cannot transition campaign from ${existing.data.status} to ${values.status}.`);
    if ((values.status ?? existing.data.status) === 'scheduled' && !(values.scheduled_at ?? existing.data.scheduled_at)) errors.push('scheduled_at is required when status is scheduled.');
    if (errors.length) return response.status(400).json({ errors });
    if (values.template_id && !(await validateParents(existing.data.business_id, values.template_id, response))) return undefined;
    const { data, error } = await getCampaigns().update(request.params.id, values);
    return error ? databaseError(response, error) : response.status(200).json({ data });
  });
  router.delete('/:id', async (request, response) => {
    if (!validId(request.params.id)) return response.status(400).json({ error: 'campaign id must be a valid UUID.' });
    const { data, error } = await getCampaigns().remove(request.params.id);
    if (error) return databaseError(response, error);
    return data ? response.status(204).send() : response.status(404).json({ error: 'Campaign not found.' });
  });
  return router;
}
