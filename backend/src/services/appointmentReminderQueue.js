import { recordSystemMessageEvent } from './messageActivityEvents.js';

export async function queueAppointmentReminder({
  appointment,
  now = new Date().toISOString(),
  force = false,
  businessService,
  customerService,
  messageTemplateService,
  messageService,
  activityEventService,
}) {
  if (appointment.status !== 'scheduled') {
    return { status: 'skipped', reason: 'appointment_not_scheduled' };
  }

  if (appointment.reminder_enabled !== true) {
    return { status: 'skipped', reason: 'reminder_disabled' };
  }

  if (!appointment.template_id) {
    return { status: 'skipped', reason: 'template_missing' };
  }

  const nowDate = new Date(now);
  const appointmentDateTime = new Date(
    `${appointment.appointment_date}T${appointment.appointment_time}`,
  );

  if (Number.isNaN(appointmentDateTime.getTime())) {
    return { status: 'skipped', reason: 'invalid_appointment_datetime' };
  }

  if (appointmentDateTime <= nowDate) {
    return { status: force ? 'skipped' : 'not_due', ...(force ? { reason: 'appointment_in_past' } : {}) };
  }

  const reminderAt = force
    ? nowDate
    : new Date(
      appointmentDateTime.getTime() -
        Number(appointment.reminder_minutes ?? 1440) * 60_000,
    );

  if (!force && reminderAt > nowDate) {
    return { status: 'not_due' };
  }

  const existingResult = await messageService.findByAppointmentId(
    appointment.id,
    appointment.business_id,
  );
  if (existingResult.error) throw existingResult.error;
  if (existingResult.data) {
    return { status: 'already_queued' };
  }

  const customerResult = await customerService.findById(
    appointment.customer_id,
    appointment.business_id,
  );
  if (customerResult.error) throw customerResult.error;
  if (!customerResult.data) throw new Error('Appointment customer not found.');
  if (customerResult.data.consent_given !== true) {
    return { status: 'skipped', reason: 'no_consent' };
  }

  const businessResult = await businessService.findById(appointment.business_id);
  if (businessResult.error) throw businessResult.error;
  if (!businessResult.data) throw new Error('Appointment business not found.');

  const templateResult = await messageTemplateService.findById(
    appointment.template_id,
    appointment.business_id,
  );
  if (templateResult.error) throw templateResult.error;
  if (!templateResult.data) throw new Error('Appointment reminder template not found.');

  const variables = {
    customer_name: customerResult.data.name || '',
    business_name: businessResult.data.name || '',
    appointment_date: appointment.appointment_date,
    appointment_time: String(appointment.appointment_time || '').slice(0, 5),
    appointment_type: appointment.appointment_type || '',
  };
  const messageText = templateResult.data.message.replace(
    /\{\{\s*([a-z_]+)\s*\}\}/g,
    (match, name) => Object.hasOwn(variables, name) ? variables[name] : match,
  );

  const templateMetadata = templateResult.data.metadata &&
    typeof templateResult.data.metadata === 'object'
    ? templateResult.data.metadata
    : {};
  const buttons = Array.isArray(templateMetadata.buttons)
    ? templateMetadata.buttons.map((button, index) => ({
        ...button,
        ...(button.type === 'quick_reply'
          ? {
              payload: button.payload || (
                /confirm/i.test(button.text || '')
                  ? `CONFIRM_APPT_${appointment.id}`
                  : `APPT_REPLY_${appointment.id}_${index}`
              ),
            }
          : {}),
      }))
    : [];
  const queuedMetadata = {
    ...templateMetadata,
    appointment_id: appointment.id,
    ...(buttons.length ? { buttons } : {}),
  };

  const messageResult = await messageService.create({
    business_id: appointment.business_id,
    customer_id: appointment.customer_id,
    campaign_id: null,
    appointment_id: appointment.id,
    template_id: templateResult.data.id,
    message_text: messageText,
    source: 'appointment_reminder',
    status: 'queued',
    scheduled_at: reminderAt.toISOString(),
    metadata: queuedMetadata,
  });

  if (messageResult.error) {
    if (messageResult.error.code === '23505') {
      return { status: 'already_queued' };
    }
    throw messageResult.error;
  }

  const auditResult = await recordSystemMessageEvent(
    activityEventService,
    messageResult.data,
    'message.queued',
    {
      after: { status: 'queued' },
      metadata: { source: 'appointment_reminder' },
    },
  );
  if (auditResult.error) throw auditResult.error;

  return {
    status: 'queued',
    messageId: messageResult.data.id,
  };
}
