import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString();
}

function getInactiveDays(customer) {
  const hasHistory =
    customer.has_purchase_history ||
    customer.has_completed_appointment_history;

  if (!hasHistory) {
    return 'No history';
  }

  if (!customer.last_activity_date) {
    return '-';
  }

  const activityDate = new Date(`${customer.last_activity_date}T00:00:00.000Z`);
  if (Number.isNaN(activityDate.valueOf())) {
    return '-';
  }

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const activityUtc = Date.UTC(
    activityDate.getUTCFullYear(),
    activityDate.getUTCMonth(),
    activityDate.getUTCDate()
  );

  return Math.max(0, Math.floor((todayUtc - activityUtc) / 86400000));
}

const SUPPORTED_TEMPLATE_VARIABLES = [
  'customer_name',
  'business_name',
  'review_link',
  'product_name',
  'purchase_date',
];

function getTemplateCategory(template) {
  return template?.metadata?.meta_category || template?.category || 'other';
}

function formatTemplateOption(template) {
  const category = getTemplateCategory(template);
  return `[${category.charAt(0).toUpperCase()}${category.slice(1)}] ${template.name}`;
}

function renderTemplate(template, customer, businesses) {
  const business = businesses.find(
    (candidate) => candidate.id === customer.business_id
  );
  const values = {
    customer_name: customer.name,
    business_name: business?.name || customer.businessName,
    review_link: business?.google_review_link,
    product_name: null,
    purchase_date: customer.last_purchase_date,
  };
  const unresolvedVariables = new Set();

  const message = String(template.message || '').replace(
    /{{\s*([a-z_]+)\s*}}/g,
    (match, variable) => {
      if (
        !SUPPORTED_TEMPLATE_VARIABLES.includes(variable) ||
        values[variable] === undefined ||
        values[variable] === null ||
        values[variable] === ''
      ) {
        unresolvedVariables.add(variable);
        return match;
      }

      return String(values[variable]);
    }
  );

  return { message, unresolvedVariables: [...unresolvedVariables] };
}

function CustomerComeback({
  customers,
  businesses = [],
  messageTemplates = [],
  templateLoading = false,
  templateError = '',
  inactivityDays,
  setInactivityDays,
  customerLoading,
  customerError,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [excludedCustomerIds, setExcludedCustomerIds] = useState({});
  const [selectedCustomerIds, setSelectedCustomerIds] = useState({});
  const [previewCustomerId, setPreviewCustomerId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [exclusionLoading, setExclusionLoading] = useState(false);
  const [exclusionError, setExclusionError] = useState('');
  const [exclusionPendingIds, setExclusionPendingIds] = useState({});
  const exclusionPendingRef = useRef(new Set());
  const [queuePendingKeys, setQueuePendingKeys] = useState({});
  const [queueResults, setQueueResults] = useState({});
  const queuePendingRef = useRef(new Set());
  const pageSize = 15;

  const comebackCustomerScopeKey = customers
    .map((customer) => `${customer.business_id}:${customer.id}`)
    .sort()
    .join('|');

  useEffect(() => {
    const businessIds = [...new Set(
      customers
        .map((customer) => customer.business_id)
        .filter(Boolean)
    )];
    let isActive = true;

    async function loadExclusions() {
      setExcludedCustomerIds({});
      setExclusionError('');

      if (businessIds.length === 0) {
        setExclusionLoading(false);
        return;
      }

      setExclusionLoading(true);

      try {
        const responses = await Promise.all(
          businessIds.map((businessId) =>
            apiFetch(
              `http://localhost:3000/customer-comeback-exclusions?business_id=${encodeURIComponent(
                businessId
              )}`
            )
          )
        );

        const results = await Promise.all(
          responses.map(async (response) => {
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
              throw new Error(
                result.error || 'Unable to load saved exclusions.'
              );
            }

            return result.data ?? [];
          })
        );

        if (!isActive) {
          return;
        }

        const customerIdsByBusiness = new Set(
          customers.map((customer) => `${customer.business_id}:${customer.id}`)
        );
        const nextExcludedCustomerIds = {};

        results.flat().forEach((exclusion) => {
          const key = `${exclusion.business_id}:${exclusion.customer_id}`;

          if (customerIdsByBusiness.has(key)) {
            nextExcludedCustomerIds[exclusion.customer_id] = true;
          }
        });

        setExcludedCustomerIds(nextExcludedCustomerIds);
      } catch (error) {
        if (isActive) {
          setExclusionError(error.message);
        }
      } finally {
        if (isActive) {
          setExclusionLoading(false);
        }
      }
    }

    loadExclusions();

    return () => {
      isActive = false;
    };
  }, [comebackCustomerScopeKey, customers]);

  async function handleExclusionChange(customer, shouldExclude) {
    const businessId = customer.business_id;
    const customerId = customer.id;
    const pendingKey = `${businessId}:${customerId}`;

    if (
      !businessId ||
      !customerId ||
      exclusionPendingRef.current.has(pendingKey)
    ) {
      return;
    }

    exclusionPendingRef.current.add(pendingKey);
    setExclusionPendingIds((previous) => ({
      ...previous,
      [pendingKey]: true,
    }));
    setExclusionError('');

    try {
      const response = shouldExclude
        ? await apiFetch(
            'http://localhost:3000/customer-comeback-exclusions',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                business_id: businessId,
                customer_id: customerId,
              }),
            }
          )
        : await apiFetch(
            `http://localhost:3000/customer-comeback-exclusions/${encodeURIComponent(
              customerId
            )}?business_id=${encodeURIComponent(businessId)}`,
            { method: 'DELETE' }
          );

      let result = {};

      if (response.status !== 204) {
        try {
          result = await response.json();
        } catch {
          result = {};
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error || 'Unable to save the customer exclusion.'
        );
      }

      setExcludedCustomerIds((previous) => {
        const next = { ...previous };

        if (shouldExclude) {
          next[customerId] = true;
        } else {
          delete next[customerId];
        }

        return next;
      });

      if (shouldExclude) {
        setSelectedCustomerIds((previous) => {
          if (!previous[customerId]) {
            return previous;
          }

          const next = { ...previous };
          delete next[customerId];
          return next;
        });
      }
    } catch (error) {
      setExclusionError(error.message);
    } finally {
      exclusionPendingRef.current.delete(pendingKey);
      setExclusionPendingIds((previous) => {
        const next = { ...previous };
        delete next[pendingKey];
        return next;
      });
    }
  }

  useEffect(() => {
    function removeInvalidSelections() {
      setSelectedCustomerIds((previous) => {
      const next = { ...previous };
      let changed = false;

      customers.forEach((customer) => {
        const hasHistory =
          customer.has_purchase_history ||
          customer.has_completed_appointment_history;

        if (
          next[customer.id] &&
          (!hasHistory || excludedCustomerIds[customer.id])
        ) {
          delete next[customer.id];
          changed = true;
        }
      });

      return changed ? next : previous;
      });
    }

    removeInvalidSelections();
  }, [customers, excludedCustomerIds]);

  const selectedCustomers = customers.filter((customer) => {
    const hasHistory =
      customer.has_purchase_history ||
      customer.has_completed_appointment_history;

    return (
      Boolean(selectedCustomerIds[customer.id]) &&
      hasHistory &&
      !excludedCustomerIds[customer.id]
    );
  });
  const previewCustomer = selectedCustomers.find(
    (customer) => customer.id === previewCustomerId
  );
  const previewTemplates = previewCustomer
    ? messageTemplates.filter(
        (template) => template.business_id === previewCustomer.business_id
      )
    : [];
  const selectedTemplate = previewTemplates.find(
    (template) => template.id === selectedTemplateId
  );
  const preview = selectedTemplate && previewCustomer
    ? renderTemplate(selectedTemplate, previewCustomer, businesses)
    : null;

  async function handleQueueMessages() {
    if (!selectedTemplate || !previewCustomer || preview?.unresolvedVariables.length) {
      return;
    }

    if (
      selectedCustomers.length > 1 &&
      !window.confirm(
        `Queue messages for ${selectedCustomers.length} selected customers?`
      )
    ) {
      return;
    }

    const requests = selectedCustomers
      .map((customer) => ({
        customer,
        key: `${customer.business_id}:${customer.id}:${selectedTemplate.id}:${inactivityDays}`,
      }))
      .filter(({ key }) => !queuePendingRef.current.has(key));

    if (requests.length === 0) {
      return;
    }

    requests.forEach(({ key }) => queuePendingRef.current.add(key));
    setQueuePendingKeys((previous) => {
      const next = { ...previous };
      requests.forEach(({ key }) => {
        next[key] = true;
      });
      return next;
    });

    setQueueResults((previous) => {
      const next = { ...previous };
      requests.forEach(({ key }) => {
        delete next[key];
      });
      return next;
    });

    await Promise.all(
      requests.map(async ({ customer, key }) => {
        let status = 'rejected';
        let message = 'Unable to queue message.';

        try {
          const response = await apiFetch(
            'http://localhost:3000/customer-comeback-messages',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                business_id: customer.business_id,
                customer_id: customer.id,
                template_id: selectedTemplate.id,
                days: inactivityDays,
              }),
            }
          );

          const result = await response.json().catch(() => ({}));

          if (response.status === 409) {
            status = 'duplicate';
            message = result.error || 'A message is already queued for this customer.';
          } else if (response.ok) {
            status = 'queued';
            message = 'Message queued successfully.';
          } else {
            message = result.error || result.errors?.join(', ') || message;
          }
        } catch (error) {
          message = error.message || message;
        }

        setQueueResults((previous) => ({
          ...previous,
          [key]: {
            status,
            message,
            customerId: customer.id,
            businessId: customer.business_id,
            customerName: customer.name || 'Customer',
            customerPhone: customer.phone,
            customerEmail: customer.email,
          },
        }));

        queuePendingRef.current.delete(key);
        setQueuePendingKeys((previous) => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
      })
    );
  }

  useEffect(() => {
    function selectPreviewCustomer() {
    const currentSelectedCustomers = customers.filter((customer) => {
      const hasHistory =
        customer.has_purchase_history ||
        customer.has_completed_appointment_history;

      return (
        Boolean(selectedCustomerIds[customer.id]) &&
        hasHistory &&
        !excludedCustomerIds[customer.id]
      );
    });

    if (
      previewCustomerId &&
      currentSelectedCustomers.some(
        (customer) => customer.id === previewCustomerId
      )
    ) {
      return;
    }

      setPreviewCustomerId(currentSelectedCustomers[0]?.id || '');
    }

    selectPreviewCustomer();
  }, [
    previewCustomerId,
    selectedCustomerIds,
    customers,
    excludedCustomerIds,
  ]);

  const filteredCustomers = customers.filter((customer) => {
    const search = searchTerm.trim().toLowerCase();

    return [
      customer.name,
      customer.phone,
      customer.email,
      customer.businessName,
      customer.last_purchase_date,
      customer.last_completed_appointment_date,
      customer.last_activity_date,
    ].some((value) => String(value || '').toLowerCase().includes(search));
  });

  const totalCustomers = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedCustomers = filteredCustomers.slice(
    startIndex,
    startIndex + pageSize
  );

  return (
    <section className="panel customer-comeback-page">
      <div className="customer-comeback-header">
        <div>
          <p className="customer-comeback-eyebrow"><span aria-hidden="true">✦</span> Retention Engine</p>
          <h3>Customer Comeback</h3>
          <p>Customers who may need a follow-up based on recent activity.</p>
        </div>
      </div>

      <div className="customer-comeback-toolbar">
        <div className="customer-comeback-search-field">
          <label htmlFor="comeback-search">Search Customers</label>
          <div className="customer-comeback-search-wrap">
            <span className="customer-comeback-search-icon" aria-hidden="true">⌕</span>
            <input
              id="comeback-search"
              type="search"
              value={searchTerm}
              placeholder="Search by name, phone, email or activity date..."
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <button
                className="customer-comeback-search-clear"
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

        <div className="customer-comeback-period-field">
          <label htmlFor="comeback-period">Inactivity period</label>
          <select
            id="comeback-period"
            value={inactivityDays}
            onChange={(event) => {
              setInactivityDays(Number(event.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {customerLoading ? (
        <p>Loading comeback customers...</p>
      ) : customerError ? (
        <p className="error-message">{customerError}</p>
      ) : (
        <>
          {customers.length === 0 ? (
            <p>No customers need a follow-up for this period.</p>
          ) : filteredCustomers.length === 0 ? (
            <p>No customers match your search.</p>
          ) : (
            <>
              <div className="customer-comeback-selection-bar">
                <div>
                  <span className="customer-comeback-selection-label">Audience selected</span>
                  <strong>{Object.keys(selectedCustomerIds).length}</strong>
                  <span>eligible customers ready for a comeback message</span>
                </div>
                <span className="customer-comeback-selection-badge">
                  {Object.keys(selectedCustomerIds).length} selected
                </span>
              </div>

              {exclusionLoading && <p>Loading saved exclusions...</p>}
              {exclusionError && (
                <p className="error-message">{exclusionError}</p>
              )}

              <div className="customer-comeback-preview-card">
                <div className="customer-comeback-preview-heading">
                  <div>
                    <p className="customer-comeback-section-kicker">Preview &amp; send</p>
                    <h4>Message preview</h4>
                  </div>
                  <span className="customer-comeback-whatsapp-mark" aria-hidden="true">WA</span>
                </div>

                {selectedCustomers.length === 0 ? (
                  <p>Select an eligible customer to preview a message template.</p>
                ) : (
                  <>
                    <div className="customer-comeback-preview-fields">
                      <div className="customer-comeback-field">
                      <label htmlFor="comeback-preview-customer">
                        Preview customer
                      </label>
                      <select
                        id="comeback-preview-customer"
                        value={previewCustomer?.id || ''}
                        onChange={(event) => {
                          setPreviewCustomerId(event.target.value);
                          setSelectedTemplateId('');
                        }}
                      >
                        {selectedCustomers.map((customer) => (
                          <option
                            key={`${customer.business_id}-${customer.id}`}
                            value={customer.id}
                          >
                            {customer.name || 'Customer'} —{' '}
                            {customer.businessName || 'Business'}
                          </option>
                        ))}
                      </select>
                      </div>

                    {templateLoading ? (
                      <p>Loading message templates...</p>
                    ) : templateError ? (
                      <p className="error-message">{templateError}</p>
                    ) : (
                      <>
                        <div className="customer-comeback-field">
                          <label htmlFor="comeback-preview-template">
                            Message template
                          </label>
                          <select
                            id="comeback-preview-template"
                            value={selectedTemplateId}
                            onChange={(event) =>
                              setSelectedTemplateId(event.target.value)
                            }
                          >
                            <option value="">Select a template</option>
                            {previewTemplates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {formatTemplateOption(template)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {previewTemplates.length === 0 ? (
                          <p>No templates are available for this business.</p>
                        ) : selectedTemplate ? (
                          (() => {
                            return (
                              <>
                                {preview.unresolvedVariables.length > 0 && (
                                  <p className="error-message">
                                    Unresolved variables:{' '}
                                    {preview.unresolvedVariables
                                      .map((variable) => `{{${variable}}}`)
                                      .join(', ')}
                                  </p>
                                )}
                                <div className="customer-comeback-message-bubble">
                                  <span className="customer-comeback-message-tail" aria-hidden="true" />
                                  <p>{preview.message}</p>
                                  <span className="customer-comeback-message-time">Now · WhatsApp</span>
                                </div>
                                <div className="form-actions customer-comeback-preview-actions">
                                  <button
                                    className="customer-comeback-primary-action"
                                    type="button"
                                    onClick={handleQueueMessages}
                                    disabled={
                                      selectedCustomers.length === 0 ||
                                      preview.unresolvedVariables.length > 0 ||
                                      selectedCustomers.some((customer) =>
                                        queuePendingKeys[
                                          `${customer.business_id}:${customer.id}:${selectedTemplate.id}:${inactivityDays}`
                                        ]
                                      )
                                    }
                                  >
                                    <span aria-hidden="true">↗</span> Queue Messages
                                  </button>
                                </div>
                              </>
                            );
                          })()
                        ) : (
                          <p>Select a template to preview its message.</p>
                        )}

                        {Object.values(queueResults).length > 0 && (
                          <div className="customer-comeback-queue-results">
                            <h5>Queue results</h5>
                            {Object.entries(queueResults).map(([key, result]) => (
                              <p
                                key={key}
                                className={result.status === 'queued' ? '' : 'error-message'}
                              >
                                {result.status === 'queued'
                                  ? 'Queued'
                                  : result.status === 'duplicate'
                                    ? 'Duplicate'
                                    : 'Rejected'}{' '}
                                for {result.customerName}
                                {(result.customerPhone || result.customerEmail) && (
                                  <> ({result.customerPhone || result.customerEmail})</>
                                )}: {result.message}
                              </p>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    </div>
                  </>
                )}
              </div>

              <div className="table-container customer-comeback-table-container">
                <table className="customer-comeback-table">
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Select</th>
                      <th>Name</th>
                      <th>Business</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Last Purchase</th>
                      <th>Last Completed Visit</th>
                      <th>Last Activity</th>
                      <th>Inactive Days</th>
                      <th>History</th>
                      <th>Exclude</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCustomers.map((customer, index) => {
                      const hasHistory =
                        customer.has_purchase_history ||
                        customer.has_completed_appointment_history;
                      const isExcluded = Boolean(excludedCustomerIds[customer.id]);
                      const canSelect = hasHistory && !isExcluded;

                      return (
                        <tr key={`${customer.business_id}-${customer.id}`}>
                          <td>{startIndex + index + 1}</td>
                          <td className="customer-comeback-select-cell">
                            <input
                              type="checkbox"
                              aria-label={`Select ${customer.name || 'customer'}`}
                              checked={Boolean(selectedCustomerIds[customer.id])}
                              disabled={exclusionLoading || !canSelect}
                              onChange={(event) => {
                                setSelectedCustomerIds((previous) => {
                                  const next = { ...previous };

                                  if (event.target.checked) {
                                    next[customer.id] = true;
                                  } else {
                                    delete next[customer.id];
                                  }

                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td>
                            <div className="customer-comeback-name-cell">
                              <span className="customer-comeback-avatar" aria-hidden="true">
                                {(customer.name || 'Customer')
                                  .split(/\s+/)
                                  .map((part) => part[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                              <strong>{customer.name || 'Customer'}</strong>
                            </div>
                          </td>
                          <td>{customer.businessName || '—'}</td>
                          <td>{customer.phone || '—'}</td>
                          <td>{customer.email || '—'}</td>
                          <td>{formatDate(customer.last_purchase_date)}</td>
                          <td>
                            {formatDate(
                              customer.last_completed_appointment_date
                            )}
                          </td>
                          <td>{formatDate(customer.last_activity_date)}</td>
                          <td>
                            <span className={`customer-comeback-inactive-badge ${hasHistory ? '' : 'is-muted'}`}>
                              {getInactiveDays(customer)}
                            </span>
                          </td>
                          <td>
                            <span className={`customer-comeback-history-badge ${hasHistory ? 'has-history' : 'no-history'}`}>
                              {hasHistory ? 'Activity recorded' : 'No purchase or completed visit history'}
                            </span>
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Exclude ${customer.name || 'customer'}`}
                              checked={Boolean(excludedCustomerIds[customer.id])}
                              disabled={
                                exclusionLoading ||
                                Boolean(
                                  exclusionPendingIds[
                                    `${customer.business_id}:${customer.id}`
                                  ]
                                )
                              }
                              onChange={(event) =>
                                handleExclusionChange(
                                  customer,
                                  event.target.checked
                                )
                              }
                            />
                            {exclusionPendingIds[
                              `${customer.business_id}:${customer.id}`
                            ] && <span> Saving...</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pagination-controls customer-comeback-pagination">
                <p>
                  Showing {startIndex + 1}–
                  {Math.min(startIndex + pageSize, totalCustomers)} of{' '}
                  {totalCustomers} customers
                </p>

                <div className="customer-comeback-pagination-buttons">
                  <button
                    type="button"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage((page) => page - 1)}
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
                    onClick={() => setCurrentPage((page) => page + 1)}
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

export default CustomerComeback;
