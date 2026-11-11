import { supabase } from './supabaseClient';

export const API_BASE_URL = 'http://localhost:3000';

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

export function getWhatsAppSettings(businessId) {
  return apiFetch(
    `${API_BASE_URL}/api/businesses/${encodeURIComponent(businessId)}/whatsapp-settings`,
  );
}

export function updateWhatsAppSettings(businessId, payload) {
  return apiFetch(
    `${API_BASE_URL}/api/businesses/${encodeURIComponent(businessId)}/whatsapp-settings`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export function testWhatsAppConnection(businessId, payload = {}) {
  return apiFetch(
    `${API_BASE_URL}/api/businesses/${encodeURIComponent(businessId)}/whatsapp-settings/test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}
