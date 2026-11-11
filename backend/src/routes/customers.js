import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createCustomerService } from '../services/customers.js';
import { createPurchaseService } from '../services/purchases.js';
import { createAppointmentService } from '../services/Appointments.js';
import { createActivityEventService } from '../services/activityEvents.js';
import { createMessageService } from '../services/messages.js';
import {
  getAuthorizedBusinessId,
  requireBusinessAccess,
} from '../middleware/auth.js';
import { createPermissionService } from '../middleware/permissions.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE_FIELDS = ['name', 'phone', 'email', 'consent_given'];
const AUDITED_CUSTOMER_FIELDS = ['name', 'phone', 'email'];
const INACTIVITY_PERIODS = new Set(['30', '60', '90']);
const TIMELINE_DEFAULT_LIMIT = 25;
const TIMELINE_MAX_LIMIT = 50;
const TIMELINE_MAX_PAGE = 100;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function parseTimelinePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined
    ? TIMELINE_DEFAULT_LIMIT
    : Number(query.limit);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > TIMELINE_MAX_PAGE ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > TIMELINE_MAX_LIMIT
  ) {
    return null;
  }

  return { page, limit, offset: (page - 1) * limit };
}

function timelineTimestamp(item) {
  if (!item.record) {
    return item.timestamp ?? null;
  }

  return item.type === 'message'
    ? item.record.created_at ?? item.record.sent_at ?? item.record.scheduled_at
    : item.record.occurred_at ?? item.record.recorded_at;
}

function formatEventLabel(eventType) {
  return String(eventType ?? 'Activity')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toTimelineItem(type, record) {
  const timestamp = timelineTimestamp({ type, record });

  if (type === 'message') {
    return {
      type,
      id: record.id,
      label: 'Message',
      timestamp,
      is_reconstructed: false,
      message: {
        message_text: record.message_text,
        status: record.status,
        source: record.source ?? null,
        template_id: record.template_id ?? null,
        campaign_id: record.campaign_id ?? null,
        appointment_id: record.appointment_id ?? null,
        purchase_id: record.purchase_id ?? null,
        scheduled_at: record.scheduled_at ?? null,
        sent_at: record.sent_at ?? null,
      },
    };
  }

  return {
    type,
    id: record.id,
    label: formatEventLabel(record.event_type),
    timestamp,
    is_reconstructed: record.is_reconstructed === true,
    activity: {
      event_type: record.event_type,
      entity_type: record.entity_type,
      actor_type: record.actor_type,
      actor_user_id: record.actor_user_id ?? null,
      before: record.before ?? null,
      after: record.after ?? null,
      metadata: record.metadata ?? null,
    },
  };
}

function compareTimelineItems(left, right) {
  const leftTime = timelineTimestamp(left);
  const rightTime = timelineTimestamp(right);
  const leftValue = leftTime ? new Date(leftTime).valueOf() : Number.NaN;
  const rightValue = rightTime ? new Date(rightTime).valueOf() : Number.NaN;

  if (
    (Number.isNaN(leftValue) && Number.isNaN(rightValue)) ||
    leftValue === rightValue
  ) {
    if (left.type !== right.type) return left.type === 'message' ? -1 : 1;
    return String(left.id).localeCompare(String(right.id));
  }

  if (Number.isNaN(leftValue)) return 1;
  if (Number.isNaN(rightValue)) return -1;
  return rightValue - leftValue;
}

function normalizeActivityDate(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  const datePart = trimmedValue.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return null;
  }

  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);

  if (
    Number.isNaN(calendarDate.valueOf()) ||
    calendarDate.toISOString().slice(0, 10) !== datePart
  ) {
    return null;
  }

  if (trimmedValue === datePart) {
    return datePart;
  }

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

export function calculateInactiveDays(dateValue, today = new Date()) {
  if (!dateValue) return null;

  const activityDate = new Date(`${dateValue}T00:00:00.000Z`);
  const currentDate = new Date(today);
  currentDate.setUTCHours(0, 0, 0, 0);

  if (Number.isNaN(activityDate.valueOf())) return null;

  return Math.max(
    0,
    Math.floor((currentDate.valueOf() - activityDate.valueOf()) / 86400000),
  );
}

function summarizeCustomerActivity(customers, purchases, appointments, today = new Date()) {
  const purchaseSummary = new Map();

  for (const purchase of purchases ?? []) {
    const purchaseDate = normalizeActivityDate(purchase.purchase_date);
    const summary = purchaseSummary.get(purchase.customer_id) ?? null;

    if (
      purchaseDate &&
      (!summary || purchaseDate > summary.lastPurchaseDate)
    ) {
      purchaseSummary.set(purchase.customer_id, {
        lastPurchaseDate: purchaseDate,
      });
    }
  }

  const appointmentSummary = new Map();

  for (const appointment of appointments ?? []) {
    if (appointment.status !== 'completed') continue;

    const appointmentDate = normalizeActivityDate(appointment.appointment_date);
    const summary = appointmentSummary.get(appointment.customer_id) ?? null;

    if (
      appointmentDate &&
      (!summary || appointmentDate > summary.lastCompletedAppointmentDate)
    ) {
      appointmentSummary.set(appointment.customer_id, {
        lastCompletedAppointmentDate: appointmentDate,
      });
    }
  }

  return (customers ?? []).map((customer) => {
    const lastPurchaseDate =
      purchaseSummary.get(customer.id)?.lastPurchaseDate ?? null;
    const lastCompletedAppointmentDate =
      appointmentSummary.get(customer.id)?.lastCompletedAppointmentDate ?? null;
    const activityDate = lastCompletedAppointmentDate ?? lastPurchaseDate;

    return {
      ...customer,
      last_purchase_date: lastPurchaseDate,
      last_completed_appointment_date: lastCompletedAppointmentDate,
      inactive_days: calculateInactiveDays(activityDate, today),
    };
  });
}

function appointmentTimestamp(appointment) {
  const date = normalizeActivityDate(appointment.appointment_date);
  if (!date) return null;

  const time = typeof appointment.appointment_time === 'string' &&
    /^\d{2}:\d{2}(?::\d{2})?$/.test(appointment.appointment_time.trim())
    ? appointment.appointment_time.trim()
    : '23:59:59';
  const timestamp = new Date(`${date}T${time}Z`).valueOf();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function addUpcomingAppointmentSummary(customers, appointments, now = new Date()) {
  const upcomingSummary = new Map();
  const currentTimestamp = new Date(now).valueOf();

  for (const appointment of appointments ?? []) {
    if (appointment.status !== 'scheduled') continue;

    const timestamp = appointmentTimestamp(appointment);
    if (timestamp === null || timestamp <= currentTimestamp) continue;

    const existing = upcomingSummary.get(appointment.customer_id);
    if (!existing || timestamp < existing.timestamp) {
      upcomingSummary.set(appointment.customer_id, {
        timestamp,
        date: normalizeActivityDate(appointment.appointment_date),
        time: appointment.appointment_time ?? null,
      });
    }
  }

  return (customers ?? []).map((customer) => ({
    ...customer,
    next_appointment_date: upcomingSummary.get(customer.id)?.date ?? null,
    next_appointment_time: upcomingSummary.get(customer.id)?.time ?? null,
  }));
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

    if (
  values.phone !== undefined &&
  !/^\d{10}$/.test(values.phone)
) {
  errors.push('phone must contain exactly 10 digits.');
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

function sendAuditError(response, error) {
  console.error('Unable to record customer activity event:', error?.message ?? error);
  return response.status(500).json({
    error: 'Customer operation succeeded, but its audit event could not be recorded.',
  });
}

function resolveRouteBusinessId(request, response) {
  if (!request.profile) {
    return { ok: true, businessId: null };
  }

  const businessId = getAuthorizedBusinessId(request);

  if (request.profile.role === 'admin') {
    if (businessId && !isValidUuid(businessId)) {
      response.status(400).json({
        error: 'business_id must be a valid UUID.',
      });
      return { ok: false, businessId: null };
    }

    return { ok: true, businessId: businessId || null };
  }

  if (!isValidUuid(businessId)) {
    response.status(403).json({
      error: 'An authorized business context is required.',
    });
    return { ok: false, businessId: null };
  }

  return { ok: true, businessId };
}

function resolveImportBusinessId(request, response) {
  const requestedBusinessId = request.body?.business_id;

  if (!request.profile || request.profile.role === 'admin') {
    if (!isValidUuid(requestedBusinessId)) {
      response.status(400).json({
        error: 'business_id must be a valid UUID.',
      });
      return { ok: false, businessId: null };
    }

    return { ok: true, businessId: requestedBusinessId };
  }

  const authorizedBusinessId = getAuthorizedBusinessId(request);

  if (!isValidUuid(authorizedBusinessId)) {
    response.status(403).json({
      error: 'An authorized business context is required.',
    });
    return { ok: false, businessId: null };
  }

  if (requestedBusinessId && requestedBusinessId !== authorizedBusinessId) {
    response.status(403).json({
      error: 'You do not have access to this business.',
    });
    return { ok: false, businessId: null };
  }

  return { ok: true, businessId: authorizedBusinessId };
}

function isUniqueViolation(error) {
  return error?.code === '23505';
}

function auditSnapshot(customer, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(customer, field))
      .map((field) => [field, customer[field]])
  );
}

function changedFields(before, after, fields) {
  return fields.filter((field) => before[field] !== after[field]);
}

export function createCustomersRouter({
  customerService,
  businessService,
  purchaseService,
  appointmentService,
  activityEventService,
  messageService,
  permissionService,
  businessAccessMiddleware = requireBusinessAccess,
} = {}) {
  const router = Router();
  let resolvedCustomerService = customerService;
  let resolvedBusinessService = businessService;
  let resolvedPurchaseService = purchaseService;
  let resolvedAppointmentService = appointmentService;
  let resolvedActivityEventService = activityEventService;
  let resolvedMessageService = messageService;
  let resolvedPermissionService = permissionService;

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

  function getPurchaseService() {
    if (!resolvedPurchaseService) {
      resolvedPurchaseService = createPurchaseService();
    }

    return resolvedPurchaseService;
  }

  function getAppointmentService() {
    if (!resolvedAppointmentService) {
      resolvedAppointmentService = createAppointmentService();
    }

    return resolvedAppointmentService;
  }

  function getActivityEventService() {
    if (!resolvedActivityEventService) {
      resolvedActivityEventService = createActivityEventService();
    }

    return resolvedActivityEventService;
  }

  function getMessageService() {
    if (!resolvedMessageService) {
      resolvedMessageService = createMessageService();
    }

    return resolvedMessageService;
  }

  function getPermissionService() {
    if (!resolvedPermissionService) {
      resolvedPermissionService = createPermissionService();
    }

    return resolvedPermissionService;
  }

  async function requireCustomerPermission(
    request,
    response,
    next,
    permission,
    permissionError,
    lookupError,
  ) {
    // The application installs requireAuth globally. This preserves the
    // existing injected auth bypass used by route tests and local harnesses.
    if (!request.profile || !request.user) {
      return next();
    }

    if (request.profile.role === 'admin') {
      return next();
    }

    let authorization = request.businessAuthorization;

    if (!authorization) {
      const businessId = request.body?.business_id ||
        request.query?.business_id ||
        (request.profile.role === 'client'
          ? request.profile.business_id
          : null);

      try {
        const lookupResult =
          await getPermissionService().getBusinessAuthorization(
            request,
            businessId,
          );

        if (lookupResult?.error) {
          console.error(lookupError, lookupResult.error);
          return response.status(500).json({
            error: lookupError,
          });
        }

        authorization = lookupResult?.data;
      } catch (error) {
        console.error(lookupError, error);
        return response.status(500).json({
          error: lookupError,
        });
      }
    }

    if (!authorization) {
      return response.status(500).json({
        error: lookupError,
      });
    }

    request.businessAuthorization = authorization;

    if (!authorization.authorized) {
      return response.status(403).json({
        error: 'You do not have access to this business.',
      });
    }

    if (authorization.permissions?.[permission] !== true) {
      return response.status(403).json({
        error: permissionError,
      });
    }

    return next();
  }

  function requireViewChats(request, response, next) {
    return requireCustomerPermission(
      request,
      response,
      next,
      'view_chats',
      'You do not have permission to view chats.',
      'Unable to verify customer-list access.',
    );
  }

  function requireViewChatsForDetail(request, response, next) {
    return requireCustomerPermission(
      request,
      response,
      next,
      'view_chats',
      'You do not have permission to view chats.',
      'Unable to verify customer-detail access.',
    );
  }

  function requireViewChatsForInactive(request, response, next) {
    if (!request.profile) {
      return response.status(403).json({
        error: 'Authentication context is required for business access.',
      });
    }

    return requireViewChats(request, response, next);
  }

  function requireManageCustomers(request, response, next) {
    return requireCustomerPermission(
      request,
      response,
      next,
      'manage_customers',
      'You do not have permission to manage customers.',
      'Unable to verify customer-creation access.',
    );
  }

  function requireManageCustomersForUpdate(request, response, next) {
    return requireCustomerPermission(
      request,
      response,
      next,
      'manage_customers',
      'You do not have permission to manage customers.',
      'Unable to verify customer-update access.',
    );
  }

  function requireManageCustomersForDelete(request, response, next) {
    return requireCustomerPermission(
      request,
      response,
      next,
      'manage_customers',
      'You do not have permission to manage customers.',
      'Unable to verify customer-deletion access.',
    );
  }

  router.post('/import', businessAccessMiddleware, requireManageCustomers, async (request, response) => {
    const scope = resolveImportBusinessId(request, response);
    if (!scope.ok) return undefined;

    const rows = request.body?.rows;
    if (!Array.isArray(rows)) {
      return response.status(400).json({ error: 'rows must be an array.' });
    }

    if (!(await findBusiness(scope.businessId, response))) {
      return undefined;
    }

    const outcomes = [];
    const seenPhones = new Set();

    for (const [index, row] of rows.entries()) {
      const rowNumber = Number.isInteger(row?.rowNumber)
        ? row.rowNumber
        : index + 2;
      const { errors, values } = validateCustomer(
        {
          ...row,
          business_id: scope.businessId,
        },
        { creating: true },
      );

      if (errors.length) {
        outcomes.push({
          row_number: rowNumber,
          status: 'failed',
          message: errors.join(' '),
        });
        continue;
      }

      if (seenPhones.has(values.phone)) {
        outcomes.push({
          row_number: rowNumber,
          status: 'skipped_duplicate',
          message: 'Skipped because this phone number appears earlier in the import.',
        });
        continue;
      }
      seenPhones.add(values.phone);

      const { data: existingCustomer, error: duplicateCheckError } =
        await getCustomerService().findByBusinessIdAndPhone(
          scope.businessId,
          values.phone,
        );

      if (duplicateCheckError) {
        outcomes.push({
          row_number: rowNumber,
          status: 'failed',
          message: 'Unable to check for an existing customer.',
        });
        continue;
      }

      if (existingCustomer) {
        outcomes.push({
          row_number: rowNumber,
          status: 'skipped_duplicate',
          message: 'Skipped because this phone number already exists in this business.',
        });
        continue;
      }

      const { data, error: createError } = await getCustomerService().create(values);

      if (createError) {
        if (isUniqueViolation(createError)) {
          outcomes.push({
            row_number: rowNumber,
            status: 'skipped_duplicate',
            message: 'Skipped because this phone number already exists in this business.',
          });
        } else {
          outcomes.push({
            row_number: rowNumber,
            status: 'failed',
            message: 'Unable to create this customer.',
          });
        }
        continue;
      }

      if (!data) {
        outcomes.push({
          row_number: rowNumber,
          status: 'failed',
          message: 'Unable to create this customer.',
        });
        continue;
      }

      const auditResult = await recordCustomerEvent(request, data, 'customer.created', {
        after: auditSnapshot(data, [...AUDITED_CUSTOMER_FIELDS, 'consent_given']),
      });

      if (auditResult.error) {
        outcomes.push({
          row_number: rowNumber,
          status: 'failed',
          message: 'Customer was created, but its audit event could not be recorded.',
        });
        continue;
      }

      outcomes.push({
        row_number: rowNumber,
        status: 'imported',
        message: 'Customer imported successfully.',
        customer: data,
      });
    }

    return response.status(200).json({
      data: outcomes,
      summary: {
        imported: outcomes.filter((outcome) => outcome.status === 'imported').length,
        skipped_duplicate: outcomes.filter((outcome) => outcome.status === 'skipped_duplicate').length,
        failed: outcomes.filter((outcome) => outcome.status === 'failed').length,
      },
    });
  });

  async function recordCustomerEvent(request, customer, eventType, fields) {
    try {
      const result = await getActivityEventService().create({
        scope_type: 'business',
        business_id: customer.business_id,
        actor_user_id: request.user?.id ?? null,
        actor_type: 'user',
        event_type: eventType,
        entity_type: 'customer',
        entity_id: customer.id,
        customer_id: customer.id,
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

  router.get('/inactive', businessAccessMiddleware, requireViewChatsForInactive, async (request, response) => {
    const { business_id: requestedBusinessId, days } = request.query;

    if (!isValidUuid(requestedBusinessId)) {
      return response.status(400).json({
        error: 'business_id query parameter must be a valid UUID.',
      });
    }

    if (!INACTIVITY_PERIODS.has(String(days))) {
      return response.status(400).json({
        error: 'days must be one of: 30, 60, or 90.',
      });
    }

    const businessId = request.profile.role === 'admin'
      ? requestedBusinessId
      : getAuthorizedBusinessId(request);

    if (!isValidUuid(businessId) || businessId !== requestedBusinessId) {
      return response.status(403).json({
        error: 'You do not have access to this business.',
      });
    }

    if (!(await findBusiness(businessId, response))) {
      return undefined;
    }

    const [customerResult, purchaseResult, appointmentResult] = await Promise.all([
      getCustomerService().listByBusinessId(businessId),
      getPurchaseService().list({ businessId }),
      getAppointmentService().listCompletedByBusinessId(businessId),
    ]);

    if (customerResult.error) {
      return sendDatabaseError(response, customerResult.error);
    }

    if (purchaseResult.error) {
      return sendDatabaseError(response, purchaseResult.error);
    }

    if (appointmentResult.error) {
      return sendDatabaseError(response, appointmentResult.error);
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setUTCDate(cutoff.getUTCDate() - Number(days));
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const purchaseSummary = new Map();

    for (const purchase of purchaseResult.data ?? []) {
      const summary = purchaseSummary.get(purchase.customer_id) ?? {
        hasPurchaseHistory: false,
        lastPurchaseDate: null,
      };

      summary.hasPurchaseHistory = true;

      const purchaseDate = normalizeActivityDate(purchase.purchase_date);

      if (
        purchaseDate &&
        (!summary.lastPurchaseDate ||
          purchaseDate > summary.lastPurchaseDate)
      ) {
        summary.lastPurchaseDate = purchaseDate;
      }

      purchaseSummary.set(purchase.customer_id, summary);
    }

    const appointmentSummary = new Map();

    for (const appointment of appointmentResult.data ?? []) {
      if (appointment.status !== 'completed') {
        continue;
      }

      const summary = appointmentSummary.get(appointment.customer_id) ?? {
        hasCompletedAppointmentHistory: false,
        lastCompletedAppointmentDate: null,
      };

      summary.hasCompletedAppointmentHistory = true;

      const appointmentDate = normalizeActivityDate(appointment.appointment_date);

      if (
        appointmentDate &&
        (!summary.lastCompletedAppointmentDate ||
          appointmentDate > summary.lastCompletedAppointmentDate)
      ) {
        summary.lastCompletedAppointmentDate = appointmentDate;
      }

      appointmentSummary.set(appointment.customer_id, summary);
    }

    const data = (customerResult.data ?? [])
      .map((customer) => {
        const summary = purchaseSummary.get(customer.id) ?? {
          hasPurchaseHistory: false,
          lastPurchaseDate: null,
        };
        const completedAppointment = appointmentSummary.get(customer.id) ?? {
          hasCompletedAppointmentHistory: false,
          lastCompletedAppointmentDate: null,
        };
        const lastActivityDate = [
          summary.lastPurchaseDate,
          completedAppointment.lastCompletedAppointmentDate,
        ]
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;

        return {
          ...customer,
          last_purchase_date: summary.lastPurchaseDate,
          has_purchase_history: summary.hasPurchaseHistory,
          last_completed_appointment_date:
            completedAppointment.lastCompletedAppointmentDate,
          has_completed_appointment_history:
            completedAppointment.hasCompletedAppointmentHistory,
          last_activity_date: lastActivityDate,
        };
      })
      .filter((customer) => (
        (!customer.has_purchase_history &&
          !customer.has_completed_appointment_history) ||
        (
          customer.last_activity_date !== null &&
          customer.last_activity_date < cutoffDate
        )
      ));

    return response.status(200).json({
      data,
      inactivity_days: Number(days),
      cutoff_date: cutoffDate,
    });
  });

  router.get('/:id/timeline', businessAccessMiddleware, requireViewChats, async (request, response) => {
    if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'customer id must be a valid UUID.' });
    }

    const businessId = request.profile?.role === 'client'
      ? request.query.business_id || request.profile.business_id
      : request.query.business_id;

    if (!isValidUuid(businessId)) {
      return response.status(400).json({
        error: 'business_id query parameter must be a valid UUID.',
      });
    }

    const pagination = parseTimelinePagination(request.query);
    if (!pagination) {
      return response.status(400).json({
        error: 'page must be 1-100 and limit must be 1-50.',
      });
    }

    if (!(await findBusiness(businessId, response))) {
      return undefined;
    }

    const customerResult = await getCustomerService().findById(
      request.params.id,
      businessId
    );

    if (customerResult.error) {
      return sendDatabaseError(response, customerResult.error);
    }

    if (
      !customerResult.data ||
      customerResult.data.business_id !== businessId
    ) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    const fetchLimit = pagination.offset + pagination.limit + 1;
    const includeActivity = !request.profile ||
      request.profile.role === 'admin' ||
      request.businessAuthorization?.permissions?.view_customer_activity === true;
    const [messageResult, activityResult] = await Promise.all([
      getMessageService().listByCustomerId(businessId, request.params.id, {
        limit: fetchLimit,
        offset: 0,
      }),
      includeActivity
        ? getActivityEventService().listCustomerTimeline(
            businessId,
            request.params.id,
            { limit: fetchLimit, offset: 0 }
          )
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (messageResult.error) {
      return sendDatabaseError(response, messageResult.error);
    }

    if (activityResult.error) {
      return sendDatabaseError(response, activityResult.error);
    }

    const messages = (messageResult.data ?? [])
      .filter((message) => (
        message.business_id === businessId &&
        message.customer_id === request.params.id
      ))
      .map((message) => toTimelineItem('message', message));
    const activities = (activityResult.data ?? [])
      .filter((event) => (
        event.business_id === businessId &&
        event.customer_id === request.params.id &&
        event.visibility === 'customer_timeline'
      ))
      .map((event) => toTimelineItem('activity', event));
    const merged = [...messages, ...activities].sort(compareTimelineItems);
    const data = merged.slice(pagination.offset, pagination.offset + pagination.limit);

    return response.status(200).json({
      data,
      page: pagination.page,
      limit: pagination.limit,
      has_more: merged.length > pagination.offset + pagination.limit,
    });
  });

  router.get('/', businessAccessMiddleware, requireViewChats, async (request, response) => {
    const { business_id: businessId } = request.query;

    if (!isValidUuid(businessId)) {
      return response.status(400).json({ error: 'business_id query parameter must be a valid UUID.' });
    }

    if (!(await findBusiness(businessId, response))) {
      return undefined;
    }

    const { data: customers, error } = await getCustomerService().listByBusinessId(businessId);

    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!resolvedPurchaseService || !resolvedAppointmentService) {
      return response.status(200).json({ data: customers });
    }

    const [purchaseResult, appointmentResult, upcomingAppointmentResult] = await Promise.all([
      getPurchaseService().list({ businessId }),
      getAppointmentService().listCompletedByBusinessId(businessId),
      typeof getAppointmentService().listUpcomingByBusinessId === 'function'
        ? getAppointmentService().listUpcomingByBusinessId(businessId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (purchaseResult.error) {
      return sendDatabaseError(response, purchaseResult.error);
    }

    if (appointmentResult.error) {
      return sendDatabaseError(response, appointmentResult.error);
    }

    if (upcomingAppointmentResult.error) {
      return sendDatabaseError(response, upcomingAppointmentResult.error);
    }

    return response.status(200).json({
      data: addUpcomingAppointmentSummary(summarizeCustomerActivity(
        customers,
        purchaseResult.data,
        appointmentResult.data,
      ), upcomingAppointmentResult.data),
    });
  });

router.get('/:id', businessAccessMiddleware, requireViewChatsForDetail, async (request, response) => {
      if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'customer id must be a valid UUID.' });
    }

    const scope = resolveRouteBusinessId(request, response);
    if (!scope.ok) {
      return undefined;
    }

    const { data, error } = await getCustomerService().findById(
      request.params.id,
      scope.businessId
    );
    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data || (scope.businessId && data.business_id !== scope.businessId)) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    return response.status(200).json({ data });
  });

router.post('/', businessAccessMiddleware, requireManageCustomers, async (request, response) => {
      const { errors, values } = validateCustomer(request.body ?? {}, { creating: true });

    if (errors.length) {
      return response.status(400).json({ errors });
    }

    if (!(await findBusiness(values.business_id, response))) {
      return undefined;
    }

    const { data: existingCustomer, error: duplicateCheckError } =
      await getCustomerService().findByBusinessIdAndPhone(
        values.business_id,
        values.phone
      );

    if (duplicateCheckError) {
      return sendDatabaseError(response, duplicateCheckError);
    }

    if (existingCustomer) {
      return response.status(409).json({
        error: 'A customer with this phone number already exists in this business.',
      });
    }

    const { data, error } = await getCustomerService().create(values);

    if (error) {
      return sendDatabaseError(response, error);
    }

    const auditResult = await recordCustomerEvent(request, data, 'customer.created', {
      after: auditSnapshot(data, [...AUDITED_CUSTOMER_FIELDS, 'consent_given']),
    });

    if (auditResult.error) {
      return sendAuditError(response, auditResult.error);
    }

    return response.status(201).json({ data });
  });

router.put('/:id', businessAccessMiddleware, requireManageCustomersForUpdate, async (request, response) => {
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

    const scope = resolveRouteBusinessId(request, response);
    if (!scope.ok) {
      return undefined;
    }

    const businessId = scope.businessId;
    const {
      data: existingCustomer,
      error: existingCustomerError,
    } = await getCustomerService().findById(request.params.id, businessId);

    if (existingCustomerError) {
      return sendDatabaseError(response, existingCustomerError);
    }

    if (!existingCustomer || (businessId && existingCustomer.business_id !== businessId)) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    const { data: duplicateCustomer, error: duplicateCheckError } =
      await getCustomerService().findByBusinessIdAndPhone(
        existingCustomer.business_id,
        values.phone ?? existingCustomer.phone,
        request.params.id
      );

    if (duplicateCheckError) {
      return sendDatabaseError(response, duplicateCheckError);
    }

    if (duplicateCustomer) {
      return response.status(409).json({
        error: 'A customer with this phone number already exists in this business.',
      });
    }

    const before = auditSnapshot(
      existingCustomer,
      [...AUDITED_CUSTOMER_FIELDS, 'consent_given']
    );

    const { data, error } = await getCustomerService().update(
      request.params.id,
      values,
      businessId
    );
    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!data) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    const after = auditSnapshot(data, [...AUDITED_CUSTOMER_FIELDS, 'consent_given']);
    const changedCustomerFields = changedFields(before, after, AUDITED_CUSTOMER_FIELDS);

    const updateAuditResult = await recordCustomerEvent(request, data, 'customer.updated', {
      before: auditSnapshot(before, changedCustomerFields),
      after: auditSnapshot(after, changedCustomerFields),
    });

    if (updateAuditResult.error) {
      return sendAuditError(response, updateAuditResult.error);
    }

    if (before.consent_given !== after.consent_given) {
      const auditResult = await recordCustomerEvent(request, data, 'customer.consent_changed', {
        before: { consent_given: before.consent_given },
        after: { consent_given: after.consent_given },
      });

      if (auditResult.error) {
        return sendAuditError(response, auditResult.error);
      }
    }

    return response.status(200).json({ data });
  });

router.delete('/:id', businessAccessMiddleware, requireManageCustomersForDelete, async (request, response) => {
      if (!isValidUuid(request.params.id)) {
      return response.status(400).json({ error: 'customer id must be a valid UUID.' });
    }

    const scope = resolveRouteBusinessId(request, response);
    if (!scope.ok) {
      return undefined;
    }

    const {
      data: existingCustomer,
      error: existingCustomerError,
    } = await getCustomerService().findById(request.params.id, scope.businessId);

    if (existingCustomerError) {
      return sendDatabaseError(response, existingCustomerError);
    }

    if (!existingCustomer) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    const { data: deletedCustomer, error } = await getCustomerService().remove(
      request.params.id,
      scope.businessId
    );
    if (error) {
      return sendDatabaseError(response, error);
    }

    if (!deletedCustomer) {
      return response.status(404).json({ error: 'Customer not found.' });
    }

    // Supabase transactions are not exposed by the existing service pattern.
    // Capture the pre-delete values before removal, then persist the event only
    // after the deletion succeeds. entity_id preserves the deleted UUID while
    // customer_id is omitted from the event because its FK may be gone.
    const auditResult = await recordCustomerEvent(request, existingCustomer, 'customer.deleted', {
      customer_id: null,
      before: auditSnapshot(existingCustomer, [...AUDITED_CUSTOMER_FIELDS, 'consent_given']),
    });

    if (auditResult.error) {
      return sendAuditError(response, auditResult.error);
    }

    return response.status(204).send();
  });

  return router;
}
