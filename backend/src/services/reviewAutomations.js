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

    findById: (id) =>
      supabaseClient
        .from('review_automations')
        .select('*')
        .eq('id', id)
        .maybeSingle(),

    create: (values) =>
      supabaseClient
        .from('review_automations')
        .insert(values)
        .select('*')
        .single(),

    update: (id, values) =>
      supabaseClient
        .from('review_automations')
        .update(values)
        .eq('id', id)
        .select('*')
        .maybeSingle(),

    remove: (id) =>
      supabaseClient
        .from('review_automations')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle(),
  };
}