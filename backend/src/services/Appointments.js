import { getSupabaseClient } from '../config/supabase.js';

export function createAppointmentService(
  supabaseClient = getSupabaseClient()
) {
  return {
    async listByBusinessId(businessId) {
      return supabaseClient
        .from('appointments')
        .select('*')
        .eq('business_id', businessId)
        .order('appointment_date', {
          ascending: true,
        })
        .order('appointment_time', {
          ascending: true,
        });
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
