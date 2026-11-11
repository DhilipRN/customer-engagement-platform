export function buildAppointmentRemindersUrl(businessId) {
  return `http://localhost:3000/appointments/reminders?business_id=${encodeURIComponent(
    businessId,
  )}`;
}

export function formatReminderTiming(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0) return 'Timing unavailable';
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'} before`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
  return `${minutes} minutes before`;
}

export function getReminderDisplay(appointment, statusByAppointmentId) {
  if (!appointment.reminder_enabled) {
    return { status: 'Disabled', timestamp: null, timestampLabel: null };
  }

  const message = statusByAppointmentId.get(appointment.id);
  if (!message) {
    return { status: 'Configured', timestamp: null, timestampLabel: null };
  }

  const timestamp = message.sent_at || message.scheduled_at || message.created_at || null;
  const timestampLabel = message.sent_at
    ? 'Sent'
    : message.scheduled_at
      ? 'Scheduled'
      : message.created_at
        ? 'Created'
        : null;

  return {
    status: message.status || 'Status unavailable',
    timestamp,
    timestampLabel,
  };
}

export function indexReminderStatuses(statuses) {
  const indexed = new Map();
  for (const status of statuses || []) {
    if (status?.appointment_id && !indexed.has(status.appointment_id)) {
      indexed.set(status.appointment_id, status);
    }
  }
  return indexed;
}
