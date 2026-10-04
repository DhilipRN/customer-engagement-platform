import { supabase } from './supabaseClient';

export async function apiFetch(url, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers || {});

  if (session?.access_token) {
    headers.set(
      'Authorization',
      `Bearer ${session.access_token}`
    );
  }

  return fetch(url, {
    ...options,
    headers,
  });
}