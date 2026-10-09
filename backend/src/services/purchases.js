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

   async findById(id, businessId = null) {
  let query = supabaseClient
    .from('purchases')
    .select('*')
    .eq('id', id);

  if (businessId) {
    query = query.eq('business_id', businessId);
  }

  return query.maybeSingle();
},

    async create(values) {
      return supabaseClient.from('purchases').insert(values).select('*').single();
    },

async update(id, values, businessId = null) {
  let query = supabaseClient
    .from('purchases')
    .update(values)
    .eq('id', id);

  if (businessId) {
    query = query.eq('business_id', businessId);
  }

  return query
    .select('*')
    .maybeSingle();
},

  async remove(id, businessId = null) {
      let query = supabaseClient
        .from('purchases')
        .delete()
        .eq('id', id);

      if (businessId) {
        query = query.eq('business_id', businessId);
      }

      return query
        .select('id')
        .maybeSingle();
    },
  };
}
