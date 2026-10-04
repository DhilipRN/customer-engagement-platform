import { useState } from 'react';

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
  editingAppointment,
  editAppointmentForm,
  setEditAppointmentForm,
  appointmentActionLoading,
  handleEditAppointment,
  setEditingAppointment,
  startEditingAppointment,
  handleCancelAppointment,
}) {
    const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 15;

  const filteredAppointments = appointments.filter((appointment) => {
    const search = searchTerm.trim().toLowerCase();

    const customer = customers.find(
      (item) => item.id === appointment.customer_id
    );

    const appointmentDate = appointment.appointment_date
      ? new Date(appointment.appointment_date).toLocaleDateString()
      : '';

    return (
      String(appointment.customerName || '').toLowerCase().includes(search) ||
      String(customer?.phone || '').toLowerCase().includes(search) ||
      String(appointment.businessName || '').toLowerCase().includes(search) ||
      String(appointment.appointment_type || '').toLowerCase().includes(search) ||
      String(appointment.appointment_date || '').toLowerCase().includes(search) ||
      appointmentDate.toLowerCase().includes(search) ||
      String(appointment.appointment_time || '').toLowerCase().includes(search) ||
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

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Appointments</h2>
          <p>
            Manage customer appointments and
            automated reminders.
          </p>
        </div>
      </div>

      <form
        className="customer-form"
        onSubmit={handleAddAppointment}
      >
        <h3>New Appointment</h3>

        <label>
          Business

          <select
            value={newAppointment.business_id}
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                business_id: event.target.value,
                customer_id: '',
                template_id: '',
              })
            }
            required
          >
            <option value="">
              Select a business
            </option>

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
          Customer

          <select
            value={newAppointment.customer_id}
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                customer_id:
                  event.target.value,
              })
            }
            required
            disabled={!newAppointment.business_id}
          >
            <option value="">
              Select a customer
            </option>

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
                  {customer.name} —{' '}
                  {customer.phone}
                </option>
              ))}
          </select>
        </label>

        <label>
          Appointment Date

          <input
            type="date"
            value={
              newAppointment.appointment_date
            }
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                appointment_date:
                  event.target.value,
              })
            }
            required
          />
        </label>

        <label>
          Appointment Time

          <input
            type="time"
            value={
              newAppointment.appointment_time
            }
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                appointment_time:
                  event.target.value,
              })
            }
            required
          />
        </label>

        <label>
          Appointment Type

          <input
            type="text"
            value={
              newAppointment.appointment_type
            }
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                appointment_type:
                  event.target.value,
              })
            }
            placeholder="Example: Dental Check-up"
            required
          />
        </label>

        <label className="consent-field">
          <input
            type="checkbox"
            checked={
              newAppointment.reminder_enabled
            }
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                reminder_enabled:
                  event.target.checked,
              })
            }
          />

          Enable appointment reminder
        </label>

        {newAppointment.reminder_enabled && (
          <label>
            Reminder Timing

            <select
              value={
                newAppointment.reminder_minutes
              }
              onChange={(event) =>
                setNewAppointment({
                  ...newAppointment,
                  reminder_minutes:
                    Number(
                      event.target.value
                    ),
                })
              }
            >
              <option value="1440">
                24 hours before
              </option>

              <option value="720">
                12 hours before
              </option>

              <option value="120">
                2 hours before
              </option>

              <option value="60">
                1 hour before
              </option>
            </select>
          </label>
        )}

        <label>
          Reminder Message Template

          <select
            value={newAppointment.template_id}
            onChange={(event) =>
              setNewAppointment({
                ...newAppointment,
                template_id:
                  event.target.value,
              })
            }
            disabled={
              !newAppointment.business_id
            }
          >
            <option value="">
              Select a template
            </option>

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
                  {template.name}
                </option>
              ))}
          </select>
        </label>

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
            Appointment Date

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
            Appointment Time

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
            Appointment Type

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
            Status

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

      {appointmentLoading ? (
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
                    {paginatedAppointments.map((appointment, index) => (
                      <tr key={appointment.id}>
                        <td>{startIndex + index + 1}</td>

                        <td>{appointment.customerName || '—'}</td>

                        <td>{appointment.businessName || '—'}</td>

                        <td>
                          {appointment.appointment_date
                            ? new Date(
                                appointment.appointment_date
                              ).toLocaleDateString()
                            : '—'}
                        </td>

                        <td>{appointment.appointment_time || '—'}</td>

                        <td>{appointment.appointment_type || '—'}</td>

                        <td>
                          {appointment.reminder_enabled
                            ? 'Enabled'
                            : 'Disabled'}
                        </td>

                        <td>{appointment.status || '—'}</td>

                        <td>
                          <div className="form-actions">
                            <button
                              type="button"
                              onClick={() =>
                                startEditingAppointment(appointment)
                              }
                              disabled={appointmentActionLoading}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleCancelAppointment(appointment)
                              }
                              disabled={
                                appointmentActionLoading ||
                                appointment.status === 'cancelled'
                              }
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
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
                      setCurrentPage((page) => page - 1)
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
                      disabled={page === safeCurrentPage}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() =>
                      setCurrentPage((page) => page + 1)
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