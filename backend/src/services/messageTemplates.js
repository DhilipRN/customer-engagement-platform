import { getSupabaseClient } from '../config/supabase.js';

function isMissingMetadataColumnError(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    (message.includes('metadata') && message.includes('column'))
  );
}

function withoutMetadata(values) {
  const { metadata, ...legacyValues } = values;
  return legacyValues;
}

export function normalizeMessageTemplate(template) {
  if (!template) return template;
  const metaCategory = template.metadata?.meta_category;
  return metaCategory ? { ...template, category: metaCategory } : template;
}

export function createMessageTemplateService(supabaseClient = getSupabaseClient()) {
  return {
    async listByBusinessId(businessId) {
      const result = await supabaseClient
        .from('message_templates')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
      return result.error
        ? result
        : { ...result, data: (result.data ?? []).map(normalizeMessageTemplate) };
    },

    async findById(id, businessId = null) {
      let query = supabaseClient.from('message_templates').select('*').eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      const result = await query.maybeSingle();
      return result.error ? result : { ...result, data: normalizeMessageTemplate(result.data) };
    },

    async create(values) {
      const query = () => supabaseClient.from('message_templates').insert(values).select('*').single();
      const result = await query();
      if (result.error && values.metadata && isMissingMetadataColumnError(result.error)) {
        const legacyResult = await supabaseClient
          .from('message_templates')
          .insert(withoutMetadata(values))
          .select('*')
          .single();
        return legacyResult.error ? legacyResult : { ...legacyResult, data: normalizeMessageTemplate(legacyResult.data) };
      }
      return result.error ? result : { ...result, data: normalizeMessageTemplate(result.data) };
    },

    async update(id, values, businessId = null) {
      const execute = (updateValues) => {
        let query = supabaseClient
          .from('message_templates')
          .update(updateValues)
          .eq('id', id);

        if (businessId) query = query.eq('business_id', businessId);

        return query.select('*').maybeSingle();
      };

      const result = await execute(values);
      if (result.error && values.metadata && isMissingMetadataColumnError(result.error)) {
        const legacyResult = await execute(withoutMetadata(values));
        return legacyResult.error ? legacyResult : { ...legacyResult, data: normalizeMessageTemplate(legacyResult.data) };
      }
      return result.error ? result : { ...result, data: normalizeMessageTemplate(result.data) };
    },

    async remove(id, businessId = null) {
      let query = supabaseClient.from('message_templates').delete().eq('id', id);

      if (businessId) query = query.eq('business_id', businessId);

      return query.select('id').maybeSingle();
    },
  };
}
