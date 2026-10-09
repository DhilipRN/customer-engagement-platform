
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

async findById(id, businessId = null) {
  let query = supabaseClient
    .from('customers')
    .select('*')
    .eq('id', id);

  if (businessId) {
    query = query.eq('business_id', businessId);
  }

  return query.maybeSingle();
},
    async create(values) {
      return supabaseClient.from('customers').insert(values).select('*').single();
    },
async update(id, values, businessId = null) {
  let query = supabaseClient
    .from('customers')
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
    .from('customers')
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
