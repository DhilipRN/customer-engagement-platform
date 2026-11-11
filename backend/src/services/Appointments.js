import { getSupabaseClient } from '../config/supabase.js';

export function createAppointmentService(
  supabaseClient = getSupabaseClient()
) {
  return {
    async listByBusinessId(businessId, customerId = null) {
      let query = supabaseClient
        .from('appointments')
        .select('*')
        .eq('business_id', businessId);

      if (customerId) query = query.eq('customer_id', customerId);

      return query
        .order('appointment_date', {
          ascending: true,
        })
        .order('appointment_time', {
          ascending: true,
        });
    },

    async listByIds(ids, businessId = null) {
      let query = supabaseClient
        .from('appointments')
        .select('*')
        .in('id', ids);

      if (businessId) query = query.eq('business_id', businessId);

      return query;
    },

    async listCompletedByBusinessId(businessId) {
      return supabaseClient
        .from('appointments')
        .select('customer_id, appointment_date, status')
        .eq('business_id', businessId)
        .eq('status', 'completed');
    },

    async listUpcomingByBusinessId(businessId) {
      return supabaseClient
        .from('appointments')
        .select('customer_id, business_id, appointment_date, appointment_time, status')
        .eq('business_id', businessId)
        .eq('status', 'scheduled');
    },

    async findById(id, businessId = null) {
      let query = supabaseClient
        .from('appointments')
        .select('*')
        .eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.maybeSingle();
    },

    async create(values) {
      return supabaseClient
        .from('appointments')
        .insert(values)
        .select('*')
        .single();
    },

    async update(id, values, businessId = null) {
      let query = supabaseClient
        .from('appointments')
        .update(values)
        .eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('*').maybeSingle();
    },

    async remove(id, businessId = null) {
      let query = supabaseClient
        .from('appointments')
        .delete()
        .eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('id').maybeSingle();
    },
  };
}
