import { createBusinessService } from './businesses.js';
import { createCustomerComebackExclusionService } from './customerComebackExclusions.js';
import { createCustomerService } from './customers.js';
import { createAppointmentService } from './Appointments.js';
import { createPurchaseService } from './purchases.js';
import { createMessageTemplateService } from './messageTemplates.js';
import { createMessageService } from './messages.js';
import { createSimulatedSender } from './simulatedSender.js';
import { createMessageSender } from './messageSender.js';
import { recordSystemMessageEvent } from './messageActivityEvents.js';

const INACTIVITY_PERIODS = new Set([30, 60, 90]);

function normalizeActivityDate(value) {
  if (typeof value !== 'string') return null;

  const trimmedValue = value.trim();
  const datePart = trimmedValue.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);

  if (
    Number.isNaN(calendarDate.valueOf()) ||
    calendarDate.toISOString().slice(0, 10) !== datePart
  ) {
    return null;
  }

  if (trimmedValue === datePart) return datePart;

  if (
    !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(
      trimmedValue
    )
  ) {
    return null;
  }

  const timestampValue = trimmedValue
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  const timestamp = new Date(timestampValue);

  return Number.isNaN(timestamp.valueOf())
    ? null
    : timestamp.toISOString().slice(0, 10);
}

function getCutoffDate(days) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  today.setUTCDate(today.getUTCDate() - days);
  return today.toISOString().slice(0, 10);
}

function isScopedAppointment(appointment, businessId) {
  return (
    appointment.business_id === undefined ||
    appointment.business_id === businessId
  );
}

function findLastActivityDate(purchases, appointments, businessId, customerId) {
  const purchaseDates = (purchases ?? [])
    .filter((purchase) =>
      purchase.business_id === businessId &&
      purchase.customer_id === customerId
    )
    .map((purchase) => normalizeActivityDate(purchase.purchase_date))
    .filter(Boolean);

  const appointmentDates = (appointments ?? [])
    .filter((appointment) =>
      appointment.status === 'completed' &&
      isScopedAppointment(appointment, businessId) &&
      appointment.customer_id === customerId
    )
    .map((appointment) => normalizeActivityDate(appointment.appointment_date))
    .filter(Boolean);

  return [...purchaseDates, ...appointmentDates].sort().at(-1) ?? null;
}

function hasUnresolvedTemplateVariables(messageText) {
  return typeof messageText !== 'string' ||
    !messageText.trim() ||
    /{{|}}/.test(messageText);
}

export function createScheduledMessageProcessor({
  messageService = createMessageService(),
  customerService,
  businessService,
  purchaseService,
  appointmentService,
  messageTemplateService,
  exclusionService,
  activityEventService,
  simulatedSender = createSimulatedSender(),
  messageSender,
  whatsappClient,
  getBusinessProviderConfig,
} = {}) {
  let resolvedCustomerService = customerService;
  let resolvedBusinessService = businessService;
  let resolvedPurchaseService = purchaseService;
  let resolvedAppointmentService = appointmentService;
  let resolvedMessageTemplateService = messageTemplateService;
  let resolvedExclusionService = exclusionService;
  const resolvedMessageSender = messageSender ?? createMessageSender({
    simulatedSender,
    whatsappClient,
    getBusinessProviderConfig,
  });

  async function recordMessageEvent(message, eventType, fields) {
    return recordSystemMessageEvent(
      activityEventService,
      message,
      eventType,
      fields,
    );
  }

  async function rejectCustomerComebackMessage(message, validationError) {
    if (message.source === 'customer_comeback') {
      console.warn('Customer Comeback message rejected before dispatch:', validationError);
    }

    const { data, error } = await messageService.update(message.id, {
      status: 'failed',
    });

    if (!error) {
      const auditResult = await recordMessageEvent(
        message,
        message.source === 'customer_comeback'
          ? 'message.customer_comeback_rejected'
          : 'message.failed',
        {
          before: { status: 'queued' },
          after: { status: 'failed' },
          metadata: {
            ...(message.source ? { source: message.source } : {}),
            reason: validationError,
          },
        },
      );

      if (auditResult.error) {
        return {
          messageId: message.id,
          success: false,
          error: `Message status changed, but its audit event could not be recorded: ${auditResult.error.message}`,
          message: data,
        };
      }
    }

    return {
      messageId: message.id,
      success: false,
      error: error?.message ?? validationError,
      message: data,
    };
  }

  async function validateCustomerComebackMessage(message) {
    const inactivityDays = message.metadata?.inactivity_days;

    if (!Number.isInteger(inactivityDays) || !INACTIVITY_PERIODS.has(inactivityDays)) {
      return 'Customer Comeback inactivity period is invalid.';
    }

    if (!message.template_id) {
      return 'Customer Comeback template relationship is invalid.';
    }

    resolvedBusinessService ??= createBusinessService();
    resolvedPurchaseService ??= createPurchaseService();
    resolvedAppointmentService ??= createAppointmentService();
    resolvedMessageTemplateService ??= createMessageTemplateService();
    resolvedExclusionService ??= createCustomerComebackExclusionService();

    const businessResult = await resolvedBusinessService.findById(message.business_id);
    if (businessResult.error) throw businessResult.error;
    if (!businessResult.data || businessResult.data.id !== message.business_id) {
      return 'Customer Comeback business relationship is invalid.';
    }

    const exclusionResult = await resolvedExclusionService.listByBusinessId(
      message.business_id
    );
    if (exclusionResult.error) throw exclusionResult.error;
    if ((exclusionResult.data ?? []).some((exclusion) =>
      exclusion.business_id === message.business_id &&
      exclusion.customer_id === message.customer_id
    )) {
      return 'Customer is excluded from Customer Comeback messages.';
    }

    const [purchaseResult, appointmentResult, templateResult] = await Promise.all([
      resolvedPurchaseService.list({
        businessId: message.business_id,
        customerId: message.customer_id,
      }),
      resolvedAppointmentService.listCompletedByBusinessId(message.business_id),
      resolvedMessageTemplateService.findById(
        message.template_id,
        message.business_id
      ),
    ]);

    if (purchaseResult.error) throw purchaseResult.error;
    if (appointmentResult.error) throw appointmentResult.error;
    if (templateResult.error) throw templateResult.error;
    if (!templateResult.data || templateResult.data.business_id !== message.business_id) {
      return 'Customer Comeback template relationship is invalid.';
    }
    if (hasUnresolvedTemplateVariables(message.message_text)) {
      return 'Customer Comeback message content is invalid.';
    }

    const lastActivityDate = findLastActivityDate(
      purchaseResult.data,
      appointmentResult.data,
      message.business_id,
      message.customer_id
    );

    if (!lastActivityDate || lastActivityDate >= getCutoffDate(inactivityDays)) {
      return 'Customer is no longer eligible for the selected inactivity period.';
    }

    return null;
  }

  return {
    async processDueMessages() {
      const now = new Date().toISOString();
      const { data: messages, error } =
        await messageService.listDueQueued(now);

      if (error) {
        throw new Error(
          `Unable to fetch due queued messages: ${error.message}`
        );
      }

      const results = [];

      for (const message of messages ?? []) {
        try {
          let validationError = null;
          let recipientPhone = null;

          if (!message.customer_id || !message.business_id) {
            validationError = 'Message customer relationship is invalid.';
          } else {
            resolvedCustomerService ??= createCustomerService();

            const customerResult = await resolvedCustomerService.findById(
              message.customer_id,
              message.business_id
            );

            if (customerResult.error) throw customerResult.error;

            const customer = customerResult.data;

            if (!customer || customer.business_id !== message.business_id) {
              validationError = 'Message customer relationship is invalid.';
            } else if (customer.consent_given !== true) {
              validationError =
                'Customer has not provided consent to receive messages.';
            } else {
              recipientPhone = customer.phone;
            }
          }

          if (!validationError && message.source === 'customer_comeback') {
            validationError = await validateCustomerComebackMessage(message);
          }

          if (validationError) {
            results.push(
              await rejectCustomerComebackMessage(message, validationError)
            );
            continue;
          }

          const sendResult = await resolvedMessageSender.send(message, {
            recipientPhone,
          });

          const updateValues = sendResult.success
            ? {
                status: 'sent',
                sent_at: sendResult.sentAt,
                ...(sendResult.metadata ? { metadata: sendResult.metadata } : {}),
              }
            : {
                status: 'failed',
              };

          const { data, error: updateError } =
            await messageService.update(message.id, updateValues);

          let auditError = null;
          if (!updateError) {
            const auditResult = await recordMessageEvent(
              message,
              sendResult.success ? 'message.sent' : 'message.failed',
              {
                before: { status: 'queued' },
                after: {
                  status: sendResult.success ? 'sent' : 'failed',
                  ...(sendResult.success && sendResult.sentAt
                    ? { sent_at: sendResult.sentAt }
                    : {}),
                },
                metadata: {
                  ...(message.source ? { source: message.source } : {}),
                },
              },
            );
            auditError = auditResult.error;
          }

          results.push({
            messageId: message.id,
            success: sendResult.success && !updateError && !auditError,
            error:
              updateError?.message ??
              (auditError
                ? 'Message status changed, but its audit event could not be recorded.'
                : null) ??
              sendResult.error ??
              null,
            message: data,
          });
        } catch (error) {
          if (message.source === 'customer_comeback') {
            const safeValidationError =
              'Customer Comeback validation could not be completed safely.';
            let updateResult;

            try {
              updateResult = await messageService.update(message.id, {
                status: 'failed',
              });
            } catch {
              updateResult = { data: null };
            }

            const auditResult = await recordMessageEvent(
              message,
              'message.customer_comeback_rejected',
              {
                before: { status: 'queued' },
                after: { status: 'failed' },
                metadata: { source: 'customer_comeback', reason: safeValidationError },
              },
            );

            results.push({
              messageId: message.id,
              success: false,
              error: auditResult.error?.message ?? safeValidationError,
              message: updateResult.data,
            });
            continue;
          }

          results.push({
            messageId: message.id,
            success: false,
            error: error.message,
          });
        }
      }

      return results;
    },
  };
}
