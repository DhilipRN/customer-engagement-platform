import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createBusinessWhatsAppSettings } from '../services/businessWhatsAppSettings.js';
import { createBusinessAccessMiddleware } from '../middleware/auth.js';
import { getWhatsAppWebhookConfig } from '../config/env.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function databaseError(response) {
  return response.status(500).json({ error: 'Unable to process WhatsApp settings.' });
}

export function createBusinessWhatsAppSettingsRouter({
  settingsService,
  businessService,
  businessAccessMiddleware,
  permissionService,
  webhookConfig = getWhatsAppWebhookConfig(),
} = {}) {
  const router = Router();
  let resolvedSettingsService = settingsService;
  let resolvedBusinessService = businessService;

  const settings = () => (resolvedSettingsService ??= createBusinessWhatsAppSettings());
  const businesses = () => (resolvedBusinessService ??= createBusinessService());
  const requireAccess = businessAccessMiddleware ?? createBusinessAccessMiddleware({ permissionService });

  async function requireBusinessAdmin(request, response, next) {
    if (request.profile?.role === 'admin') return next();

    const authorization = request.businessAuthorization;
    if (authorization?.membership?.role === 'owner') return next();

    return response.status(403).json({ error: 'Business owner or admin access required.' });
  }

  router.use(requireAccess);
  router.use(requireBusinessAdmin);

  async function requireBusiness(request, response) {
    const businessId = request.params.businessId;
    if (!isValidUuid(businessId)) {
      response.status(400).json({ error: 'business id must be a valid UUID.' });
      return null;
    }

    const result = await businesses().findById(businessId);
    if (result.error) {
      databaseError(response);
      return null;
    }
    if (!result.data) {
      response.status(404).json({ error: 'Business not found.' });
      return null;
    }

    return businessId;
  }

  function responseData(settingsData) {
    return {
      ...settingsData,
      webhookCallbackUrl:
        webhookConfig.callbackUrl || '/api/webhooks/whatsapp',
      webhookVerifyToken: webhookConfig.verifyToken,
    };
  }

  router.get('/:businessId/whatsapp-settings', async (request, response) => {
    const businessId = await requireBusiness(request, response);
    if (!businessId) return;

    return response.json({ data: responseData(await settings().getSettings(businessId)) });
  });

  router.put('/:businessId/whatsapp-settings', async (request, response) => {
    const businessId = await requireBusiness(request, response);
    if (!businessId) return;

    const body = request.body ?? {};
    if (body.phoneNumberId !== undefined && typeof body.phoneNumberId !== 'string') {
      return response.status(400).json({ error: 'phoneNumberId must be a string.' });
    }
    if (body.wabaId !== undefined && typeof body.wabaId !== 'string') {
      return response.status(400).json({ error: 'wabaId must be a string.' });
    }
    if (body.accessToken !== undefined && typeof body.accessToken !== 'string') {
      return response.status(400).json({ error: 'accessToken must be a string.' });
    }
    if (body.isEnabled !== undefined && typeof body.isEnabled !== 'boolean') {
      return response.status(400).json({ error: 'isEnabled must be a boolean.' });
    }

    try {
      const data = await settings().updateSettings(businessId, body);
      return response.json({ data: responseData(data) });
    } catch {
      return databaseError(response);
    }
  });

  router.post('/:businessId/whatsapp-settings/test', async (request, response) => {
    const businessId = await requireBusiness(request, response);
    if (!businessId) return;

    try {
      const saved = await settings().getCredentials(businessId);
      const phoneNumberId = request.body?.phoneNumberId || saved.phoneNumberId;
      const accessToken = request.body?.accessToken?.trim() || saved.accessToken;
      const result = await settings().testConnection({ phoneNumberId, accessToken });

      if (!result.success) {
        return response.status(200).json({
          data: {
            success: false,
            error: 'WhatsApp credentials could not be verified.',
            code: result.code,
          },
        });
      }

      return response.json({
        data: {
          success: true,
          verifiedName: result.verifiedName,
          displayPhoneNumber: result.displayPhoneNumber,
        },
      });
    } catch {
      return response.status(200).json({
        data: { success: false, error: 'WhatsApp credentials could not be verified.' },
      });
    }
  });

  return router;
}
