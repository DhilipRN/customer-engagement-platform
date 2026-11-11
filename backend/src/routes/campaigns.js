import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createCampaignService } from '../services/campaigns.js';
import { createMessageTemplateService } from '../services/messageTemplates.js';
import { createActivityEventService } from '../services/activityEvents.js';
import {
  createBusinessPermissionMiddleware,
  getAuthorizedBusinessId,
  requireBusinessAccess,
} from '../middleware/auth.js';

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

const AUDITED_CAMPAIGN_FIELDS = [
  'name',
  'template_id',
  'status',
  'scheduled_at',
];

function auditSnapshot(campaign) {
  return Object.fromEntries(
    AUDITED_CAMPAIGN_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(campaign, field))
      .map((field) => [field, campaign[field]])
  );
}

function changedFields(before, after, fields) {
  return fields.filter((field) => before[field] !== after[field]);
}

function sendAuditError(response, error) {
  console.error('Unable to record campaign activity event:', error?.message ?? error);
  return response.status(500).json({
    error: 'Campaign operation succeeded, but its audit event could not be recorded.',
  });
}

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

export function createCampaignsRouter({ campaignService, businessService, messageTemplateService, activityEventService, businessAccessMiddleware, permissionService } = {}) {
  const router = Router();
  const accessMiddleware = businessAccessMiddleware ?? requireBusinessAccess;
  const requireViewCampaigns = createBusinessPermissionMiddleware({ permissionService, permission: 'view_campaigns', permissionError: 'You do not have permission to view campaigns.', lookupError: 'Unable to verify campaign access.' });
  const requireManageCampaigns = createBusinessPermissionMiddleware({ permissionService, permission: 'manage_campaigns', permissionError: 'You do not have permission to manage campaigns.', lookupError: 'Unable to verify campaign access.' });
  let campaigns = campaignService;
  let businesses = businessService;
  let templates = messageTemplateService;
  let activityEvents = activityEventService;
  const getCampaigns = () => (campaigns ??= createCampaignService());
  const getBusinesses = () => (businesses ??= createBusinessService());
  const getTemplates = () => (templates ??= createMessageTemplateService());
  const getActivityEvents = () => (activityEvents ??= createActivityEventService());

  async function recordCampaignEvent(request, campaign, eventType, fields = {}) {
    try {
      const result = await getActivityEvents().create({
        scope_type: 'business',
        business_id: campaign.business_id,
        actor_user_id: request.user?.id ?? null,
        actor_type: 'user',
        event_type: eventType,
        entity_type: 'campaign',
        entity_id: campaign.id,
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

  router.get('/', accessMiddleware, requireViewCampaigns, async (request, response) => {
    const businessId = request.query.business_id;
    if (!validId(businessId)) return response.status(400).json({ error: 'business_id query parameter must be a valid UUID.' });
    if (!(await validateParents(businessId, null, response))) return undefined;
    const { data, error } = await getCampaigns().listByBusinessId(businessId);
    return error ? databaseError(response, error) : response.status(200).json({ data });
  });
  router.get('/:id', accessMiddleware, requireViewCampaigns, async (request, response) => {
    if (!validId(request.params.id)) return response.status(400).json({ error: 'campaign id must be a valid UUID.' });
    const businessScope = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
    if (request.profile && request.profile.role !== 'admin' && !businessScope) {
      return response.status(403).json({ error: 'An authorized business context is required.' });
    }
    const { data, error } = await getCampaigns().findById(
      request.params.id,
      businessScope,
    );
    if (error) return databaseError(response, error);
    return data ? response.status(200).json({ data }) : response.status(404).json({ error: 'Campaign not found.' });
  });
  router.post('/', accessMiddleware, requireManageCampaigns, async (request, response) => {
    const { errors, values } = validateCampaign(request.body ?? {}, { creating: true });
    if (values.status === 'scheduled' && !values.scheduled_at) errors.push('scheduled_at is required when status is scheduled.');
    if (errors.length) return response.status(400).json({ errors });
    if (!(await validateParents(values.business_id, values.template_id, response))) return undefined;
    const { data, error } = await getCampaigns().create(values);
    if (error) return databaseError(response, error);

    const createdAudit = await recordCampaignEvent(
      request,
      data,
      'campaign.created',
      { after: auditSnapshot(data) },
    );
    if (createdAudit.error) return sendAuditError(response, createdAudit.error);

    if (data.status === 'scheduled') {
      const scheduledAudit = await recordCampaignEvent(
        request,
        data,
        'campaign.scheduled',
        { after: { status: data.status, scheduled_at: data.scheduled_at } },
      );
      if (scheduledAudit.error) return sendAuditError(response, scheduledAudit.error);
    }

    return response.status(201).json({ data });
  });
  router.put('/:id', accessMiddleware, requireManageCampaigns, async (request, response) => {
    if (!validId(request.params.id)) return response.status(400).json({ error: 'campaign id must be a valid UUID.' });
    const businessId = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
    if (request.profile && request.profile.role !== 'admin' && !businessId) {
      return response.status(403).json({ error: 'An authorized business context is required.' });
    }
    const existing = await getCampaigns().findById(request.params.id, businessId);
    if (existing.error) return databaseError(response, existing.error);
    if (!existing.data) return response.status(404).json({ error: 'Campaign not found.' });
    const { errors, values } = validateCampaign(request.body ?? {});
    if (!Object.keys(values).length) errors.push('At least one editable field is required.');
    if (values.status && !TRANSITIONS[existing.data.status]?.has(values.status)) errors.push(`Cannot transition campaign from ${existing.data.status} to ${values.status}.`);
    if ((values.status ?? existing.data.status) === 'scheduled' && !(values.scheduled_at ?? existing.data.scheduled_at)) errors.push('scheduled_at is required when status is scheduled.');
    if (errors.length) return response.status(400).json({ errors });
    if (values.template_id && !(await validateParents(existing.data.business_id, values.template_id, response))) return undefined;
    const before = auditSnapshot(existing.data);
    const { data, error } = await getCampaigns().update(request.params.id, values, businessId);
    if (!data && !error) return response.status(404).json({ error: 'Campaign not found.' });
    if (error) return databaseError(response, error);

    const after = auditSnapshot(data);
    const statusChanged = before.status !== after.status;
    const changedNonStatusFields = changedFields(
      before,
      after,
      AUDITED_CAMPAIGN_FIELDS.filter(
        (field) => field !== 'status' && !(statusChanged && field === 'scheduled_at')
      )
    );

    if (changedNonStatusFields.length) {
      const updatedAudit = await recordCampaignEvent(
        request,
        data,
        'campaign.updated',
        {
          before: Object.fromEntries(
            changedNonStatusFields.map((field) => [field, before[field]])
          ),
          after: Object.fromEntries(
            changedNonStatusFields.map((field) => [field, after[field]])
          ),
        },
      );
      if (updatedAudit.error) return sendAuditError(response, updatedAudit.error);
    }

    if (before.status !== after.status) {
      const statusEventTypes = {
        scheduled: 'campaign.scheduled',
        running: 'campaign.started',
        completed: 'campaign.completed',
        cancelled: 'campaign.cancelled',
      };
      const statusAudit = await recordCampaignEvent(
        request,
        data,
        statusEventTypes[after.status] ?? 'campaign.updated',
        {
          before: { status: before.status },
          after: {
            status: after.status,
            ...(after.status === 'scheduled'
              ? { scheduled_at: after.scheduled_at }
              : {}),
          },
        },
      );
      if (statusAudit.error) return sendAuditError(response, statusAudit.error);
    }

    return response.status(200).json({ data });
  });
  router.delete('/:id', accessMiddleware, requireManageCampaigns, async (request, response) => {
    if (!validId(request.params.id)) return response.status(400).json({ error: 'campaign id must be a valid UUID.' });
    const businessId = request.profile?.role === 'admin' ? null : getAuthorizedBusinessId(request);
    if (request.profile && request.profile.role !== 'admin' && !businessId) {
      return response.status(403).json({ error: 'An authorized business context is required.' });
    }
    const existing = await getCampaigns().findById(request.params.id, businessId);
    if (existing.error) return databaseError(response, existing.error);
    if (!existing.data) return response.status(404).json({ error: 'Campaign not found.' });
    const { data, error } = await getCampaigns().remove(
      request.params.id,
      businessId,
    );
    if (error) return databaseError(response, error);
    if (!data) return response.status(404).json({ error: 'Campaign not found.' });

    const deletedAudit = await recordCampaignEvent(
      request,
      existing.data,
      'campaign.deleted',
      { before: auditSnapshot(existing.data) },
    );
    if (deletedAudit.error) return sendAuditError(response, deletedAudit.error);

    return response.status(204).send();
  });
  return router;
}
