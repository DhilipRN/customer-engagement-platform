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

    async findById(id) {
      return supabaseClient
        .from('appointments')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    },

    async create(values) {
      return supabaseClient
        .from('appointments')
        .insert(values)
        .select('*')
        .single();
    },

    async update(id, values) {
      return supabaseClient
        .from('appointments')
        .update(values)
        .eq('id', id)
        .select('*')
        .maybeSingle();
    },

    async remove(id) {
      return supabaseClient
        .from('appointments')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
    },
  };
}