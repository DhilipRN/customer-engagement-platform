import { getSupabaseClient } from '../config/supabase.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EVENT_FIELDS = new Set([
  'scope_type',
  'business_id',
  'actor_user_id',
  'actor_type',
  'event_type',
  'entity_type',
  'entity_id',
  'customer_id',
  'occurred_at',
  'is_reconstructed',
  'before',
  'after',
  'metadata',
  'visibility',
]);

// These are the only keys that may be stored inside audit payloads. In
// particular, arbitrary request bodies, credentials, and access tokens are
// never accepted by this service.
const SAFE_PAYLOAD_FIELDS = new Set([
  'id',
  'business_id',
  'customer_id',
  'actor_user_id',
  'profile_id',
  'created_by',
  'campaign_id',
  'template_id',
  'purchase_id',
  'appointment_id',
  'message_id',
  'name',
  'category',
  'metadata',
  'message',
  'phone',
  'email',
  'address',
  'google_review_link',
  'role',
  'consent_given',
  'purchase_date',
  'product_name',
  'amount',
  'appointment_date',
  'appointment_time',
  'appointment_type',
  'reminder_enabled',
  'reminder_minutes',
  'status',
  'scheduled_at',
  'sent_at',
  'source',
  'inactivity_days',
  'delay_minutes',
  'enabled',
  'review_link',
  'reason',
  'failure_reason',
  'operation',
  'message_status',
  // Safe message-template metadata fields. Button payloads are constrained
  // to these primitive keys; arbitrary nested configuration remains rejected.
  'meta_category',
  'meta_template_name',
  'language',
  'header',
  'footer',
  'buttons',
  'type',
  'text',
  'url',
  'button_id',
  'button_title',
  'membership_id',
  'user_id',
  'permission',
  'allowed',
  'view_chats',
  'view_customer_activity',
  'send_messages',
  'manage_customers',
  'view_appointments',
  'manage_appointments',
  'view_purchases',
  'manage_purchases',
  'view_campaigns',
  'manage_campaigns',
  'view_message_templates',
  'manage_message_templates',
  'view_automations',
  'manage_automations',
]);


function validationError(message) {
  return {
    code: 'VALIDATION_ERROR',
    message,
  };
}


function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonValue(value, path, seen) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? null
      : `${path} contains a non-finite number.`;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return `${path} must not be circular.`;
    seen.add(value);

    for (const item of value) {
      const error = validateJsonValue(item, path, seen);
      if (error) return error;
    }

    seen.delete(value);
    return null;
  }

  if (!isPlainObject(value)) {
    return `${path} must contain only JSON-compatible values.`;
  }

  if (seen.has(value)) return `${path} must not be circular.`;
  seen.add(value);

  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_PAYLOAD_FIELDS.has(key)) {
      return `${path}.${key} is not an allowed audit field.`;
    }

    const error = validateJsonValue(item, `${path}.${key}`, seen);
    if (error) return error;
  }

  seen.delete(value);
  return null;
}

function validatePayload(value, field) {
  if (value === undefined || value === null) return null;

  if (!isPlainObject(value)) {
    return `${field} must be a JSON object or null.`;
  }

  return validateJsonValue(value, field, new Set());
}

export function validateActivityEvent(event = {}) {
  if (!isPlainObject(event)) {
    return {
      errors: ['event must be a plain object.'],
      values: null,
    };
  }

  const errors = [];
  const unknownFields = Object.keys(event).filter(
    (field) => !EVENT_FIELDS.has(field)
  );

  if (unknownFields.length) {
    errors.push(`Unsupported event fields: ${unknownFields.join(', ')}.`);
  }

  if (!['business', 'platform'].includes(event.scope_type)) {
    errors.push('scope_type must be business or platform.');
  }

  if (event.scope_type === 'business' && !isUuid(event.business_id)) {
    errors.push('business_id must be a valid UUID for business events.');
  }

  if (event.scope_type === 'platform' && event.business_id != null) {
    errors.push('business_id must be null for platform events.');
  }

  if (!['user', 'system'].includes(event.actor_type)) {
    errors.push('actor_type must be user or system.');
  }

  for (const [field, label] of [
    ['actor_user_id', 'actor_user_id'],
    ['entity_id', 'entity_id'],
    ['customer_id', 'customer_id'],
  ]) {
    if (event[field] != null && !isUuid(event[field])) {
      errors.push(`${label} must be a valid UUID or null.`);
    }
  }

  for (const field of ['event_type', 'entity_type']) {
    if (
      typeof event[field] !== 'string' ||
      !event[field].trim() ||
      event[field].length > 100
    ) {
      errors.push(`${field} must be a non-empty string of 100 characters or fewer.`);
    }
  }

  if (event.occurred_at !== undefined) {
    if (
      typeof event.occurred_at !== 'string' ||
      Number.isNaN(new Date(event.occurred_at).valueOf())
    ) {
      errors.push('occurred_at must be a valid date-time.');
    }
  }

  if (
    event.is_reconstructed !== undefined &&
    typeof event.is_reconstructed !== 'boolean'
  ) {
    errors.push('is_reconstructed must be a boolean.');
  }

  if (!['customer_timeline', 'audit_only'].includes(event.visibility)) {
    errors.push(
      'visibility must be customer_timeline or audit_only.'
    );
  }

  for (const field of ['before', 'after', 'metadata']) {
    const error = validatePayload(event[field], field);
    if (error) errors.push(error);
  }

  if (errors.length) {
    return { errors, values: null };
  }

  const values = {};

  for (const field of EVENT_FIELDS) {
    if (event[field] !== undefined && field !== 'recorded_at') {
      values[field] = event[field];
    }
  }

  return { errors: [], values };
}

export function createActivityEventService(
  supabaseClient = getSupabaseClient()
) {
  return {

    
    async listCustomerTimeline(
      businessId,
      customerId,
      { limit, offset = 0 } = {}
    ) {
      let query = supabaseClient
        .from('activity_events')
        .select('*')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .eq('visibility', 'customer_timeline')
        .order('occurred_at', { ascending: false });

      if (Number.isInteger(limit) && limit > 0) {
        query = query.range(offset, offset + limit - 1);
      }

      return query;
    },

    // This service validates event shape and payload safety only. The calling
    // route or service must derive actor_user_id and business_id from the
    // authenticated context and authorize them before calling create().
    async create(event) {
      const validation = validateActivityEvent(event);

      if (validation.errors.length) {
        return {
          data: null,
          error: validationError(validation.errors.join(' ')),
        };
      }

      try {
        return await supabaseClient
          .from('activity_events')
          .insert(validation.values)
          .select('*')
          .single();
      } catch (error) {
        return {
          data: null,
          error,
        };
      }
    },
  };
}
