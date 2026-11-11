const CUSTOMER_API_BASE_URL = 'http://localhost:3000';

export function buildCustomerDetailsUrl(customer) {
  return `${CUSTOMER_API_BASE_URL}/customers/${encodeURIComponent(
    customer.id,
  )}?business_id=${encodeURIComponent(customer.business_id)}`;
}

export function buildCustomerAppointmentsUrl(customer) {
  return `${CUSTOMER_API_BASE_URL}/appointments?business_id=${encodeURIComponent(
    customer.business_id,
  )}&customer_id=${encodeURIComponent(customer.id)}`;
}

export function buildCustomerTimelineUrl(customer) {
  return `${CUSTOMER_API_BASE_URL}/customers/${encodeURIComponent(
    customer.id,
  )}/timeline?business_id=${encodeURIComponent(
    customer.business_id,
  )}&page=1&limit=50`;
}

function appointmentTimestamp(appointment) {
  const date = String(appointment?.appointment_date || '').trim();
  const time = String(appointment?.appointment_time || '00:00').trim();
  const timestamp = Date.parse(`${date}T${time}Z`);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function splitCustomerAppointments(appointments, now = new Date()) {
  const nowTimestamp = now instanceof Date ? now.getTime() : Date.parse(now);
  const upcoming = [];
  const past = [];

  for (const appointment of appointments || []) {
    const timestamp = appointmentTimestamp(appointment);
    const isUpcoming =
      appointment.status === 'scheduled' &&
      timestamp !== null &&
      timestamp >= nowTimestamp;
    (isUpcoming ? upcoming : past).push(appointment);
  }

  return { upcoming, past };
}

export function formatAppointmentTime(value) {
  const time = String(value || '').trim();
  return time ? time.slice(0, 5) : 'Time unavailable';
}

export function formatTimelineTime(value) {
  const timestamp = Date.parse(value || '');
  if (Number.isNaN(timestamp)) return 'Time unavailable';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(timestamp));
}

export function getMessageHistoryDisplay(item) {
  if (item?.type === 'message') {
    const message = item.message || {};
    return {
      content: message.message_text || (
        message.template_id ? `Template ${message.template_id}` : 'Message'
      ),
      channel: message.source || 'Message',
      status: message.status || 'Status unavailable',
      timestamp: item.timestamp || null,
    };
  }

  return {
    content: item?.label || 'Activity',
    channel: 'Activity',
    status: item?.activity?.metadata?.status || 'Recorded',
    timestamp: item?.timestamp || null,
  };
}

export function getCustomerDetailsDisplay(customer) {
  return {
    name: customer?.name || '—',
    phone: customer?.phone || '—',
    email: customer?.email || '—',
    consent: customer?.consent_given === true ? 'Given' : 'Not given',
    registered: customer?.created_at || null,
  };
}
