import { createSimulatedSender } from './simulatedSender.js';
import { createWhatsAppCloudClient } from './whatsappCloudClient.js';
import { getDefaultBusinessWhatsAppSettings } from './businessWhatsAppSettings.js';

function isEnabled(config) {
  return config?.enabled !== false &&
    config?.simulationMode !== true &&
    config?.mode !== 'simulated';
}

function getPayload(message, context = {}) {
  if (context.payload) return context.payload;
  if (message.metadata?.whatsapp_payload) return message.metadata.whatsapp_payload;

  const metadata = message.metadata ?? {};
  if (metadata.meta_template_name) {
    return {
      type: 'template',
      template: {
        name: metadata.meta_template_name,
        language: { code: metadata.language || 'en' },
        ...(metadata.components ? { components: metadata.components } : {}),
        ...(Array.isArray(metadata.buttons) && metadata.buttons.length
          ? { buttons: metadata.buttons }
          : {}),
      },
    };
  }

  if (Array.isArray(metadata.buttons) && metadata.buttons.length) {
    return {
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(metadata.header ? { header: { type: 'text', text: metadata.header } } : {}),
        body: { text: message.message_text },
        ...(metadata.footer ? { footer: { text: metadata.footer } } : {}),
        action: {
          buttons: metadata.buttons.map((button, index) => ({
            id: button.payload || `button_${index}`,
            title: button.text || `Option ${index + 1}`,
          })),
        },
      },
    };
  }

  return {
    type: 'text',
    text: { body: message.message_text },
  };
}

function getRecipient(message, context = {}) {
  return context.to ?? context.recipientPhone ?? message.recipient_phone ?? message.phone;
}

async function getDefaultBusinessProviderConfig(businessId) {
  return getDefaultBusinessWhatsAppSettings().getProviderConfig(businessId);
}

export function createMessageSender({
  simulatedSender = createSimulatedSender(),
  whatsappClient = createWhatsAppCloudClient(),
  getBusinessProviderConfig = getDefaultBusinessProviderConfig,
} = {}) {
  return {
    async send(message, context = {}) {
      let config;
      try {
        config = await getBusinessProviderConfig(message?.business_id, context);
      } catch {
        return {
          success: false,
          status: 'failed',
          error: 'Message provider configuration could not be resolved.',
        };
      }

      if (!config || !isEnabled(config) || !config.phoneNumberId || !config.accessToken) {
        return simulatedSender.send(message);
      }

      let result;
      try {
        result = await whatsappClient.send({
          phoneNumberId: config.phoneNumberId,
          accessToken: config.accessToken,
          to: getRecipient(message, context),
          payload: getPayload(message, context),
        });
      } catch {
        return {
          success: false,
          provider: 'whatsapp',
          status: 'failed',
          error: 'WhatsApp message dispatch failed.',
        };
      }

      if (result.success && result.providerMessageId) {
        message.metadata = {
          ...(message.metadata ?? {}),
          providerMessageId: result.providerMessageId,
        };
        return { ...result, metadata: message.metadata };
      }

      return result;
    },
  };
}
