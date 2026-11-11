import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';

function getTemplateCategory(template) {
  return template?.metadata?.meta_category || template?.category || 'other';
}

function formatTemplateOption(template) {
  const category = getTemplateCategory(template);
  return `[${category.charAt(0).toUpperCase()}${category.slice(1)}] ${template.name}`;
}
import {
  buildAppointmentRemindersUrl,
  formatReminderTiming,
  getReminderDisplay,
  indexReminderStatuses,
} from '../appointmentReminders';
import {
  buildNewPatientPayload,
  createAppointmentCustomerLookup,
  findPatientsByPhone,
  getAppointmentCustomer,
  normalizePhoneNumber,
  selectAppointmentPatient,
} from '../appointmentPatient';

function Appointments({
  businesses,
  customers,
  messageTemplates,
  appointments,
  appointmentLoading,
  appointmentError,
  newAppointment,
  setNewAppointment,
  appointmentSubmitting,
  appointmentMessage,
  handleAddAppointment,
  handleCreateCustomer,
  editingAppointment,
  editAppointmentForm,
  setEditAppointmentForm,
  templateLoading,
  templateError,
  appointmentActionLoading,
  handleEditAppointment,
  handleUpdateReminderSettings,
  setEditingAppointment,
  startEditingAppointment,
  handleCancelAppointment,
}) {
  const [appointmentView, setAppointmentView] = useState('appointments');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [patientPhone, setPatientPhone] = useState('');
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [patientLookupMessage, setPatientLookupMessage] = useState('');
  const [newPatientForm, setNewPatientForm] = useState({
    name: '',
    phone: '',
    email: '',
    consent_given: false,
  });
  const [reminderStatuses, setReminderStatuses] = useState([]);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderError, setReminderError] = useState('');
  const [selectedReminderIds, setSelectedReminderIds] = useState([]);
  const [reminderReviewOpen, setReminderReviewOpen] = useState(false);
  const [bulkReminderSubmitting, setBulkReminderSubmitting] = useState(false);
  const [bulkReminderResult, setBulkReminderResult] = useState(null);
  const [bulkReminderError, setBulkReminderError] = useState('');

  const pageSize = 15;

  useEffect(() => {
    const controller = new AbortController();

    async function loadReminderStatuses() {
      if (businesses.length === 0) {
        setReminderStatuses([]);
        setReminderLoading(false);
        return;
      }

      setReminderLoading(true);
      setReminderError('');

      try {
        const responses = await Promise.all(
          businesses.map((business) =>
            apiFetch(buildAppointmentRemindersUrl(business.id), {
              signal: controller.signal,
            })
          ),
        );

        if (responses.some((response) => !response.ok)) {
          throw new Error('Unable to load reminder statuses.');
        }

        const results = await Promise.all(
          responses.map((response) => response.json()),
        );
        setReminderStatuses(results.flatMap((result) => result.data ?? []));
      } catch (error) {
        if (error.name !== 'AbortError') {
          setReminderError(error.message || 'Unable to load reminder statuses.');
        }
      } finally {
        if (!controller.signal.aborted) setReminderLoading(false);
      }
    }

    loadReminderStatuses();
    return () => controller.abort();
  }, [businesses]);

  const customerLookup = useMemo(
    () => createAppointmentCustomerLookup(customers),
    [customers],
  );

  const filteredAppointments = appointments.filter((appointment) => {
    const search = searchTerm.trim().toLowerCase();
    const customer = getAppointmentCustomer(appointment, customerLookup);

    const appointmentDate = appointment.appointment_date
      ? new Date(appointment.appointment_date).toLocaleDateString()
      : '';

    return (
      String(customer?.name || '').toLowerCase().includes(search) ||
      String(appointment.customerName || '').toLowerCase().includes(search) ||
      String(customer?.phone || '').toLowerCase().includes(search) ||
      String(appointment.businessName || '').toLowerCase().includes(search) ||
      String(appointment.appointment_type || '')
        .toLowerCase()
        .includes(search) ||
      String(appointment.appointment_date || '')
        .toLowerCase()
        .includes(search) ||
      appointmentDate.toLowerCase().includes(search) ||
      String(appointment.appointment_time || '')
        .toLowerCase()
        .includes(search) ||
      String(appointment.status || '').toLowerCase().includes(search) ||
      (appointment.reminder_enabled ? 'enabled' : 'disabled').includes(search)
    );
  });

  const totalAppointments = filteredAppointments.length;

  const totalPages = Math.max(
    1,
    Math.ceil(totalAppointments / pageSize)
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;

  const paginatedAppointments = filteredAppointments.slice(
    startIndex,
    startIndex + pageSize
  );

  const selectedTemplate = messageTemplates.find(
    (template) => template.id === newAppointment.template_id
  );
  const editingBusinessTemplates = messageTemplates.filter(
    (template) => template.business_id === editingAppointment?.business_id,
  );
  const editingTemplateAvailable = editingBusinessTemplates.some(
    (template) => template.id === editAppointmentForm.template_id,
  );
  const statusByAppointmentId = useMemo(
    () => indexReminderStatuses(reminderStatuses),
    [reminderStatuses],
  );
  const eligibleReminderAppointments = filteredAppointments.filter(
    (appointment) => (
      appointment.status === 'scheduled' &&
      appointment.reminder_enabled === true &&
      Boolean(appointment.template_id)
    ),
  );
  const selectedReminderAppointments = eligibleReminderAppointments.filter(
    (appointment) => selectedReminderIds.includes(appointment.id),
  );
  const allEligibleRemindersSelected = eligibleReminderAppointments.length > 0 &&
    eligibleReminderAppointments.every((appointment) => selectedReminderIds.includes(appointment.id));

  const matchingPatients = useMemo(
    () => findPatientsByPhone(customers, newAppointment.business_id, patientPhone),
    [customers, newAppointment.business_id, patientPhone],
  );

  const selectPatient = (customer) => {
    setNewAppointment(selectAppointmentPatient(newAppointment, customer));
    setPatientPhone(customer.phone || '');
    setPatientLookupMessage(`Selected ${customer.name}.`);
    setShowNewPatientForm(false);
  };

  const handleNewPatient = async () => {
    if (!newAppointment.business_id) return;

    setPatientLookupMessage('');

    try {
      const customer = await handleCreateCustomer(
        buildNewPatientPayload(newPatientForm, newAppointment.business_id),
      );

      selectPatient(customer);
      setNewPatientForm({
        name: '',
        phone: '',
        email: '',
        consent_given: false,
      });
      setPatientLookupMessage(`${customer.name} added and selected.`);
    } catch (error) {
      setPatientLookupMessage(error.message || 'Unable to create customer.');
    }
  };

  const toggleReminderSelection = (appointmentId) => {
    setSelectedReminderIds((current) => (
      current.includes(appointmentId)
        ? current.filter((id) => id !== appointmentId)
        : [...current, appointmentId]
    ));
  };

  const toggleAllReminderSelection = () => {
    setSelectedReminderIds(allEligibleRemindersSelected
      ? []
      : eligibleReminderAppointments.map((appointment) => appointment.id));
  };

  const submitBulkReminders = async () => {
    if (selectedReminderIds.length === 0 || bulkReminderSubmitting) return;

    setBulkReminderSubmitting(true);
    setBulkReminderError('');

    try {
      const response = await apiFetch('http://localhost:3000/appointments/reminders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_ids: selectedReminderIds }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.errors?.join(', ') || 'Unable to send reminders.');
      }

      setBulkReminderResult(result.data ?? null);
      setSelectedReminderIds([]);
      setReminderReviewOpen(false);
    } catch (error) {
      setBulkReminderError(error.message || 'Unable to send reminders.');
    } finally {
      setBulkReminderSubmitting(false);
    }
  };

const requiredLabel = (text) => (
  <span>
    {text} <span aria-hidden="true">*</span>
  </span>
);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Appointments</h2>
          <p>
            Manage customer appointments and automated reminders.
          </p>
        </div>
      </div>

      <div className="appointment-view-switcher" role="tablist" aria-label="Appointment views">
        <button
          type="button"
          role="tab"
          aria-selected={appointmentView === 'appointments'}
          onClick={() => setAppointmentView('appointments')}
        >
          Appointments
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={appointmentView === 'reminders'}
          onClick={() => setAppointmentView('reminders')}
        >
          Reminders &amp; Confirmations
        </button>
      </div>

      <form
        className="customer-form"
        onSubmit={handleAddAppointment}
      >
        <h3>New Appointment</h3>

        <label>
          {requiredLabel('Business')}

          <select
            value={newAppointment.business_id}
            onChange={(event) => {
              setNewAppointment({
                ...newAppointment,
                business_id: event.target.value,
                customer_id: '',
                template_id: '',
              });
              setPatientPhone('');
              setPatientLookupMessage('');
              setShowNewPatientForm(false);
            }}
            required
          >
            <option value="">Select a business</option>

            {businesses.map((business) => (
              <option
                key={business.id}
                value={business.id}
              >
                {business.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {requiredLabel('Customer')}

          <div className="appointment-patient-lookup">
            <input
              type="tel"
              inputMode="numeric"
              value={patientPhone}
              onChange={(event) => {
                const phone = normalizePhoneNumber(event.target.value).slice(0, 10);
                setPatientPhone(phone);
                setNewAppointment({
                  ...newAppointment,
                  customer_id: '',
                });
                setPatientLookupMessage('');
                setShowNewPatientForm(false);
              }}
              placeholder="Search by phone number"
              disabled={!newAppointment.business_id}
            />

            {patientPhone && matchingPatients.length > 0 && (
              <div className="appointment-patient-matches" role="listbox" aria-label="Matching customers">
                {matchingPatients.map((customer) => (
                  <button
                    className={`appointment-patient-match${newAppointment.customer_id === customer.id ? ' selected' : ''}`}
                    key={customer.id}
                    type="button"
                    role="option"
                    aria-selected={newAppointment.customer_id === customer.id}
                    onClick={() => selectPatient(customer)}
                  >
                    <strong>{customer.name}</strong>
                    <span>{customer.phone}</span>
                  </button>
                ))}
              </div>
            )}

            {patientPhone && matchingPatients.length === 0 && (
              <div className="appointment-patient-empty">
                <span>No customer found for this phone number.</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewPatientForm((form) => ({ ...form, phone: patientPhone }));
                    setShowNewPatientForm(true);
                  }}
                >
                  + Add New Customer
                </button>
              </div>
            )}

            {patientLookupMessage && (
              <span className="appointment-patient-message" role="status">
                {patientLookupMessage}
              </span>
            )}

            {showNewPatientForm && (
              <div className="appointment-new-patient">
                <h4>New Customer</h4>
                <input
                  value={newPatientForm.name}
                  onChange={(event) => setNewPatientForm({ ...newPatientForm, name: event.target.value })}
                  placeholder="Customer name"
                  aria-label="New customer name"
                  required
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={newPatientForm.phone}
                  onChange={(event) => setNewPatientForm({
                    ...newPatientForm,
                    phone: normalizePhoneNumber(event.target.value).slice(0, 10),
                  })}
                  placeholder="Phone number"
                  aria-label="New customer phone"
                  required
                />
                <input
                  type="email"
                  value={newPatientForm.email}
                  onChange={(event) => setNewPatientForm({ ...newPatientForm, email: event.target.value })}
                  placeholder="Email (optional)"
                  aria-label="New customer email"
                />
                <label className="consent-field">
                  <input
                    type="checkbox"
                    checked={newPatientForm.consent_given}
                    onChange={(event) => setNewPatientForm({
                      ...newPatientForm,
                      consent_given: event.target.checked,
                    })}
                  />
                  WhatsApp consent given
                </label>
                <div className="appointment-new-patient-actions">
                  <button type="button" onClick={handleNewPatient}>
                    Create and Select
                  </button>
                  <button type="button" onClick={() => setShowNewPatientForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <select
            value={newAppointment.customer_id}
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                customer_id: event.target.value,
              })
            }
            required
            disabled={!newAppointment.business_id}
          >
            <option value="">Select a customer</option>

            {customers
              .filter(
                (customer) =>
                  customer.business_id ===
                  newAppointment.business_id
              )
              .map((customer) => (
                <option
                  key={customer.id}
                  value={customer.id}
                >
                  {customer.name} — {customer.phone}
                </option>
              ))}
          </select>
        </label>

        <label>
          {requiredLabel('Appointment Date')}

          <input
            type="date"
            value={newAppointment.appointment_date}
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                appointment_date: event.target.value,
              })
            }
            required
          />
        </label>

        <label>
          {requiredLabel('Appointment Time')}

          <input
            type="time"
            value={newAppointment.appointment_time}
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                appointment_time: event.target.value,
              })
            }
            required
          />
        </label>

        {/* Appointment Type + Reminder Template */}
       <div
  style={{
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    width: '100%',
    gridColumn: '1 / -1',
    alignItems: 'start',
  }}
>
          <label>
            {requiredLabel('Appointment Type')}

            <input
              type="text"
              value={newAppointment.appointment_type}
              onChange={(event) =>
                setNewAppointment({
                  ...newAppointment,
                  appointment_type: event.target.value,
                })
              }
              placeholder="Example: Dental Check-up"
              required
            />
          </label>

          <label>
            Reminder Message Template

            <select
              value={newAppointment.template_id}
              onChange={(event) =>
                setNewAppointment({
                  ...newAppointment,
                  template_id: event.target.value,
                })
              }
              disabled={!newAppointment.business_id}
            >
              <option value="">Select a template</option>

              {messageTemplates
                .filter(
                  (template) =>
                    template.business_id ===
                    newAppointment.business_id
                )
                .map((template) => (
                  <option
                    key={template.id}
                    value={template.id}
                  >
                    {formatTemplateOption(template)}
                  </option>
                ))}
            </select>

            {/* Message Preview */}
            <div
              style={{
                marginTop: '8px',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                background: '#f8f8f8',
                maxHeight: '140px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <strong>Message Preview:</strong>

              <div style={{ marginTop: '6px' }}>
                {selectedTemplate?.message ||
                  'Select a template to preview the reminder message.'}
              </div>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={appointmentSubmitting}
          className="primary-button"
        >
          {appointmentSubmitting
            ? 'Creating...'
            : 'Create Appointment'}
        </button>

        {appointmentMessage && (
          <p>{appointmentMessage}</p>
        )}
      </form>

      {editingAppointment && (
        <form
          className="customer-form"
          onSubmit={handleEditAppointment}
        >
          <h3>Edit Appointment</h3>

          <label>
            {requiredLabel('Appointment Date')}

            <input
              type="date"
              value={
                editAppointmentForm.appointment_date
              }
              onChange={(event) =>
                setEditAppointmentForm({
                  ...editAppointmentForm,
                  appointment_date:
                    event.target.value,
                })
              }
              required
            />
          </label>

          <label>
            {requiredLabel('Appointment Time')}

            <input
              type="time"
              value={
                editAppointmentForm.appointment_time
              }
              onChange={(event) =>
                setEditAppointmentForm({
                  ...editAppointmentForm,
                  appointment_time:
                    event.target.value,
                })
              }
              required
            />
          </label>

          <label>
            {requiredLabel('Appointment Type')}

            <input
              type="text"
              value={
                editAppointmentForm.appointment_type
              }
              onChange={(event) =>
                setEditAppointmentForm({
                  ...editAppointmentForm,
                  appointment_type:
                    event.target.value,
                })
              }
              required
            />
          </label>

          <label>
            {requiredLabel('Status')}

            <select
              value={editAppointmentForm.status}
              onChange={(event) =>
                setEditAppointmentForm({
                  ...editAppointmentForm,
                  status: event.target.value,
                })
              }
              required
            >
              <option value="scheduled">
                Scheduled
              </option>

              <option value="completed">
                Completed
              </option>

              <option value="cancelled">
                Cancelled
              </option>

              <option value="no_show">
                No Show
              </option>
            </select>
          </label>

          <label>
            Reminder Message Template

            <select
              value={editAppointmentForm.template_id}
              onChange={(event) =>
                setEditAppointmentForm({
                  ...editAppointmentForm,
                  template_id: event.target.value,
                })
              }
              disabled={templateLoading}
            >
              <option value="">No template</option>

              {templateLoading && (
                <option value="" disabled>
                  Loading templates...
                </option>
              )}

              {!templateLoading && templateError && (
                <option value="" disabled>
                  Templates unavailable
                </option>
              )}

              {!templateLoading && !templateError && editingBusinessTemplates.length === 0 && (
                <option value="" disabled>
                  No templates available for this business
                </option>
              )}

              {editAppointmentForm.template_id && !editingTemplateAvailable && (
                <option value={editAppointmentForm.template_id} disabled>
                  Current template unavailable
                </option>
              )}

              {editingBusinessTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {formatTemplateOption(template)}
                </option>
              ))}
            </select>

            {templateError && (
              <span className="error-message" role="alert">
                {templateError}
              </span>
            )}
          </label>

          <div className="form-actions">
            <button
              type="submit"
              disabled={appointmentActionLoading}
            >
              {appointmentActionLoading
                ? 'Saving...'
                : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={() =>
                setEditingAppointment(null)
              }
              disabled={appointmentActionLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ======================================================
          APPOINTMENT LIST: SEARCH AND PAGINATION
      ====================================================== */}

      {appointmentView === 'reminders' ? (
        <section className="appointment-reminders-view" aria-labelledby="appointment-reminders-title">
          <div className="appointment-reminders-heading">
            <div>
              <h3 id="appointment-reminders-title">Reminders &amp; Confirmations</h3>
              <p>Review reminder configuration and recorded delivery status.</p>
            </div>
            <span className="appointment-confirmation-note">Customer confirmations are not supported yet.</span>
          </div>

          {reminderLoading ? (
            <p role="status">Loading reminder statuses...</p>
          ) : reminderError ? (
            <p className="error-message" role="alert">{reminderError}</p>
          ) : appointments.length === 0 ? (
            <p>No appointments found.</p>
          ) : (
            <>
              <div className="reminder-bulk-toolbar">
                <label className="consent-field">
                  <input
                    type="checkbox"
                    checked={allEligibleRemindersSelected}
                    onChange={toggleAllReminderSelection}
                    disabled={eligibleReminderAppointments.length === 0 || bulkReminderSubmitting}
                  />
                  Select all eligible appointments
                </label>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setReminderReviewOpen(true)}
                  disabled={selectedReminderIds.length === 0 || bulkReminderSubmitting}
                >
                  Send Reminders
                </button>
              </div>

              {bulkReminderError && (
                <p className="error-message" role="alert">{bulkReminderError}</p>
              )}

              {bulkReminderResult && (
                <div className="reminder-bulk-result" role="status">
                  <strong>{bulkReminderResult.queued_count} queued</strong>
                  <span>{bulkReminderResult.skipped_count} skipped</span>
                  {bulkReminderResult.skipped?.length > 0 && (
                    <ul>
                      {bulkReminderResult.skipped.map((item, index) => (
                        <li key={`${item.appointment_id}-${item.reason}-${index}`}>
                          {item.appointment_id}: {item.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {reminderReviewOpen && (
                <div className="reminder-review-panel" role="region" aria-labelledby="reminder-review-title">
                  <h4 id="reminder-review-title">Review selected reminders</h4>
                  <ul>
                    {selectedReminderAppointments.map((appointment) => {
                      const customer = getAppointmentCustomer(appointment, customerLookup);
                      return (
                        <li key={appointment.id}>
                          {customer?.name || 'Unlinked customer'} — {appointment.appointment_date || 'Date unavailable'} {appointment.appointment_time || ''}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={submitBulkReminders}
                      disabled={bulkReminderSubmitting || selectedReminderIds.length === 0}
                    >
                      {bulkReminderSubmitting ? 'Queuing...' : 'Confirm and Send'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReminderReviewOpen(false)}
                      disabled={bulkReminderSubmitting}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>
                      <span className="sr-only">Select</span>
                      <input
                        type="checkbox"
                        checked={allEligibleRemindersSelected}
                        onChange={toggleAllReminderSelection}
                        disabled={eligibleReminderAppointments.length === 0 || bulkReminderSubmitting}
                        aria-label="Select all eligible appointments"
                      />
                    </th>
                    <th>Customer</th>
                    <th>Date &amp; Time</th>
                    <th>Reminder</th>
                    <th>Timing</th>
                    <th>Template</th>
                    <th>Message Status</th>
                    <th>Timestamp</th>
                    <th>Confirmation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map((appointment) => {
                    const customer = getAppointmentCustomer(appointment, customerLookup);
                    const reminder = getReminderDisplay(appointment, statusByAppointmentId);
                    const template = messageTemplates.find(
                      (item) => item.id === appointment.template_id,
                    );

                    return (
                      <tr key={appointment.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedReminderIds.includes(appointment.id)}
                            onChange={() => toggleReminderSelection(appointment.id)}
                            disabled={!eligibleReminderAppointments.some((item) => item.id === appointment.id) || bulkReminderSubmitting}
                            aria-label={`Select reminder for ${customer?.name || 'appointment'}`}
                          />
                        </td>
                        <td>{customer?.name || 'Unlinked customer'}</td>
                        <td>
                          {appointment.appointment_date || '—'}{' '}
                          {appointment.appointment_time || '—'}
                        </td>
                        <td>
                          <label className="consent-field">
                            <input
                              type="checkbox"
                              checked={appointment.reminder_enabled === true}
                              onChange={(event) => handleUpdateReminderSettings(
                                appointment,
                                { reminder_enabled: event.target.checked },
                              )}
                              disabled={bulkReminderSubmitting}
                              aria-label={`Enable reminder for ${customer?.name || 'appointment'}`}
                            />
                            {appointment.reminder_enabled ? 'Enabled' : 'Disabled'}
                          </label>
                        </td>
                        <td>
                          <select
                            value={appointment.reminder_minutes ?? 1440}
                            onChange={(event) => handleUpdateReminderSettings(
                              appointment,
                              { reminder_minutes: Number(event.target.value) },
                            )}
                            disabled={!appointment.reminder_enabled || bulkReminderSubmitting}
                            aria-label={`Reminder timing for ${customer?.name || 'appointment'}`}
                          >
                            <option value="1440">24 hours before</option>
                            <option value="720">12 hours before</option>
                            <option value="120">2 hours before</option>
                            <option value="60">1 hour before</option>
                          </select>
                        </td>
                        <td>{template?.name || (appointment.template_id ? 'Template unavailable' : 'No template')}</td>
                        <td>{reminder.status}</td>
                        <td>{reminder.timestamp ? `${reminder.timestampLabel}: ${new Date(reminder.timestamp).toLocaleString()}` : '—'}</td>
                        <td>Not supported</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}

          {!reminderLoading && !reminderError && appointments.length > 0 && (
            <p className="appointment-reminder-limitation">
              Skipped-for-no-consent outcomes are not persisted by the reminder processor and are not shown as delivery statuses.
            </p>
          )}
        </section>
      ) : appointmentLoading ? (
        <p>Loading appointments...</p>
      ) : appointmentError ? (
        <p className="error-message">
          {appointmentError}
        </p>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="appointment-search">
              Search Appointments
            </label>

            <input
              id="appointment-search"
              type="search"
              value={searchTerm}
              placeholder="Search customer, phone, business, type, date or status..."
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {appointments.length === 0 ? (
            <p>No appointments found.</p>
          ) : filteredAppointments.length === 0 ? (
            <p>No appointments match your search.</p>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Customer</th>
                      <th>Business</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Reminder</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedAppointments.map(
                      (appointment, index) => {
                        const customer = getAppointmentCustomer(
                          appointment,
                          customerLookup,
                        );

                        return (
                        <tr key={appointment.id}>
                          <td>
                            {startIndex + index + 1}
                          </td>

                          <td>
                            {customer?.name || 'Unlinked customer'}
                          </td>

                          <td>
                            {appointment.businessName ||
                              '—'}
                          </td>

                          <td>
                            {appointment.appointment_date
                              ? new Date(
                                  appointment.appointment_date
                                ).toLocaleDateString()
                              : '—'}
                          </td>

                          <td>
                            {appointment.appointment_time ||
                              '—'}
                          </td>

                          <td>
                            {appointment.appointment_type ||
                              '—'}
                          </td>

                          <td>
                            {appointment.reminder_enabled
                              ? 'Enabled'
                              : 'Disabled'}
                          </td>

                          <td>
                            {appointment.status || '—'}
                          </td>

                          <td>
                            <div className="form-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  startEditingAppointment(
                                    appointment
                                  )
                                }
                                disabled={
                                  appointmentActionLoading
                                }
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleCancelAppointment(
                                    appointment
                                  )
                                }
                                disabled={
                                  appointmentActionLoading ||
                                  appointment.status ===
                                    'cancelled'
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>

              <div
                className="pagination-controls"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  marginTop: '16px',
                }}
              >
                <p>
                  Showing {startIndex + 1}–
                  {Math.min(
                    startIndex + pageSize,
                    totalAppointments
                  )}{' '}
                  of {totalAppointments} appointments
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    disabled={safeCurrentPage === 1}
                    onClick={() =>
                      setCurrentPage(
                        (page) => page - 1
                      )
                    }
                  >
                    Previous
                  </button>

                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1
                  ).map((page) => (
                    <button
                      type="button"
                      key={page}
                      disabled={
                        page === safeCurrentPage
                      }
                      onClick={() =>
                        setCurrentPage(page)
                      }
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={
                      safeCurrentPage === totalPages
                    }
                    onClick={() =>
                      setCurrentPage(
                        (page) => page + 1
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default Appointments;
