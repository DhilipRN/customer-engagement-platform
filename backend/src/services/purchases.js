import { getSupabaseClient } from '../config/supabase.js';

export function createPurchaseService(supabaseClient = getSupabaseClient()) {
  return {
    async list({ businessId, customerId }) {
      let query = supabaseClient
        .from('purchases')
        .select('*')
        .eq('business_id', businessId)
        .order('purchase_date', { ascending: false });

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      return query;
    },

    async findById(id) {
      return supabaseClient.from('purchases').select('*').eq('id', id).maybeSingle();
    },

    async create(values) {
      return supabaseClient.from('purchases').insert(values).select('*').single();
    },

    async update(id, values) {
      return supabaseClient
        .from('purchases')
        .update(values)
        .eq('id', id)
        .select('*')
        .maybeSingle();
    },

    async remove(id) {
      return supabaseClient.from('purchases').delete().eq('id', id).select('id').maybeSingle();
    },
  };
}
