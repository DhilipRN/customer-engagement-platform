import { getSupabaseClient } from '../config/supabase.js';

export function createReviewAutomationService(
  supabaseClient = getSupabaseClient()
) {
  return {
    findByBusinessId: (businessId) =>
      supabaseClient
        .from('review_automations')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle(),

    findById: (id, businessId = null) => {
      let query = supabaseClient
        .from('review_automations')
        .select('*')
        .eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.maybeSingle();
    },

    create: (values) =>
      supabaseClient
        .from('review_automations')
        .insert(values)
        .select('*')
        .single(),

    update: (id, values, businessId = null) => {
      let query = supabaseClient
        .from('review_automations')
        .update(values)
        .eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('*').maybeSingle();
    },

    remove: (id, businessId = null) => {
      let query = supabaseClient
        .from('review_automations')
        .delete()
        .eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('id').maybeSingle();
    },
  };
}
