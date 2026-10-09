import { getSupabaseClient } from '../config/supabase.js';

export function createCampaignService(supabaseClient = getSupabaseClient()) {
  return {
    listByBusinessId: (businessId) => supabaseClient.from('campaigns').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    findById: (id, businessId = null) => {
      let query = supabaseClient.from('campaigns').select('*').eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.maybeSingle();
    },
    create: (values) => supabaseClient.from('campaigns').insert(values).select('*').single(),
    update: (id, values, businessId = null) => {
      let query = supabaseClient.from('campaigns').update(values).eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('*').maybeSingle();
    },
    remove: (id, businessId = null) => {
      let query = supabaseClient.from('campaigns').delete().eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('id').maybeSingle();
    },
  };
}
