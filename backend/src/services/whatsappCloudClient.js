const DEFAULT_API_VERSION = 'v21.0';

function redact(value) {
  if (typeof value !== 'string') return value;

  return value
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/(access[_-]?token|token)([=:]\s*)[^\s,;}&]+/gi, '$1$2[redacted]');
}

function safeErrorMessage(value, fallback) {
  const message = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return redact(message).slice(0, 500);
}

function validateRequest({ phoneNumberId, accessToken, to, payload }) {
  if (!phoneNumberId || !accessToken || !to || !payload) {
    throw new Error('WhatsApp Cloud API requires phoneNumberId, accessToken, to, and payload.');
  }

  if (!['text', 'template', 'interactive'].includes(payload.type)) {
    throw new Error('WhatsApp Cloud API supports text, template, and interactive messages.');
  }
}

function formatTemplatePayload(payload) {
  if (payload.type !== 'template' || !payload.template?.buttons?.length) return payload;

  const { buttons, ...template } = payload.template;
  const buttonComponents = buttons.map((button, index) => ({
    type: 'button',
    sub_type: button.type === 'cta' ? 'url' : 'quick_reply',
    index: String(index),
    parameters: button.type === 'cta'
      ? [{ type: 'text', text: button.url || '' }]
      : [{ type: 'payload', payload: button.payload || button.text || '' }],
  }));

  return {
    ...payload,
    template: {
      ...template,
      components: [...(template.components ?? []), ...buttonComponents],
    },
  };
}

function formatInteractivePayload(payload) {
  if (payload.type !== 'interactive' || payload.interactive?.type !== 'button') return payload;

  const buttons = payload.interactive.action?.buttons ?? [];
  return {
    ...payload,
    interactive: {
      ...payload.interactive,
      action: {
        ...payload.interactive.action,
        buttons: buttons.map((button, index) => ({
          type: 'reply',
          reply: {
            id: button.reply?.id || button.id || `button_${index}`,
            title: button.reply?.title || button.title || '',
          },
        })),
      },
    },
  };
}

function formatPayload(payload) {
  return formatInteractivePayload(formatTemplatePayload(payload));
}

export function createWhatsAppCloudClient({
  fetchImpl = globalThis.fetch,
  apiVersion = DEFAULT_API_VERSION,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for the WhatsApp Cloud API client.');
  }

  return {
    async getPhoneNumber({ phoneNumberId, accessToken }) {
      try {
        if (!phoneNumberId || !accessToken) {
          throw new Error('WhatsApp Cloud API requires phoneNumberId and accessToken.');
        }

        const response = await fetchImpl(
          `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }

        if (!response.ok) {
          const metaError = body?.error ?? {};
          const error = new Error(
            safeErrorMessage(
              metaError.message,
              `WhatsApp Cloud API request failed with status ${response.status}.`,
            ),
          );
          error.code = metaError.code ?? `HTTP_${response.status}`;
          return { success: false, error: error.message, code: error.code };
        }

        return {
          success: true,
          verifiedName: body?.verified_name ?? body?.display_name ?? null,
          displayPhoneNumber: body?.display_phone_number ?? null,
        };
      } catch (error) {
        return {
          success: false,
          error: safeErrorMessage(error?.message, 'WhatsApp Cloud API request failed.'),
          code: error?.code ?? 'WHATSAPP_CLIENT_ERROR',
        };
      }
    },

    async send({ phoneNumberId, accessToken, to, payload }) {
      try {
        validateRequest({ phoneNumberId, accessToken, to, payload });
        const formattedPayload = formatPayload(payload);

        const response = await fetchImpl(
          `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messaging_product: 'whatsapp', to, ...formattedPayload }),
          },
        );

        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }

        if (!response.ok) {
          const metaError = body?.error ?? {};
          const error = new Error(
            safeErrorMessage(
              metaError.message,
              `WhatsApp Cloud API request failed with status ${response.status}.`,
            ),
          );
          error.code = metaError.code ?? `HTTP_${response.status}`;
          return { success: false, provider: 'whatsapp', status: 'failed', error: error.message, code: error.code };
        }

        const providerMessageId = body?.messages?.[0]?.id;
        if (!providerMessageId) {
          return {
            success: false,
            provider: 'whatsapp',
            status: 'failed',
            error: 'WhatsApp Cloud API returned no provider message ID.',
            code: 'MISSING_PROVIDER_MESSAGE_ID',
          };
        }

        return {
          success: true,
          provider: 'whatsapp',
          providerMessageId,
          status: 'sent',
          sentAt: new Date().toISOString(),
        };
      } catch (error) {
        return {
          success: false,
          provider: 'whatsapp',
          status: 'failed',
          error: safeErrorMessage(error?.message, 'WhatsApp Cloud API request failed.'),
          code: error?.code ?? 'WHATSAPP_CLIENT_ERROR',
        };
      }
    },
  };
}
