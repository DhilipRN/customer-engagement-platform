export function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function findPatientsByPhone(customers, businessId, phone) {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!businessId || !normalizedPhone) return [];

  return customers.filter((customer) => (
    customer.business_id === businessId &&
    normalizePhoneNumber(customer.phone).includes(normalizedPhone)
  ));
}

export function buildNewPatientPayload(form, businessId) {
  return {
    ...form,
    business_id: businessId,
    phone: normalizePhoneNumber(form.phone),
  };
}

export function selectAppointmentPatient(appointment, customer) {
  return {
    ...appointment,
    customer_id: customer.id,
  };
}

export function createAppointmentCustomerLookup(customers) {
  return new Map(
    customers.map((customer) => [
      `${customer.business_id}:${customer.id}`,
      customer,
    ]),
  );
}

export function getAppointmentCustomer(appointment, customerLookup) {
  return customerLookup.get(
    `${appointment.business_id}:${appointment.customer_id}`,
  ) || null;
}
