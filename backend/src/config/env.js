function requiredEnvironment(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`${name} must be set in the server environment.`);
  }

  return value.trim();
}

const DEVELOPMENT_WHATSAPP_WEBHOOK_VERIFY_TOKEN =
  'connectly-development-webhook-token';

export function getSupabaseConfig() {
  const url = requiredEnvironment('SUPABASE_URL');

  try {
    new URL(url);
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL.');
  }

  return {
    url,
    serviceRoleKey: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function getWhatsAppWebhookConfig() {
  return {
    verifyToken:
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ||
      DEVELOPMENT_WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    businessId: process.env.WHATSAPP_BUSINESS_ID?.trim() || null,
  };
}
