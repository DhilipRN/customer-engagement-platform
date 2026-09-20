
import { getSupabaseClient } from '../config/supabase.js';

export function createCustomerService(supabaseClient = getSupabaseClient()) {
  return {
    async listByBusinessId(businessId) {
      return supabaseClient
        .from('customers')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
    },

    async findById(id) {
      return supabaseClient.from('customers').select('*').eq('id', id).maybeSingle();
    },

    async create(values) {
      return supabaseClient.from('customers').insert(values).select('*').single();
    },

    async update(id, values) {
      return supabaseClient
        .from('customers')
        .update(values)
        .eq('id', id)
        .select('*')
        .maybeSingle();
    },

    async remove(id) {
      return supabaseClient.from('customers').delete().eq('id', id).select('id').maybeSingle();
    },
  };
}
