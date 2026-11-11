import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';
import {
  buildCustomerAppointmentsUrl,
  buildCustomerDetailsUrl,
  buildCustomerTimelineUrl,
  formatAppointmentTime,
  formatTimelineTime,
  getCustomerDetailsDisplay,
  getMessageHistoryDisplay,
  splitCustomerAppointments,
} from '../customerDetails';
import {
  findPatientsByPhone,
  normalizePhoneNumber,
} from '../appointmentPatient';
import {
  downloadCustomerImportTemplate,
  downloadCustomersCsv,
  customerImportConfirmationMessage,
  customerImportResultMessage,
  canConfirmCustomerImport,
  filterCustomersForSearch,
  getImportableCustomerRows,
  validateCustomerImportCsv,
} from '../customerCsv';
import {
  CUSTOMER_ACTIVITY_FILTERS,
  DEFAULT_CUSTOMER_SORT_DIRECTION,
  DEFAULT_CUSTOMER_SORT_KEY,
  filterCustomersByActivity,
  formatCustomerActivityDate,
  formatInactiveDays,
  formatNextAppointment,
  getCustomerInitials,
  getCustomerListingColumns,
  getInactiveStatus,
  nextCustomerSort,
  summarizeCustomerActivity,
  sortCustomers,
} from '../customerActivity';

function AppointmentSection({ title, appointments }) {
  return (
    <div className="customer-appointment-section">
      <h5>{title}</h5>
      {appointments.length === 0 ? (
        <p>No {title.toLowerCase()} appointments.</p>
      ) : (
        <ul className="customer-appointment-list">
          {appointments.map((appointment) => (
            <li key={appointment.id || `${appointment.appointment_date}-${appointment.appointment_time}`}>
              <div>
                <strong>{formatCustomerActivityDate(appointment.appointment_date)}</strong>
                <span>{formatAppointmentTime(appointment.appointment_time)}</span>
              </div>
              <span className="customer-appointment-status">
                {String(appointment.status || 'unknown').replace('_', ' ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageHistoryItem({ item }) {
  const display = getMessageHistoryDisplay(item);

  return (
    <li>
      <div className="customer-message-history-main">
        <strong>{display.content}</strong>
        <span>
          {display.timestamp
            ? `${formatCustomerActivityDate(display.timestamp)}, ${formatTimelineTime(display.timestamp)}`
            : 'Date unavailable'}
        </span>
      </div>
      <div className="customer-message-history-meta">
        <span>{display.channel}</span>
        <span>{String(display.status).replace('_', ' ')}</span>
      </div>
    </li>
  );
}

function Customers({
  businesses,
  customers,
  customerLoading,
  customerError,
  newCustomer,
  setNewCustomer,
  customerSubmitting,
  customerMessage,
  setCustomerMessage,
  handleAddCustomer,
  handleImportCustomers,
  editingCustomer,
  editCustomerForm,
  setEditCustomerForm,
  customerActionLoading,
  handleEditCustomer,
  setEditingCustomer,
  startEditingCustomer,
  handleDeleteCustomer,
}) {
   const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activityFilter, setActivityFilter] = useState('all');
  const [sortKey, setSortKey] = useState('');
  const [sortDirection, setSortDirection] = useState(DEFAULT_CUSTOMER_SORT_DIRECTION);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importBusinessId, setImportBusinessId] = useState('');
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [selectedExistingCustomer, setSelectedExistingCustomer] = useState(null);
  const [showEmailColumn, setShowEmailColumn] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [customerDetailsLoading, setCustomerDetailsLoading] = useState(false);
  const [customerDetailsError, setCustomerDetailsError] = useState('');
  const [customerAppointments, setCustomerAppointments] = useState([]);
  const [customerAppointmentsLoading, setCustomerAppointmentsLoading] = useState(false);
  const [customerAppointmentsError, setCustomerAppointmentsError] = useState('');
  const [customerMessageHistory, setCustomerMessageHistory] = useState([]);
  const [customerMessageHistoryLoading, setCustomerMessageHistoryLoading] = useState(false);
  const [customerMessageHistoryError, setCustomerMessageHistoryError] = useState('');
  const customerDetailsRequestRef = useRef(0);
  const importFileInputRef = useRef(null);

  const pageSize = 15;

  const searchedCustomers = filterCustomersForSearch(customers, searchTerm);
  const filteredCustomers = filterCustomersByActivity(
    searchedCustomers,
    activityFilter,
  );
  const sortedCustomers = sortCustomers(
    filteredCustomers,
    sortKey || DEFAULT_CUSTOMER_SORT_KEY,
    sortKey ? sortDirection : DEFAULT_CUSTOMER_SORT_DIRECTION,
  );
  const activitySummary = summarizeCustomerActivity(customers);
  const visibleCustomerColumns = getCustomerListingColumns(showEmailColumn);
  const customerDetailsDisplay = getCustomerDetailsDisplay(customerDetails);
  const customerAppointmentSections = splitCustomerAppointments(customerAppointments);

  const matchingCustomers = useMemo(
    () => findPatientsByPhone(
      customers,
      newCustomer.business_id,
      newCustomer.phone,
    ),
    [customers, newCustomer.business_id, newCustomer.phone],
  );
  const hasPhoneLookup = Boolean(normalizePhoneNumber(newCustomer.phone));

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerDetails(null);
      setCustomerDetailsLoading(false);
      setCustomerDetailsError('');
      setCustomerAppointments([]);
      setCustomerAppointmentsLoading(false);
      setCustomerAppointmentsError('');
      setCustomerMessageHistory([]);
      setCustomerMessageHistoryLoading(false);
      setCustomerMessageHistoryError('');
      return undefined;
    }

    const controller = new AbortController();
    const requestId = customerDetailsRequestRef.current + 1;
    customerDetailsRequestRef.current = requestId;
    setCustomerDetails(null);
    setCustomerDetailsLoading(true);
    setCustomerDetailsError('');
    setCustomerAppointments([]);
    setCustomerAppointmentsLoading(true);
    setCustomerAppointmentsError('');
    setCustomerMessageHistory([]);
    setCustomerMessageHistoryLoading(true);
    setCustomerMessageHistoryError('');

    async function loadCustomerDetails() {
      try {
        const [detailsResponse, appointmentsResponse, timelineResponse] = await Promise.all([
          apiFetch(buildCustomerDetailsUrl(selectedCustomer), {
            signal: controller.signal,
          }),
          apiFetch(buildCustomerAppointmentsUrl(selectedCustomer), {
            signal: controller.signal,
          }),
          apiFetch(buildCustomerTimelineUrl(selectedCustomer), {
            signal: controller.signal,
          }),
        ]);
        const [result, appointmentsResult, timelineResult] = await Promise.all([
          detailsResponse.json(),
          appointmentsResponse.json(),
          timelineResponse.json(),
        ]);

        if (!detailsResponse.ok) {
          throw new Error(
            result.error ||
              result.errors?.join(', ') ||
              'Unable to load customer details.',
          );
        }

        if (customerDetailsRequestRef.current !== requestId) return;
        setCustomerDetails(result.data ?? null);

        if (!appointmentsResponse.ok) {
          setCustomerAppointmentsError(
            appointmentsResult.error || 'Unable to load customer appointments.',
          );
        } else {
          setCustomerAppointments(appointmentsResult.data ?? []);
        }

        if (!timelineResponse.ok) {
          setCustomerMessageHistoryError(
            timelineResult.error || 'Unable to load message history.',
          );
          return;
        }

        setCustomerMessageHistory(timelineResult.data ?? []);
      } catch (error) {
        if (
          error.name !== 'AbortError' &&
          customerDetailsRequestRef.current === requestId
        ) {
          if (error.message?.includes('appointments')) {
            setCustomerAppointmentsError(error.message);
          } else if (error.message?.includes('message')) {
            setCustomerMessageHistoryError(error.message);
          } else {
          setCustomerDetailsError(error.message || 'Unable to load customer details.');
          }
        }
      } finally {
        if (customerDetailsRequestRef.current === requestId) {
          setCustomerDetailsLoading(false);
          setCustomerAppointmentsLoading(false);
          setCustomerMessageHistoryLoading(false);
        }
      }
    }

    loadCustomerDetails();

    return () => controller.abort();
  }, [selectedCustomer]);

  const totalCustomers = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedCustomers = sortedCustomers.slice(
    startIndex,
    startIndex + pageSize
  );

  const handleSort = (key) => {
    const nextSort = nextCustomerSort(key, sortKey, sortDirection);
    setSortKey(nextSort.sortKey);
    setSortDirection(nextSort.sortDirection);
    setCurrentPage(1);
  };

  const sortIndicator = (key) => (
    (sortKey === key || (!sortKey && key === DEFAULT_CUSTOMER_SORT_KEY))
      ? (sortKey && sortDirection === 'asc' ? ' \u2191' : ' \u2193')
      : ''
  );

  const sortableHeader = (key, label) => (
    <th
      key={key}
      aria-sort={sortKey === key
        ? sortDirection
        : (!sortKey && key === DEFAULT_CUSTOMER_SORT_KEY ? 'desc' : 'none')}
    >
      <button
        className="customer-sort-button"
        type="button"
        onClick={() => handleSort(key)}
        aria-label={sortKey === key
          ? `Sort ${label} ${sortDirection === 'asc' ? 'descending' : 'default sort'}`
          : `Sort ${label} ascending`}
        title="Ascending, Descending, Default Sort"
        style={{
          padding: 0,
          border: 0,
          background: 'transparent',
          color: 'inherit',
          fontWeight: 'inherit',
        }}
      >
        {label}{sortIndicator(key)}
      </button>
    </th>
  );

  const clearImportPreview = () => {
    setImportPreview(null);
    setImportError('');
    setImportResult(null);
    setImportBusinessId('');
    if (importFileInputRef.current) importFileInputRef.current.value = '';
  };

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportPreview(null);
    setImportError('');
    setImportResult(null);
    if (!importBusinessId && businesses.length === 1) {
      setImportBusinessId(businesses[0].id);
    }

    try {
      setImportPreview(validateCustomerImportCsv(await file.text()));
    } catch (error) {
      setImportError(error.message || 'Unable to parse the CSV file.');
    } finally {
      event.target.value = '';
    }
  };

  const confirmImport = async () => {
    if (!importPreview || !importBusinessId || importPreview.counts.valid === 0) {
      return;
    }

    const confirmed = window.confirm(
      customerImportConfirmationMessage(importPreview.counts.valid)
    );

    if (!confirmed) return;

    setImportSubmitting(true);
    setImportError('');

    try {
      const rows = getImportableCustomerRows(importPreview.rows);

      setImportResult(await handleImportCustomers({
        businessId: importBusinessId,
        rows,
      }));
    } catch (error) {
      setImportError(error.message || 'Unable to import customers.');
    } finally {
      setImportSubmitting(false);
    }
  };

  return (
    <section className="panel customers-page">
      <div className="customers-header">
        <div>
          <p className="customers-eyebrow"><span aria-hidden="true">✦</span> Customer Management</p>
          <h2>Customers</h2>
          <p>Keep every customer relationship organized across your businesses.</p>
        </div>

        <div className="customers-header-actions">
          <button
            className="customer-action-button"
            type="button"
            onClick={() => importFileInputRef.current?.click()}
          >
            <span className="customer-button-icon" aria-hidden="true">↥</span>
            Import Customers
          </button>

          <input
            ref={importFileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFileChange}
            aria-label="Select customer CSV file"
            style={{ display: 'none' }}
          />

          <button
            className="customer-action-button"
            type="button"
            onClick={downloadCustomerImportTemplate}
          >
            <span className="customer-button-icon" aria-hidden="true">↓</span>
            Download Import Template
          </button>

          <button
            className="customer-action-button"
            type="button"
            onClick={() => downloadCustomersCsv(filteredCustomers)}
            disabled={customerLoading || customers.length === 0}
          >
            <span className="customer-button-icon" aria-hidden="true">↗</span>
            Export CSV
          </button>
        </div>
      </div>

      <div className="customer-summary-grid" aria-label="Customer activity summary">
        <div className="customer-summary-card">
          <div className="customer-summary-icon customer-summary-icon-purple">◎</div>
          <div>
            <span>Total Customers</span>
            <strong>{activitySummary.total}</strong>
          </div>
        </div>
        <div className="customer-summary-card">
          <div className="customer-summary-icon customer-summary-icon-green">↗</div>
          <div>
            <span>Active Customers</span>
            <p>0–14 days since last activity</p>
            <strong>{activitySummary.active}</strong>
          </div>
        </div>
        <div className="customer-summary-card">
          <div className="customer-summary-icon customer-summary-icon-amber">◷</div>
          <div>
            <span>Inactive 15–29 Days</span>
            <p>15–29 days since last activity</p>
            <strong>{activitySummary.inactive15to29}</strong>
          </div>
        </div>
        <div className="customer-summary-card">
          <div className="customer-summary-icon customer-summary-icon-red">!</div>
          <div>
            <span>Inactive 30+ Days</span>
            <p>30+ days since last activity</p>
            <strong>{activitySummary.inactive30}</strong>
          </div>
        </div>
        <div className="customer-summary-card">
          <div className="customer-summary-icon customer-summary-icon-gray">—</div>
          <div>
            <span>Never Active</span>
            <p>No completed appointment or purchase recorded</p>
            <strong>{activitySummary.neverActive}</strong>
          </div>
        </div>
      </div>

      {selectedCustomer && (
        <aside className="customer-details-panel" aria-labelledby="customer-details-title">
          <div className="customer-details-header">
            <div>
              <p className="customers-eyebrow">CUSTOMER DETAILS</p>
              <h3 id="customer-details-title">
                {customerDetailsDisplay.name === '—'
                  ? selectedCustomer.name || 'Customer'
                  : customerDetailsDisplay.name}
              </h3>
            </div>
            <button
              className="customer-details-close"
              type="button"
              onClick={() => setSelectedCustomer(null)}
              aria-label="Close customer details"
            >
              Close
            </button>
          </div>

          {customerDetailsLoading ? (
            <p role="status">Loading customer details...</p>
          ) : customerDetailsError ? (
            <p className="error-message" role="alert">{customerDetailsError}</p>
          ) : !customerDetails ? (
            <p>No customer details available.</p>
          ) : (
            <dl className="customer-details-grid">
              <div>
                <dt>Name</dt>
                <dd>{customerDetailsDisplay.name}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{customerDetailsDisplay.phone}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{customerDetailsDisplay.email}</dd>
              </div>
              <div>
                <dt>WhatsApp consent</dt>
                <dd>{customerDetailsDisplay.consent}</dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>
                  {customerDetailsDisplay.registered
                    ? formatCustomerActivityDate(customerDetailsDisplay.registered)
                    : '—'}
                </dd>
              </div>
            </dl>
          )}

          <section
            className="customer-details-appointments"
            aria-labelledby="customer-appointments-title"
          >
            <h4 id="customer-appointments-title">Appointments</h4>
            {customerAppointmentsLoading ? (
              <p role="status">Loading appointments...</p>
            ) : customerAppointmentsError ? (
              <p className="error-message" role="alert">
                {customerAppointmentsError}
              </p>
            ) : customerAppointments.length === 0 ? (
              <p>No appointments recorded.</p>
            ) : (
              <>
                <AppointmentSection
                  title="Upcoming"
                  appointments={customerAppointmentSections.upcoming}
                />
                <AppointmentSection
                  title="Past"
                  appointments={customerAppointmentSections.past}
                />
              </>
            )}
          </section>

          <section
            className="customer-details-messages"
            aria-labelledby="customer-message-history-title"
          >
            <h4 id="customer-message-history-title">Message History</h4>
            {customerMessageHistoryLoading ? (
              <p role="status">Loading message history...</p>
            ) : customerMessageHistoryError ? (
              <p className="error-message" role="alert">
                {customerMessageHistoryError}
              </p>
            ) : customerMessageHistory.length === 0 ? (
              <p>No message history recorded.</p>
            ) : (
              <ul className="customer-message-history-list">
                {customerMessageHistory.map((item) => (
                  <MessageHistoryItem
                    key={`${item.type}-${item.id}`}
                    item={item}
                  />
                ))}
              </ul>
            )}
          </section>
        </aside>
      )}

      {(importPreview || importError) && (
        <div
          className="customer-import-preview"
          style={{ marginBottom: '22px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <h3>Import Preview</h3>

            <button
              type="button"
              onClick={clearImportPreview}
            >
              Cancel
            </button>
          </div>

          {importError ? (
            <p className="error-message">{importError}</p>
          ) : (
            <>
              <label>
                Import into business
                <select
                  value={importBusinessId}
                  onChange={(event) => setImportBusinessId(event.target.value)}
                  disabled={importSubmitting}
                >
                  <option value="">Select a business</option>
                  {businesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </label>

              <p>
                Valid: {importPreview.counts.valid} · Invalid: {importPreview.counts.invalid}
                {' · '}Duplicates skipped: {importPreview.counts.duplicate}
              </p>

              <button
                type="button"
                onClick={confirmImport}
                disabled={!canConfirmCustomerImport({
                  importSubmitting,
                  importResult,
                  importBusinessId,
                  validCount: importPreview.counts.valid,
                })}
              >
                {importSubmitting ? 'Importing...' : 'Confirm Import'}
              </button>

              {importResult && (
                <p>{customerImportResultMessage(importResult.summary)}</p>
              )}

              <div className="table-container customer-table-container">
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Consent</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.displayRowNumber}</td>
                        <td>{row.name || '-'}</td>
                        <td>{row.phone || '-'}</td>
                        <td>{row.email || '-'}</td>
                        <td>
                          {row.consent_given === undefined
                            ? '-'
                            : String(row.consent_given)}
                        </td>
                        <td>
                          {row.status === 'duplicate'
                            ? 'Skipped duplicate'
                            : row.status === 'valid'
                              ? 'Valid'
                              : `Invalid: ${row.errors.join(' ')}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ======================================================
          ADD CUSTOMER
      ====================================================== */}

      <div className="customer-form-toggle">
        <div>
          <h3>Add a customer</h3>
          <p>Create a new customer record in an authorized business.</p>
        </div>
        <button
          className="customer-add-toggle"
          type="button"
          aria-expanded={isAddCustomerOpen}
          onClick={() => setIsAddCustomerOpen((isOpen) => !isOpen)}
        >
          <span className="customer-button-icon" aria-hidden="true">{isAddCustomerOpen ? '×' : '+'}</span>
          {isAddCustomerOpen ? 'Close form' : 'Add Customer'}
        </button>
      </div>

      {isAddCustomerOpen && (
        <form
          onSubmit={(event) => {
            if (selectedExistingCustomer) {
              event.preventDefault();
              setCustomerMessage(
                'This customer already exists in the selected business. Choose a different phone number to add a new customer.',
              );
              return;
            }

            handleAddCustomer(event);
          }}
          className="customer-form"
        >
        <h3>Add Customer</h3>

        <label>
          Business

          <select
            value={newCustomer.business_id}
            onChange={(event) => {
              setNewCustomer({
                ...newCustomer,
                business_id: event.target.value,
              });
              setSelectedExistingCustomer(null);
              setShowNewPatientForm(false);
              setCustomerMessage('');
            }}
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
          Phone

          <input
            type="tel"
            value={newCustomer.phone}
            onChange={(event) => {
              const digitsOnly = event.target.value
                .replace(/\D/g, '')
                .slice(0, 10);

              setNewCustomer({
                ...newCustomer,
                phone: digitsOnly,
              });
              setSelectedExistingCustomer(null);
              setShowNewPatientForm(false);
              setCustomerMessage('');
            }}
            pattern="[0-9]{10}"
            maxLength={10}
            minLength={10}
            title="Please enter exactly 10 digits"
            placeholder="Enter 10-digit phone number"
            required
          />

          {hasPhoneLookup && matchingCustomers.length > 0 && (
            <div
              className="appointment-patient-matches"
              role="listbox"
              aria-label="Matching customers"
            >
              {matchingCustomers.map((customer) => (
                <button
                  className={`appointment-patient-match${selectedExistingCustomer?.id === customer.id ? ' selected' : ''}`}
                  key={customer.id}
                  type="button"
                  role="option"
                  aria-selected={selectedExistingCustomer?.id === customer.id}
                  onClick={() => {
                    setSelectedExistingCustomer(customer);
                    setNewCustomer({
                      ...newCustomer,
                      name: customer.name || '',
                      phone: customer.phone || '',
                      email: customer.email || '',
                      consent_given: Boolean(customer.consent_given),
                    });
                    setCustomerMessage(
                      `${customer.name} selected. No new record will be created.`,
                    );
                  }}
                >
                  <strong>{customer.name}</strong>
                  <span>{customer.phone}</span>
                </button>
              ))}
            </div>
          )}

          {hasPhoneLookup && matchingCustomers.length === 0 && !selectedExistingCustomer && (
            <div className="appointment-patient-empty">
              <span>No existing customer found for this phone number.</span>
              <button
                type="button"
                onClick={() => {
                  setShowNewPatientForm(true);
                  setCustomerMessage('Complete the fields below to add a new customer.');
                }}
              >
                + Add New Customer
              </button>
            </div>
          )}
        </label>

        {(showNewPatientForm || !hasPhoneLookup || matchingCustomers.length > 0) && (
          <>
            <label>
              Name

              <input
                value={newCustomer.name}
                onChange={(event) =>
                  setNewCustomer({
                    ...newCustomer,
                    name: event.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Email

              <input
                type="email"
                value={newCustomer.email}
                onChange={(event) =>
                  setNewCustomer({
                    ...newCustomer,
                    email: event.target.value,
                  })
                }
              />
            </label>

            <label className="consent-field">
              <input
                type="checkbox"
                checked={newCustomer.consent_given}
                onChange={(event) =>
                  setNewCustomer({
                    ...newCustomer,
                    consent_given: event.target.checked,
                  })
                }
              />

              WhatsApp consent given
            </label>
          </>
        )}

        <button
          type="submit"
          disabled={customerSubmitting || Boolean(selectedExistingCustomer)}
        >
          {customerSubmitting
            ? 'Adding...'
            : selectedExistingCustomer
              ? 'Customer Already Exists'
              : 'Add Customer'}
        </button>

        {customerMessage && (
          <p>{customerMessage}</p>
        )}
        </form>
      )}

      {/* ======================================================
          EDIT CUSTOMER
      ====================================================== */}

      {editingCustomer && (
        <form
          onSubmit={handleEditCustomer}
          className="customer-form"
        >
          <h3>Edit Customer</h3>

          <label>
            Name

            <input
              value={editCustomerForm.name}
              onChange={(event) =>
                setEditCustomerForm({
                  ...editCustomerForm,
                  name: event.target.value,
                })
              }
              required
            />
          </label>

          <label>
            Phone

            <input
              type="tel"
              value={editCustomerForm.phone}
              onChange={(event) => {
                const digitsOnly = event.target.value
                  .replace(/\D/g, '')
                  .slice(0, 10);

                setEditCustomerForm({
                  ...editCustomerForm,
                  phone: digitsOnly,
                });
                setCustomerMessage('');
              }}
              pattern="[0-9]{10}"
              maxLength={10}
              minLength={10}
              title="Please enter exactly 10 digits"
              required
            />
          </label>

          <label>
            Email

            <input
              type="email"
              value={editCustomerForm.email}
              onChange={(event) =>
                setEditCustomerForm({
                  ...editCustomerForm,
                  email: event.target.value,
                })
              }
            />
          </label>

          <label className="consent-field">
            <input
              type="checkbox"
              checked={editCustomerForm.consent_given}
              onChange={(event) =>
                setEditCustomerForm({
                  ...editCustomerForm,
                  consent_given:
                    event.target.checked,
                })
              }
            />

            Customer has given consent to
            receive messages
          </label>

          <button
            type="submit"
            disabled={customerActionLoading}
          >
            {customerActionLoading
              ? 'Saving...'
              : 'Save Changes'}
          </button>

          <button
            type="button"
            onClick={() => setEditingCustomer(null)}
            disabled={customerActionLoading}
          >
            Cancel
          </button>
        </form>
      )}

      {/* ======================================================
          CUSTOMER LIST: SEARCH AND PAGINATION
      ====================================================== */}

      {customerLoading ? (
        <p>Loading customers...</p>
      ) : customerError ? (
        <p className="error-message">
          {customerError}
        </p>
      ) : (
        <>
          <div className="customer-list-toolbar">
            <div className="customer-search-field">
              <label htmlFor="customer-search">
                Search Customers
              </label>

              <div className="customer-search-input-wrap">
                <span className="customer-search-icon" aria-hidden="true">⌕</span>
                <input
                  id="customer-search"
                  type="search"
                  value={searchTerm}
                  placeholder="Search by name, phone or email..."
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setCurrentPage(1);
                  }}
                />
                {searchTerm && (
                  <button
                    className="customer-search-clear"
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    aria-label="Clear customer search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="customer-toolbar-controls">
              <div className="customer-filter-field">
                <label htmlFor="customer-activity-filter">
                  Quick Filter
                </label>

                <select
                  id="customer-activity-filter"
                  value={activityFilter}
                  onChange={(event) => {
                    setActivityFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                >
                  {CUSTOMER_ACTIVITY_FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="customer-listing-columns">
                <span>Listing Columns</span>
                <label className="customer-listing-column-option">
                  <input
                    type="checkbox"
                    checked={showEmailColumn}
                    onChange={(event) => setShowEmailColumn(event.target.checked)}
                  />
                  <span>Show Email ID</span>
                </label>
              </div>

            </div>
          </div>

          {customers.length === 0 ? (
            <p>No customers found.</p>
          ) : filteredCustomers.length === 0 ? (
            <p>No customers match your search.</p>
          ) : (
            <>
              <div className="table-container customer-table-container">
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      {sortableHeader('name', 'Name')}
                      <th>Business</th>
                      {sortableHeader('phone', 'Phone')}
                      {visibleCustomerColumns.includes('email') &&
                        sortableHeader('email', 'Email ID')}
                      {sortableHeader('consent_given', 'Consent')}
                      {sortableHeader('last_purchase_date', 'Last Purchase Date')}
                      {sortableHeader('last_completed_appointment_date', 'Last Completed Appointment')}
                      {sortableHeader('inactive_days', 'Inactive Days')}
                      {sortableHeader('next_appointment_date', 'Next Appointment')}
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedCustomers.map((customer, index) => (
                      <tr key={customer.id}>
                        <td>{startIndex + index + 1}</td>

                        <td>
                          <div className="customer-name-cell">
                            <span className="customer-initials" aria-hidden="true">
                              {getCustomerInitials(customer.name)}
                            </span>
                            <button
                              className="customer-name-button"
                              type="button"
                              onClick={() => setSelectedCustomer(customer)}
                              aria-label={`View details for ${customer.name}`}
                            >
                              {customer.name}
                            </button>
                          </div>
                        </td>

                        <td>{customer.businessName}</td>

                        <td>{customer.phone}</td>

                        {visibleCustomerColumns.includes('email') && (
                          <td>{customer.email || '-'}</td>
                        )}

                        <td>
                          <span className={`customer-badge ${customer.consent_given
                            ? 'customer-badge-success'
                            : 'customer-badge-muted'}`}>
                            {customer.consent_given ? 'Consented' : 'No Consent'}
                          </span>
                        </td>

                        <td>{formatCustomerActivityDate(customer.last_purchase_date)}</td>

                        <td>{formatCustomerActivityDate(customer.last_completed_appointment_date)}</td>

                        <td>
                          <span className={`customer-badge customer-badge-${getInactiveStatus(customer.inactive_days)}`}>
                            {formatInactiveDays(customer)}
                          </span>
                        </td>

                        <td>{formatNextAppointment(customer)}</td>

                        <td>
                          <button
                            className="customer-row-action"
                            type="button"
                            onClick={() =>
                              startEditingCustomer(customer)
                            }
                            disabled={customerActionLoading}
                          >
                            Edit
                          </button>

                          <button
                            className="customer-row-action customer-row-action-danger"
                            type="button"
                            onClick={() =>
                              handleDeleteCustomer(customer)
                            }
                            disabled={customerActionLoading}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-controls customer-pagination">
                <p>
                  Showing {startIndex + 1}–
                  {Math.min(startIndex + pageSize, totalCustomers)}
                  {' '}of {totalCustomers} customers
                </p>

                <div className="customer-pagination-buttons">
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

export default Customers;
