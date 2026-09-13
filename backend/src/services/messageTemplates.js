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

    async findById(id) {
      return supabaseClient.from('message_templates').select('*').eq('id', id).maybeSingle();
    },

    async create(values) {
      return supabaseClient.from('message_templates').insert(values).select('*').single();
    },

    async update(id, values) {
      return supabaseClient
        .from('message_templates')
        .update(values)
        .eq('id', id)
        .select('*')
        .maybeSingle();
    },

    async remove(id) {
      return supabaseClient.from('message_templates').delete().eq('id', id).select('id').maybeSingle();
    },
  };
}
