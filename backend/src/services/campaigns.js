import { getSupabaseClient } from '../config/supabase.js';

export function createCampaignService(supabaseClient = getSupabaseClient()) {
  return {
    listByBusinessId: (businessId) => supabaseClient.from('campaigns').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    findById: (id) => supabaseClient.from('campaigns').select('*').eq('id', id).maybeSingle(),
    create: (values) => supabaseClient.from('campaigns').insert(values).select('*').single(),
    update: (id, values) => supabaseClient.from('campaigns').update(values).eq('id', id).select('*').maybeSingle(),
    remove: (id) => supabaseClient.from('campaigns').delete().eq('id', id).select('id').maybeSingle(),
  };
}
