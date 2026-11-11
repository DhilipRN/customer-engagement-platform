import { createWhatsAppCloudClient } from './whatsappCloudClient.js';

const defaultStorage = new Map();

function maskToken(accessToken) {
  if (!accessToken) return null;
  return `••••••••${accessToken.slice(-4)}`;
}

function sanitizeConnectionError(error, accessToken) {
  const message = typeof error === 'string' && error.trim()
    ? error.trim()
    : 'WhatsApp credentials could not be verified.';

  return message
    .replace(accessToken ? new RegExp(accessToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : /$^/, '[redacted]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/(access[_-]?token|token)([=:]\s*)[^\s,;}&]+/gi, '$1$2[redacted]')
    .slice(0, 500);
}

function statusFor(settings) {
  if (!settings?.phoneNumberId || !settings?.accessToken) return 'not_configured';
  return settings.isEnabled ? settings.status ?? 'configured' : 'disabled';
}

function sanitize(businessId, settings) {
  return {
    businessId,
    phoneNumberId: settings?.phoneNumberId ?? null,
    wabaId: settings?.wabaId ?? null,
    isEnabled: settings?.isEnabled === true,
    status: statusFor(settings),
    hasToken: Boolean(settings?.accessToken),
    maskedToken: maskToken(settings?.accessToken),
    updatedAt: settings?.updatedAt ?? null,
  };
}

function envProviderConfig(businessId) {
  const simulationMode =
    process.env.WHATSAPP_SIMULATION_MODE === 'true' ||
    process.env.WHATSAPP_MODE === 'simulated';
  const configuredBusinessId = process.env.WHATSAPP_BUSINESS_ID?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();

  if (configuredBusinessId && configuredBusinessId !== businessId) return null;

  return {
    enabled: !simulationMode,
    simulationMode,
    phoneNumberId,
    accessToken,
  };
}

export function createBusinessWhatsAppSettings({
  storage = defaultStorage,
  whatsappClient = createWhatsAppCloudClient(),
} = {}) {
  return {
    async getSettings(businessId) {
      return sanitize(businessId, storage.get(businessId));
    },

    async updateSettings(
      businessId,
      { phoneNumberId, wabaId, accessToken, isEnabled } = {},
    ) {
      const existing = storage.get(businessId) ?? {};
      const next = {
        ...existing,
        phoneNumberId: phoneNumberId === undefined ? existing.phoneNumberId ?? null : phoneNumberId || null,
        wabaId: wabaId === undefined ? existing.wabaId ?? null : wabaId || null,
        accessToken: accessToken?.trim() ? accessToken.trim() : existing.accessToken ?? null,
        isEnabled: isEnabled === undefined ? existing.isEnabled === true : isEnabled === true,
        updatedAt: new Date().toISOString(),
      };

      next.status = statusFor(next);
      storage.set(businessId, next);
      return sanitize(businessId, next);
    },

    async testConnection({ phoneNumberId, accessToken }) {
      try {
        const result = await whatsappClient.getPhoneNumber({ phoneNumberId, accessToken });
        if (result?.success) return result;
        return {
          ...result,
          success: false,
          error: sanitizeConnectionError(result?.error, accessToken),
        };
      } catch (error) {
        return {
          success: false,
          error: sanitizeConnectionError(error?.message, accessToken),
        };
      }
    },

    async getProviderConfig(businessId) {
      const stored = storage.get(businessId);
      if (stored) {
        return {
          enabled: stored.isEnabled === true,
          simulationMode: false,
          phoneNumberId: stored.phoneNumberId,
          accessToken: stored.accessToken,
        };
      }

      return envProviderConfig(businessId);
    },

    async getCredentials(businessId) {
      const stored = storage.get(businessId);
      if (stored) {
        return {
          phoneNumberId: stored.phoneNumberId,
          accessToken: stored.accessToken,
        };
      }

      const fallback = envProviderConfig(businessId);
      return fallback
        ? { phoneNumberId: fallback.phoneNumberId, accessToken: fallback.accessToken }
        : { phoneNumberId: null, accessToken: null };
    },
  };
}

export function getDefaultBusinessWhatsAppSettings() {
  return createBusinessWhatsAppSettings();
}
