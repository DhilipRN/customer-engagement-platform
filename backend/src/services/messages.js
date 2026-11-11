
import { getSupabaseClient } from '../config/supabase.js';

export function createMessageService(client = getSupabaseClient()) {
  return {
    list(filters) {
      let q = client
        .from('messages')
        .select('*')
        .eq('business_id', filters.businessId)
        .order('created_at', { ascending: false });

      for (const [column, value] of Object.entries({
        customer_id: filters.customerId,
        campaign_id: filters.campaignId,
        status: filters.status,
      })) {
        if (value) q = q.eq(column, value);
      }

      return q;
    },

    listByCustomerId(businessId, customerId, { limit, offset = 0 } = {}) {
      let query = client
        .from('messages')
        .select('*')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (Number.isInteger(limit) && limit > 0) {
        query = query.range(offset, offset + limit - 1);
      }

      return query;
    },

    listAppointmentReminderStatuses(businessId) {
      return client
        .from('messages')
        .select('id, appointment_id, status, scheduled_at, sent_at, created_at, source, template_id')
        .eq('business_id', businessId)
        .not('appointment_id', 'is', null)
        .order('created_at', { ascending: false });
    },

    findByAppointmentId(appointmentId, businessId = null) {
      let query = client
        .from('messages')
        .select('id, business_id, appointment_id, status')
        .eq('appointment_id', appointmentId);

      if (businessId) query = query.eq('business_id', businessId);

      return query.maybeSingle();
    },

    async listDueQueued(now) {
      return client
        .from('messages')
        .select('*')
        .eq('status', 'queued')
        .not('scheduled_at', 'is', null)
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true });
    },

    findById: (id, businessId = null) => {
      let query = client.from('messages').select('*').eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.maybeSingle();
    },

    findByProviderMessageId(providerMessageId) {
      return client
        .from('messages')
        .select('*')
        .eq('metadata->>providerMessageId', providerMessageId)
        .maybeSingle();
    },

    findByIdempotencyKey: (businessId, idempotencyKey) =>
      client
        .from('messages')
        .select('*')
        .eq('business_id', businessId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle(),

    create: (values) =>
      client.from('messages').insert(values).select('*').single(),

    update: (id, values, businessId = null) => {
      let query = client.from('messages').update(values).eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('*').maybeSingle();
    },

    remove: (id, businessId = null) => {
      let query = client.from('messages').delete().eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('id').maybeSingle();
    },
  };
}
