export const CUSTOMER_ACTIVITY_FILTERS = Object.freeze([
  { value: 'all', label: 'All Customers' },
  { value: 'active', label: 'Active (0–14 days)' },
  { value: 'inactive_15_29', label: 'Inactive (15–29 days)' },
  { value: 'inactive_30', label: 'Inactive 30+ Days' },
  { value: 'never_active', label: 'Never Active' },
  { value: 'upcoming_appointment', label: 'Upcoming Appointment' },
  { value: 'no_upcoming_appointment', label: 'No Upcoming Appointment' },
  { value: 'consent_given', label: 'Consent Given' },
]);

export const CUSTOMER_SORT_COLUMNS = Object.freeze([
  'name',
  'phone',
  'email',
  'consent_given',
  'last_purchase_date',
  'last_completed_appointment_date',
  'inactive_days',
  'next_appointment_date',
  'created_at',
]);

export function getCustomerListingColumns(showEmailColumn = false) {
  const columns = [
    'name',
    'business',
    'phone',
    'consent_given',
    'last_purchase_date',
    'last_completed_appointment_date',
    'inactive_days',
    'next_appointment_date',
    'actions',
  ];

  if (showEmailColumn) {
    columns.splice(3, 0, 'email');
  }

  return columns;
}

export const DEFAULT_CUSTOMER_SORT_KEY = 'created_at';
export const DEFAULT_CUSTOMER_SORT_DIRECTION = 'desc';

export function getInactiveStatus(inactiveDays) {
  if (!Number.isFinite(inactiveDays)) return 'never';
  if (inactiveDays >= 30) return 'inactive';
  if (inactiveDays >= 15) return 'idle';
  return 'active';
}

export function summarizeCustomerActivity(customers) {
  return customers.reduce((summary, customer) => {
    const status = getInactiveStatus(customer.inactive_days);
    summary.total += 1;
    if (status === 'active') summary.active += 1;
    if (status === 'idle') summary.inactive15to29 += 1;
    if (status === 'inactive') summary.inactive30 += 1;
    if (status === 'never') summary.neverActive += 1;
    return summary;
  }, {
    total: 0,
    active: 0,
    inactive15to29: 0,
    inactive30: 0,
    neverActive: 0,
  });
}

export function getCustomerInitials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function nextCustomerSort(key, currentKey, currentDirection) {
  if (currentKey !== key) {
    return { sortKey: key, sortDirection: 'asc' };
  }

  if (currentDirection === 'asc') {
    return { sortKey: key, sortDirection: 'desc' };
  }

  return {
    sortKey: '',
    sortDirection: DEFAULT_CUSTOMER_SORT_DIRECTION,
  };
}

function dateSortValue(value) {
  if (!value) return null;

  const timestamp = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? `${value}T00:00:00.000Z`
      : value
  ).valueOf();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function sortValue(customer, key) {
  if (key === 'consent_given') return customer.consent_given === true ? 1 : 0;
  if (key === 'inactive_days') {
    return Number.isFinite(customer.inactive_days)
      ? Math.max(0, customer.inactive_days)
      : null;
  }
  if (key === 'last_purchase_date' ||
      key === 'last_completed_appointment_date' ||
      key === 'next_appointment_date' ||
      key === 'created_at') {
    if (key === 'next_appointment_date') {
      const date = customer.next_appointment_date;
      const time = customer.next_appointment_time || '00:00:00';
      return dateSortValue(date ? `${date}T${time}` : null);
    }
    return dateSortValue(customer[key]);
  }

  return String(customer[key] ?? '').trim().toLowerCase() || null;
}

export function filterCustomersByActivity(customers, filter) {
  if (filter === 'consent_given') {
    return customers.filter((customer) => customer.consent_given === true);
  }

  if (filter === 'never_active') {
    return customers.filter((customer) => customer.inactive_days === null ||
      customer.inactive_days === undefined);
  }

  if (filter === 'active') {
    return customers.filter((customer) => (
      Number.isFinite(customer.inactive_days) && customer.inactive_days <= 14
    ));
  }

  if (filter === 'inactive_15_29') {
    return customers.filter((customer) => (
      Number.isFinite(customer.inactive_days) &&
      customer.inactive_days >= 15 &&
      customer.inactive_days <= 29
    ));
  }

  if (filter === 'upcoming_appointment') {
    return customers.filter((customer) => Boolean(customer.next_appointment_date));
  }

  if (filter === 'no_upcoming_appointment') {
    return customers.filter((customer) => !customer.next_appointment_date);
  }

  if (filter === 'inactive_30' || filter === 'inactive_90') {
    const threshold = filter === 'inactive_30' ? 30 : 90;
    return customers.filter((customer) => (
      Number.isFinite(customer.inactive_days) &&
      customer.inactive_days >= threshold
    ));
  }

  return customers;
}

export function sortCustomers(customers, sortKey, sortDirection = 'asc') {
  if (!sortKey || !CUSTOMER_SORT_COLUMNS.includes(sortKey)) return customers;

  const direction = sortDirection === 'desc' ? -1 : 1;

  return customers
    .map((customer, index) => ({ customer, index, value: sortValue(customer, sortKey) }))
    .sort((left, right) => {
      const leftEmpty = left.value === null;
      const rightEmpty = right.value === null;

      if (leftEmpty || rightEmpty) {
        if (leftEmpty && rightEmpty) return left.index - right.index;
        return leftEmpty ? 1 : -1;
      }

      if (left.value === right.value) return left.index - right.index;

      return (left.value > right.value ? 1 : -1) * direction;
    })
    .map(({ customer }) => customer);
}

export function formatCustomerActivityDate(value) {
  const timestamp = dateSortValue(value);
  if (timestamp === null) return '-';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp));
}

export function formatNextAppointment(customer) {
  if (!customer.next_appointment_date) return 'No upcoming appointment';

  const date = formatCustomerActivityDate(customer.next_appointment_date);
  const time = String(customer.next_appointment_time ?? '').trim();
  return time ? `${date}, ${time.slice(0, 5)}` : date;
}

export function formatInactiveDays(customer) {
  if (!Number.isFinite(customer.inactive_days)) return 'Never active';
  return `${Math.max(0, customer.inactive_days)} days`;
}
