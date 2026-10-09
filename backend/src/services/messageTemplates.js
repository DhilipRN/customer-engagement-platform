import { getSupabaseClient } from '../config/supabase.js';

export function createMessageTemplateService(supabaseClient = getSupabaseClient()) {
  return {
    async listByBusinessId(businessId) {
      return supabaseClient
        .from('message_templates')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
    },

    async findById(id, businessId = null) {
      let query = supabaseClient.from('message_templates').select('*').eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.maybeSingle();
    },

    async create(values) {
      return supabaseClient.from('message_templates').insert(values).select('*').single();
    },

    async update(id, values, businessId = null) {
      let query = supabaseClient
        .from('message_templates')
        .update(values)
        .eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('*').maybeSingle();
    },

    async remove(id, businessId = null) {
      let query = supabaseClient.from('message_templates').delete().eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('id').maybeSingle();
    },
  };
}
