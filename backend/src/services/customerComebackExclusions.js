import { getSupabaseClient } from '../config/supabase.js';

export function createCustomerComebackExclusionService(
  supabaseClient = getSupabaseClient()
) {
  return {
    listByBusinessId(businessId) {
      return supabaseClient
        .from('customer_comeback_exclusions')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
    },

    create(businessId, customerId, createdBy = null) {
      return supabaseClient
        .from('customer_comeback_exclusions')
        .insert({
          business_id: businessId,
          customer_id: customerId,
          created_by: createdBy,
        })
        .select('*')
        .single();
    },

    remove(businessId, customerId) {
      return supabaseClient
        .from('customer_comeback_exclusions')
        .delete()
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .select('business_id, customer_id')
        .maybeSingle();
    },
  };
}
