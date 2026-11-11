import { Router } from 'express';
import { createCustomerService } from '../services/customers.js';
import { createMessageService } from '../services/messages.js';
import { recordSystemMessageEvent } from '../services/messageActivityEvents.js';
import { getWhatsAppWebhookConfig } from '../config/env.js';

const STATUS_VALUES = new Set(['sent', 'delivered', 'read', 'failed']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unixSecondsToIso(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function getWebhookChanges(body) {
  if (!isObject(body) || !Array.isArray(body.entry)) return [];

  return body.entry.flatMap((entry) =>
    Array.isArray(entry?.changes)
      ? entry.changes
        .map((change) => change?.value)
        .filter(isObject)
      : []
  );
}

function getMessageText(message) {
  if (message?.type === 'text' && typeof message.text?.body === 'string') {
    return message.text.body;
  }

  if (typeof message?.text?.body === 'string') return message.text.body;
  if (message?.type === 'interactive' && typeof message.interactive?.button_reply?.title === 'string') {
    return message.interactive.button_reply.title;
  }
  return null;
}

function getButtonReply(message) {
  const reply = message?.type === 'interactive' ? message.interactive?.button_reply : null;
  if (!reply || typeof reply.id !== 'string' || typeof reply.title !== 'string') return null;
  return { id: reply.id, title: reply.title };
}

export function createWhatsAppWebhooksRouter({
  messageService,
  customerService,
  activityEventService,
  verifyToken = getWhatsAppWebhookConfig().verifyToken,
  getBusinessIdForPhoneNumberId = async () => getWhatsAppWebhookConfig().businessId,
  logger = console,
} = {}) {
  const router = Router();
  let resolvedMessageService = messageService;
  let resolvedCustomerService = customerService;

  const messages = () => (resolvedMessageService ??= createMessageService());
  const customers = () => (resolvedCustomerService ??= createCustomerService());

  async function recordStatusUpdate(statusUpdate) {
    const providerMessageId = statusUpdate?.id;
    const status = statusUpdate?.status;
    if (!providerMessageId || !STATUS_VALUES.has(status)) return;

    const existing = await messages().findByProviderMessageId(providerMessageId);
    if (existing.error) throw existing.error;
    if (!existing.data) return;

    const updateValues = {
      status,
      ...(status === 'failed'
        ? {
            metadata: {
              ...(existing.data.metadata ?? {}),
              providerMessageId,
              providerErrorCode: statusUpdate.errors?.[0]?.code ?? null,
              providerErrorReason: statusUpdate.errors?.[0]?.title ??
                statusUpdate.errors?.[0]?.message ?? null,
            },
          }
        : {}),
    };

    const updated = await messages().update(
      existing.data.id,
      updateValues,
      existing.data.business_id,
    );
    if (updated.error) throw updated.error;

    const auditResult = await recordSystemMessageEvent(
      activityEventService,
      existing.data,
      `message.${status}`,
      {
        before: { status: existing.data.status },
        after: { status },
        metadata: {
          providerMessageId,
          ...(status === 'failed'
            ? {
                errorCode: statusUpdate.errors?.[0]?.code ?? null,
                errorReason: statusUpdate.errors?.[0]?.title ??
                  statusUpdate.errors?.[0]?.message ?? null,
              }
            : {}),
        },
      },
    );

    if (auditResult.error) {
      logger.error('Unable to record WhatsApp message status activity event:', auditResult.error.message);
    }
  }

  async function recordIncomingMessage(incomingMessage, phoneNumberId) {
    const from = incomingMessage?.from;
    const messageText = getMessageText(incomingMessage);
    if (!from || !messageText || !incomingMessage.id) return;

    const businessId = await getBusinessIdForPhoneNumberId(phoneNumberId);
    if (!businessId) return;

    const customerResult = await customers().findByBusinessIdAndPhone(businessId, from);
    if (customerResult.error) throw customerResult.error;
    if (!customerResult.data?.id) return;

    const receivedAt = unixSecondsToIso(incomingMessage.timestamp);
    const buttonReply = getButtonReply(incomingMessage);
    const created = await messages().create({
      business_id: businessId,
      customer_id: customerResult.data.id,
      message_text: messageText,
      status: 'delivered',
      source: 'whatsapp_inbound',
      ...(receivedAt ? { sent_at: receivedAt } : {}),
      metadata: {
        providerMessageId: incomingMessage.id,
        channel: 'whatsapp',
        ...(receivedAt ? { receivedAt } : {}),
        ...(buttonReply
          ? {
              buttonReplyId: buttonReply.id,
              buttonReplyTitle: buttonReply.title,
            }
          : {}),
      },
    });
    if (created.error) throw created.error;

    if (buttonReply?.id.startsWith('CONFIRM_APPT_')) {
      const appointmentId = buttonReply.id.slice('CONFIRM_APPT_'.length);
      if (!activityEventService || !UUID_PATTERN.test(appointmentId)) return;

      try {
        const auditResult = await activityEventService.create({
          scope_type: 'business',
          business_id: businessId,
          actor_user_id: null,
          actor_type: 'system',
          event_type: 'appointment.confirmed',
          entity_type: 'appointment',
          entity_id: appointmentId,
          customer_id: customerResult.data.id,
          is_reconstructed: false,
          visibility: 'audit_only',
          metadata: {
            source: 'whatsapp_inbound',
            button_id: buttonReply.id,
            button_title: buttonReply.title,
          },
        });
        if (auditResult?.error) {
          logger.error('Unable to record appointment confirmation activity event:', auditResult.error.message);
        }
      } catch (error) {
        logger.error('Unable to record appointment confirmation activity event:', error.message);
      }
    }
  }

  async function processNotification(body) {
    for (const value of getWebhookChanges(body)) {
      const phoneNumberId = value.metadata?.phone_number_id ?? null;

      for (const statusUpdate of value.statuses ?? []) {
        await recordStatusUpdate(statusUpdate);
      }

      for (const incomingMessage of value.messages ?? []) {
        await recordIncomingMessage(incomingMessage, phoneNumberId);
      }
    }
  }

  router.get('/', (request, response) => {
    const mode = request.query['hub.mode'];
    const challenge = request.query['hub.challenge'];
    const token = request.query['hub.verify_token'];

    if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
      return response.type('text/plain').status(200).send(challenge);
    }

    return response.status(403).send('Forbidden');
  });

  router.post('/', (request, response) => {
    response.sendStatus(200);
    void processNotification(request.body).catch((error) => {
      logger.error('WhatsApp webhook processing failed:', error.message);
    });
  });

  return router;
}
