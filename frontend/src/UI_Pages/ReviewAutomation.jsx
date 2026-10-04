import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

function ReviewAutomation({
  businesses,
  messageTemplates,
  selectedReviewBusinessId,
  setSelectedReviewBusinessId,
  reviewForm,
  setReviewForm,
  reviewAutomationLoading,
  reviewAutomationError,
  reviewMessage,
  reviewSubmitting,
  handleSaveReviewAutomation,
}) {
  // Selected-customer review requests
  const [reviewCustomers, setReviewCustomers] = useState([]);
  const [reviewCustomersLoading, setReviewCustomersLoading] =
    useState(false);
  const [reviewCustomersError, setReviewCustomersError] =
    useState('');

    const [reviewCustomerSearch, setReviewCustomerSearch] =
  useState('');

const [reviewCustomerPage, setReviewCustomerPage] =
  useState(1);

  const [selectedCustomerIds, setSelectedCustomerIds] =
    useState([]);

  const [selectedRequestsLoading, setSelectedRequestsLoading] =
    useState(false);


  const [selectedRequestsMessage, setSelectedRequestsMessage] =
    useState('');

  

  useEffect(() => {
    if (!selectedReviewBusinessId) {
      setReviewCustomers([]);
      setSelectedCustomerIds([]);
      setReviewCustomersError('');
      return;
    }

    let cancelled = false;

    async function loadReviewCustomers() {
      setReviewCustomersLoading(true);
      setReviewCustomersError('');
      setSelectedCustomerIds([]);

      try {
        const response = await apiFetch(
          `http://localhost:3000/review-automations/selected-customers?business_id=${selectedReviewBusinessId}`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || 'Unable to load customers'
          );
        }

        if (!cancelled) {
          setReviewCustomers(result.data ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setReviewCustomersError(error.message);
          setReviewCustomers([]);
        }
      } finally {
        if (!cancelled) {
          setReviewCustomersLoading(false);
        }
      }
    }

    loadReviewCustomers();

    return () => {
      cancelled = true;
    };
    }, [selectedReviewBusinessId]);

  // Get the latest purchase for a customer.
  function getLatestPurchase(customer) {
    return [...(customer.purchases ?? [])].sort(
      (a, b) =>
        String(b.purchase_date).localeCompare(
          String(a.purchase_date)
        )
    )[0] ?? null;
  }

  // Only allow customers who consented and have
  // a purchase without an existing review request.
  function canRequestReview(customer) {
    const latestPurchase = getLatestPurchase(customer);

    return Boolean(
      customer.consent_given &&
      latestPurchase &&
      !latestPurchase.review_request
    );
  }

  // Select or deselect one customer.
  function toggleCustomerSelection(customerId) {
    setSelectedCustomerIds((previous) =>
      previous.includes(customerId)
        ? previous.filter((id) => id !== customerId)
        : [...previous, customerId]
    );
  }

  // Select or deselect all eligible customers.
  function handleSelectAllCustomers(checked) {
    if (!checked) {
      setSelectedCustomerIds([]);
      return;
    }

    setSelectedCustomerIds(
      reviewCustomers
        .filter(canRequestReview)
        .map((customer) => customer.id)
    );
  }

  // Schedule review requests for selected customers.
  async function handleScheduleSelectedRequests() {
    if (!selectedReviewBusinessId) {
      setSelectedRequestsMessage('Please select a business.');
      return;
    }

    if (selectedCustomerIds.length === 0) {
      setSelectedRequestsMessage(
        'Please select at least one eligible customer.'
      );
      return;
    }

    if (!reviewForm.template_id) {
      setSelectedRequestsMessage(
        'Please select a review message template.'
      );
      return;
    }

    setSelectedRequestsLoading(true);
    setSelectedRequestsMessage('');

    try {
      const response = await apiFetch(
        'http://localhost:3000/review-automations/selected-requests',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            business_id: selectedReviewBusinessId,
            customer_ids: selectedCustomerIds,
            template_id: reviewForm.template_id,
            delay_minutes: Number(reviewForm.delay_minutes),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.errors?.join(', ') ||
            'Unable to schedule review requests.'
        );
      }

      const results = result.data ?? [];
      const queued = results.filter(
        (item) => item.status === 'queued'
      ).length;
      const alreadyRequested = results.filter(
        (item) => item.status === 'already_requested'
      ).length;
      const skipped = results.filter(
        (item) => item.status.startsWith('skipped')
      ).length;
      const failed = results.filter(
        (item) => item.status === 'error'
      ).length;

      setSelectedRequestsMessage(
        `Queued: ${queued}. Already requested: ${alreadyRequested}. ` +
        `Skipped: ${skipped}. Failed: ${failed}.`
      );

      setSelectedCustomerIds([]);

      // Refresh the customer list and review history.
      const refreshResponse = await apiFetch(
        `http://localhost:3000/review-automations/selected-customers?business_id=${selectedReviewBusinessId}`
      );

      const refreshResult = await refreshResponse.json();

      if (!refreshResponse.ok) {
        throw new Error(
          refreshResult.error ||
            'Requests were processed, but history could not be refreshed.'
        );
      }

      setReviewCustomers(refreshResult.data ?? []);
    } catch (error) {
      setSelectedRequestsMessage(error.message);
    } finally {
      setSelectedRequestsLoading(false);
    }
  }
    function getCustomerType(customer) {
    const phone = String(customer.phone ?? '').replace(/\D/g, '');

    if (!phone) {
      return 'Unknown';
    }

    const matches = reviewCustomers.filter(
      (item) =>
        String(item.phone ?? '').replace(/\D/g, '') === phone
    );

    return matches.length > 1 ? 'Existing' : 'New';
  }

  const eligibleReviewCustomers =
    reviewCustomers.filter(canRequestReview);

  const filteredReviewCustomers = reviewCustomers.filter((customer) => {
  const search = reviewCustomerSearch.trim().toLowerCase();

  if (!search) return true;

  const latestPurchase = getLatestPurchase(customer);

  const searchableValues = [
    customer.name,
    customer.phone,
    customer.email,
    getCustomerType(customer),
    customer.consent_given ? 'yes consent' : 'no consent',
    customer.purchase_count,
    latestPurchase?.product_name,
    latestPurchase?.purchase_date,
    latestPurchase?.review_request?.status,
    canRequestReview(customer) ? 'eligible' : 'not eligible',
  ];

  return searchableValues.some((value) =>
    String(value ?? '').toLowerCase().includes(search)
  );
});

const reviewCustomerPageSize = 15;

const reviewCustomerTotalPages = Math.max(
  1,
  Math.ceil(filteredReviewCustomers.length / reviewCustomerPageSize)
);

const reviewCustomerStartIndex =
  (reviewCustomerPage - 1) * reviewCustomerPageSize;

const paginatedReviewCustomers = filteredReviewCustomers.slice(
  reviewCustomerStartIndex,
  reviewCustomerStartIndex + reviewCustomerPageSize
);

  return (

    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Review Automation</h2>
          <p>
            Automatically request customer reviews
            after a purchase.
          </p>
        </div>
      </div>

      {reviewAutomationLoading ? (
        <p>Loading review automation...</p>
      ) : reviewAutomationError ? (
        <p className="error-message">
          {reviewAutomationError}
        </p>
      ) : (
        <form
          onSubmit={handleSaveReviewAutomation}
        >
          <div className="form-group">
            <label>
              Business
            </label>

            <select
              value={selectedReviewBusinessId}
              onChange={(event) =>
                setSelectedReviewBusinessId(
                  event.target.value
                )
              }
            >
              <option value="">
                Select Business
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
          </div>

          {selectedReviewBusinessId && (
            <>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={reviewForm.enabled}
                    onChange={(event) =>
                      setReviewForm({
                        ...reviewForm,
                        enabled:
                          event.target.checked,
                      })
                    }
                  />
                  {' '}
                  Enable Review Automation
                </label>
              </div>

              <div className="form-group">
                <label>
                  Delay (minutes)
                </label>

                <input
                  type="number"
                  min="0"
                  value={reviewForm.delay_minutes}
                  onChange={(event) =>
                    setReviewForm({
                      ...reviewForm,
                      delay_minutes:
                        Number(
                          event.target.value
                        ),
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label>
                  Review Message Template
                </label>

                <select
                  value={reviewForm.template_id}
                  onChange={(event) =>
                    setReviewForm({
                      ...reviewForm,
                      template_id:
                        event.target.value,
                    })
                  }
                >
                  <option value="">
                    Select Review Template
                  </option>

                  {messageTemplates
                    .filter(
                      (template) =>
                        template.business_id ===
                          selectedReviewBusinessId &&
                        template.category ===
                          'review'
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
              </div>

              {reviewMessage && (
                <p>{reviewMessage}</p>
              )}

              <button
                type="submit"
                className="primary-button"
                disabled={reviewSubmitting}
              >
                {reviewSubmitting
                  ? 'Saving...'
                  : 'Save Automation'}
              </button>
            </>
          )}
        </form>
      )}

            <hr />

      <div className="panel-heading">
        <div>
          <h2>Selected Customer Review Requests</h2>
          <p>
            Select customers with a purchase and consent to
            queue review requests using the template and delay
            configured above.
          </p>
        </div>
      </div>

      {!selectedReviewBusinessId ? (
        <p>Select a business above to view its customers.</p>
      ) : reviewCustomersLoading ? (
        <p>Loading customers and review history...</p>
      ) : reviewCustomersError ? (
        <p className="error-message">
          {reviewCustomersError}
        </p>
      ) : (
        <>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={
                  eligibleReviewCustomers.length > 0 &&
                  eligibleReviewCustomers.every((customer) =>
                    selectedCustomerIds.includes(customer.id)
                  )
                }
                disabled={
                  eligibleReviewCustomers.length === 0 ||
                  selectedRequestsLoading
                }
                onChange={(event) =>
                  handleSelectAllCustomers(event.target.checked)
                }
              />

              <div style={{ marginBottom: '16px' }}>
  <label
    htmlFor="review-customer-search"
    style={{ display: 'block', marginBottom: '6px' }}
  >
    Search Customers
  </label>

  <input
    id="review-customer-search"
    type="text"
    value={reviewCustomerSearch}
    onChange={(event) => {
      setReviewCustomerSearch(event.target.value);
      setReviewCustomerPage(1);
    }}
    placeholder="Search name, phone, email, purchase, or status..."
    style={{
      width: '100%',
      maxWidth: '420px',
      padding: '10px 12px',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
    }}
  />

  <div style={{ marginTop: '6px', fontSize: '13px' }}>
    Matching customers: {filteredReviewCustomers.length}
  </div>
</div>
              {' '}
              Select all eligible customers (
              {eligibleReviewCustomers.length})
            </label>
          </div>

          <p>
            Selected customers: {selectedCustomerIds.length}
          </p>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>Select</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Type</th>
                  <th>Purchases</th>
                  <th>Purchase History / Review Requests</th>
                </tr>
              </thead>

              <tbody>
{paginatedReviewCustomers.map((customer, index) => {
               const latestPurchase = getLatestPurchase(customer);
                  const eligible = canRequestReview(customer);

                  return (
                    <tr key={customer.id}>
                          <td>{reviewCustomerStartIndex + index + 1}</td>

                      <td>
                        <input
                          type="checkbox"
                          checked={selectedCustomerIds.includes(
                            customer.id
                          )}
                          disabled={
                            !eligible || selectedRequestsLoading
                          }
                          onChange={() =>
                            toggleCustomerSelection(customer.id)
                          }
                        />

                        <div>
                          {eligible
                            ? 'Eligible'
                            : !customer.consent_given
                              ? 'No consent'
                              : !latestPurchase
                                ? 'No purchase'
                                : 'Already requested'}
                        </div>
                      </td>

                      <td>{customer.name}</td>

                      <td>{customer.phone || '—'}</td>

                      <td>{getCustomerType(customer)}</td>

                      <td>{customer.purchase_count ?? 0}</td>

                      <td>
                        {(customer.purchases ?? []).length === 0 ? (
                          'No purchase history'
                        ) : (
                          customer.purchases.map((purchase) => (
                            <div key={purchase.id}>
                              <strong>
                                {purchase.product_name || 'Purchase'}
                              </strong>
                              {' — '}
                              {purchase.purchase_date}
                              {' — '}
                              {purchase.review_request
                                ? `Request: ${purchase.review_request.status}`
                                : 'No request'}
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  );
                })}

                {reviewCustomers.length === 0 && (
                  <tr>
                    <td colSpan="6">
                      No customers found for this business.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div
  style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginTop: '16px',
  }}
>
  <div>
    Showing{' '}
    {filteredReviewCustomers.length === 0
      ? 0
      : reviewCustomerStartIndex + 1}
    –
    {Math.min(
      reviewCustomerStartIndex + paginatedReviewCustomers.length,
      filteredReviewCustomers.length
    )}{' '}
    of {filteredReviewCustomers.length} customers
  </div>

  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '6px',
    }}
  >
    <button
      type="button"
      disabled={reviewCustomerPage === 1}
      onClick={() =>
        setReviewCustomerPage((current) => Math.max(1, current - 1))
      }
    >
      Previous
    </button>

    {Array.from(
      { length: reviewCustomerTotalPages },
      (_, index) => index + 1
    ).map((page) => (
      <button
        key={page}
        type="button"
        onClick={() => setReviewCustomerPage(page)}
        disabled={reviewCustomerPage === page}
      >
        {page}
      </button>
    ))}

    <button
      type="button"
      disabled={reviewCustomerPage >= reviewCustomerTotalPages}
      onClick={() =>
        setReviewCustomerPage((current) =>
          Math.min(reviewCustomerTotalPages, current + 1)
        )
      }
    >
      Next
    </button>
  </div>
</div>
          </div>

          {selectedRequestsMessage && (
            <p>{selectedRequestsMessage}</p>
          )}

          <button
            type="button"
            className="primary-button"
            disabled={
              selectedCustomerIds.length === 0 ||
              selectedRequestsLoading ||
              !reviewForm.template_id
            }
            onClick={handleScheduleSelectedRequests}
          >
            {selectedRequestsLoading
              ? 'Scheduling Review Requests...'
              : `Schedule Review Requests (${selectedCustomerIds.length})`}
          </button>
        </>
      )}

    </section>
  );
}

export default ReviewAutomation;