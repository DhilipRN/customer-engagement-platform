import { getSupabaseClient } from '../config/supabase.js';

export function createBusinessService(supabaseClient = getSupabaseClient()) {
  return {
    async list() {
      return supabaseClient
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false });
    },

    async findById(id) {
      return supabaseClient.from('businesses').select('*').eq('id', id).maybeSingle();
    },

    async create(values) {
      return supabaseClient.from('businesses').insert(values).select('*').single();
    },

    async update(id, values) {
  const result = await supabaseClient
    .from('businesses')
    .update(values)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (!result.data && !result.error) {
    const check = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('id', id)
      .maybeSingle();

  
  }

  return result;
},

    async remove(id) {
      return supabaseClient.from('businesses').delete().eq('id', id).select('id').maybeSingle();
    },
  };
}
