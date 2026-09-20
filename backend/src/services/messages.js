
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

    async listDueQueued(now) {
      return client
        .from('messages')
        .select('*')
        .eq('status', 'queued')
        .not('scheduled_at', 'is', null)
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true });
    },

    findById: (id) =>
      client.from('messages').select('*').eq('id', id).maybeSingle(),

    create: (values) =>
      client.from('messages').insert(values).select('*').single(),

    update: (id, values) =>
      client.from('messages').update(values).eq('id', id).select('*').maybeSingle(),

    remove: (id) =>
      client.from('messages').delete().eq('id', id).select('id').maybeSingle(),
  };
}