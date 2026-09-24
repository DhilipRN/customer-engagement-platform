import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './env.js';

let client;

export function getSupabaseClient() {
  if (!client) {
    const { url, serviceRoleKey } = getSupabaseConfig();

    console.log('Using Supabase secret key:', serviceRoleKey.startsWith('sb_secret_'));

    client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return client;
}

export async function verifySupabaseConnection() {
  const { error } = await getSupabaseClient()
    .from('businesses')
    .select('id', { head: true, count: 'exact' })
    .limit(1);

  if (error) {
    throw new Error(`Supabase connection check failed: ${error.message}`);
  }
}
