import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

const DELAY_PRESETS = [
  { label: '15 min', value: 15 },
  { label: '1 hr', value: 60 },
  { label: '2 hrs · Recommended', value: 120 },
  { label: 'Next Morning', value: 1440 },
];

function effectiveCategory(template) {
  return template?.metadata?.meta_category || template?.category || 'other';
}

function templateLabel(template) {
  const category = effectiveCategory(template);
  return `[${category.charAt(0).toUpperCase()}${category.slice(1)}] ${template.name}`;
}

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
  const [reviewCustomers, setReviewCustomers] = useState([]);
  const [reviewCustomersLoading, setReviewCustomersLoading] = useState(false);
  const [reviewCustomersError, setReviewCustomersError] = useState('');
  const [reviewCustomerSearch, setReviewCustomerSearch] = useState('');
  const [reviewCustomerPage, setReviewCustomerPage] = useState(1);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [selectedRequestsLoading, setSelectedRequestsLoading] = useState(false);
  const [selectedRequestsMessage, setSelectedRequestsMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadReviewCustomers() {
      if (!selectedReviewBusinessId) {
        setReviewCustomers([]);
        setSelectedCustomerIds([]);
        setReviewCustomersError('');
        return;
      }

      setReviewCustomersLoading(true);
      setReviewCustomersError('');
      setSelectedCustomerIds([]);

      try {
        const response = await apiFetch(
          `http://localhost:3000/review-automations/selected-customers?business_id=${selectedReviewBusinessId}`
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load customers');
        if (!cancelled) setReviewCustomers(result.data ?? []);
      } catch (error) {
        if (!cancelled) {
          setReviewCustomersError(error.message);
          setReviewCustomers([]);
        }
      } finally {
        if (!cancelled) setReviewCustomersLoading(false);
      }
    }

    loadReviewCustomers();
    return () => { cancelled = true; };
  }, [selectedReviewBusinessId]);

  function getLatestPurchase(customer) {
    return [...(customer.purchases ?? [])].sort((a, b) => String(b.purchase_date).localeCompare(String(a.purchase_date)))[0] ?? null;
  }

  function canRequestReview(customer) {
    const latestPurchase = getLatestPurchase(customer);
    return Boolean(customer.consent_given && latestPurchase && !latestPurchase.review_request);
  }

  function toggleCustomerSelection(customerId) {
    setSelectedCustomerIds((previous) => previous.includes(customerId)
      ? previous.filter((id) => id !== customerId)
      : [...previous, customerId]);
  }

  function handleSelectAllCustomers(checked) {
    setSelectedCustomerIds(checked ? reviewCustomers.filter(canRequestReview).map((customer) => customer.id) : []);
  }

  async function handleScheduleSelectedRequests() {
    if (!selectedReviewBusinessId) {
      setSelectedRequestsMessage('Please select a business.');
      return;
    }
    if (selectedCustomerIds.length === 0) {
      setSelectedRequestsMessage('Please select at least one eligible customer.');
      return;
    }
    if (!reviewForm.template_id) {
      setSelectedRequestsMessage('Please select a review message template.');
      return;
    }

    setSelectedRequestsLoading(true);
    setSelectedRequestsMessage('');

    try {
      const response = await apiFetch('http://localhost:3000/review-automations/selected-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: selectedReviewBusinessId,
          customer_ids: selectedCustomerIds,
          template_id: reviewForm.template_id,
          delay_minutes: Number(reviewForm.delay_minutes),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.errors?.join(', ') || 'Unable to schedule review requests.');

      const results = result.data ?? [];
      const queued = results.filter((item) => item.status === 'queued').length;
      const alreadyRequested = results.filter((item) => item.status === 'already_requested').length;
      const skipped = results.filter((item) => item.status.startsWith('skipped')).length;
      const failed = results.filter((item) => item.status === 'error').length;
      setSelectedRequestsMessage(`Queued: ${queued}. Already requested: ${alreadyRequested}. Skipped: ${skipped}. Failed: ${failed}.`);
      setSelectedCustomerIds([]);

      const refreshResponse = await apiFetch(`http://localhost:3000/review-automations/selected-customers?business_id=${selectedReviewBusinessId}`);
      const refreshResult = await refreshResponse.json();
      if (!refreshResponse.ok) throw new Error(refreshResult.error || 'Requests were processed, but history could not be refreshed.');
      setReviewCustomers(refreshResult.data ?? []);
    } catch (error) {
      setSelectedRequestsMessage(error.message);
    } finally {
      setSelectedRequestsLoading(false);
    }
  }

  function getCustomerType(customer) {
    const phone = String(customer.phone ?? '').replace(/\D/g, '');
    if (!phone) return 'Unknown';
    const matches = reviewCustomers.filter((item) => String(item.phone ?? '').replace(/\D/g, '') === phone);
    return matches.length > 1 ? 'Existing' : 'New';
  }

  const selectedBusiness = businesses.find((business) => business.id === selectedReviewBusinessId);
  const businessTemplates = messageTemplates.filter((template) => template.business_id === selectedReviewBusinessId);
  const reviewTemplates = businessTemplates.filter((template) => effectiveCategory(template) === 'review');
  const selectedTemplate = reviewTemplates.find((template) => template.id === reviewForm.template_id);
  const eligibleReviewCustomers = reviewCustomers.filter(canRequestReview);
  const requestedCount = reviewCustomers.reduce((count, customer) => count + (customer.purchases ?? []).filter((purchase) => purchase.review_request).length, 0);
  const filteredReviewCustomers = reviewCustomers.filter((customer) => {
    const search = reviewCustomerSearch.trim().toLowerCase();
    if (!search) return true;
    const latestPurchase = getLatestPurchase(customer);
    return [
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
    ].some((value) => String(value ?? '').toLowerCase().includes(search));
  });
  const reviewCustomerPageSize = 15;
  const reviewCustomerTotalPages = Math.max(1, Math.ceil(filteredReviewCustomers.length / reviewCustomerPageSize));
  const safePage = Math.min(reviewCustomerPage, reviewCustomerTotalPages);
  const reviewCustomerStartIndex = (safePage - 1) * reviewCustomerPageSize;
  const paginatedReviewCustomers = filteredReviewCustomers.slice(reviewCustomerStartIndex, reviewCustomerStartIndex + reviewCustomerPageSize);
  const delayValue = Number(reviewForm.delay_minutes);
  const activePreset = DELAY_PRESETS.find((preset) => preset.value === delayValue)?.value || 'custom';
  const previewBody = String(selectedTemplate?.message || 'Hi {{customer_name}}, please share your experience with {{business_name}}.').replace(/{{\s*customer_name\s*}}/g, 'Alex').replace(/{{\s*business_name\s*}}/g, selectedBusiness?.name || 'your clinic').replace(/{{\s*review_link\s*}}/g, selectedBusiness?.google_review_link || 'https://g.page/r/.../review');

  return (
    <section className="review-automation-page">
      <div className="review-automation-hero">
        <div><span className="section-kicker">Customer experience automation</span><h2>Review Automation</h2><p>Turn completed visits into thoughtful Google review requests on WhatsApp.</p></div>
        <div className="review-business-picker"><label htmlFor="review-business">Active clinic</label><select id="review-business" value={selectedReviewBusinessId} onChange={(event) => setSelectedReviewBusinessId(event.target.value)}><option value="">Select Business</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></div>
      </div>

      {!selectedReviewBusinessId ? <div className="review-empty-state">Select a business to configure automation and view eligible customers.</div> : reviewAutomationLoading ? <div className="review-empty-state">Loading review automation…</div> : reviewAutomationError ? <div className="review-empty-state review-error-card">{reviewAutomationError}</div> : <>
        <div className="review-kpi-grid">
          <div className="review-kpi-card"><span>Total reviews requested</span><strong>{requestedCount}</strong><small>Recorded in customer history</small></div>
          <div className="review-kpi-card review-kpi-green"><span>Eligible customers</span><strong>{eligibleReviewCustomers.length}</strong><small>Consent + completed visit</small></div>
          <div className="review-kpi-card review-kpi-indigo"><span>Automation status</span><strong>{reviewForm.enabled ? 'Active' : 'Paused'}</strong><small>{reviewForm.enabled ? 'Requests are enabled' : 'Requests are paused'}</small></div>
          <div className="review-kpi-card review-kpi-teal"><span>Preferred channel</span><strong>WhatsApp</strong><small>Connected or safely simulated</small></div>
        </div>

        <div className="review-config-grid">
          <form className="review-config-card" onSubmit={handleSaveReviewAutomation}>
            <div className="review-card-heading"><div><span className="section-kicker">Configuration</span><h3>Automated review requests</h3></div><label className="review-switch"><input type="checkbox" checked={reviewForm.enabled} onChange={(event) => setReviewForm({ ...reviewForm, enabled: event.target.checked })} /><span /></label></div>
            <p className="review-card-description">Send a friendly message after a customer has completed a purchase or visit.</p>
            <label className="review-field">Review message template<select value={reviewForm.template_id} onChange={(event) => setReviewForm({ ...reviewForm, template_id: event.target.value })}><option value="">Select Review Template</option>{reviewTemplates.map((template) => <option key={template.id} value={template.id}>{templateLabel(template)}</option>)}</select></label>
            <div className="review-field"><span>Send delay</span><div className="review-delay-presets">{DELAY_PRESETS.map((preset) => <button type="button" key={preset.value} className={activePreset === preset.value ? 'active' : ''} onClick={() => setReviewForm({ ...reviewForm, delay_minutes: preset.value })}>{preset.label}</button>)}<button type="button" className={activePreset === 'custom' ? 'active' : ''} onClick={() => setReviewForm({ ...reviewForm, delay_minutes: delayValue || 0 })}>Custom</button></div><input className="review-delay-input" type="number" min="0" value={reviewForm.delay_minutes} onChange={(event) => setReviewForm({ ...reviewForm, delay_minutes: Number(event.target.value) })} /><small className="review-field-help">Messages are scheduled after the configured delay.</small></div>
            {reviewMessage && <p className="review-inline-message">{reviewMessage}</p>}
            <button type="submit" className="review-primary-button" disabled={reviewSubmitting}>{reviewSubmitting ? 'Saving…' : 'Save Automation'}</button>
          </form>

          <div className="review-preview-card"><div className="review-card-heading"><div><span className="section-kicker">Live preview</span><h3>WhatsApp review message</h3></div><span className="review-channel-badge">● WhatsApp</span></div><div className="review-phone-preview"><div className="review-phone-header">‹ <strong>{selectedBusiness?.name || 'Connectly Clinic'}</strong><span>⋮</span></div><div className="review-phone-wallpaper"><div className="review-bubble"><p>{previewBody}</p><a href={selectedBusiness?.google_review_link || '#'} target="_blank" rel="noreferrer">★ Leave a Google Review</a><small>10:42 AM ✓✓</small></div></div></div></div>
        </div>

        <div className="review-link-card"><div><span className="section-kicker">Google Business Profile</span><h3>Review link health</h3><p>{selectedBusiness?.google_review_link || 'Google Review Link not configured in Business Settings'}</p></div>{selectedBusiness?.google_review_link ? <a className="review-secondary-button" href={selectedBusiness.google_review_link} target="_blank" rel="noreferrer">↗ Test Link</a> : <span className="review-link-warning">⚠ Link not configured</span>}</div>

        <div className="review-customers-card"><div className="review-customers-heading"><div><span className="section-kicker">Customer audience</span><h3>Selected customer review requests</h3><p>Choose consented customers with a purchase and no existing review request.</p></div><div className="review-selection-actions">{selectedCustomerIds.length > 0 && <><span className="review-selection-count">{selectedCustomerIds.length} selected</span><button type="button" className="review-primary-button" disabled={selectedRequestsLoading || !reviewForm.template_id} onClick={handleScheduleSelectedRequests}>{selectedRequestsLoading ? 'Queueing…' : `Queue Review Requests (${selectedCustomerIds.length})`}</button></>}</div></div>
          {reviewCustomersLoading ? <p>Loading customers and review history…</p> : reviewCustomersError ? <p className="error-message">{reviewCustomersError}</p> : <>
            <div className="review-table-toolbar"><div className="review-search-wrap"><span>⌕</span><input id="review-customer-search" type="search" value={reviewCustomerSearch} onChange={(event) => { setReviewCustomerSearch(event.target.value); setReviewCustomerPage(1); }} placeholder="Search name, phone, email, purchase or status…" /></div><label className="review-select-all"><input type="checkbox" checked={eligibleReviewCustomers.length > 0 && eligibleReviewCustomers.every((customer) => selectedCustomerIds.includes(customer.id))} disabled={eligibleReviewCustomers.length === 0 || selectedRequestsLoading} onChange={(event) => handleSelectAllCustomers(event.target.checked)} /> Select all eligible <span>({eligibleReviewCustomers.length})</span></label><span className="review-matching-count">{filteredReviewCustomers.length} matching</span></div>
            <div className="review-table-container"><table className="review-customers-table"><thead><tr><th className="review-select-column">Select</th><th>Customer</th><th>Phone</th><th>Type</th><th>Purchases</th><th>Status</th><th>History / Requests</th></tr></thead><tbody>{paginatedReviewCustomers.map((customer) => { const latestPurchase = getLatestPurchase(customer); const eligible = canRequestReview(customer); const status = eligible ? 'Eligible' : !customer.consent_given ? 'No consent' : !latestPurchase ? 'No purchase' : 'Already requested'; return <tr key={customer.id}><td className="review-select-column"><input type="checkbox" checked={selectedCustomerIds.includes(customer.id)} disabled={!eligible || selectedRequestsLoading} onChange={() => toggleCustomerSelection(customer.id)} /></td><td><span className="review-patient-cell"><span className="review-avatar">{String(customer.name || '?').trim().charAt(0).toUpperCase()}</span><strong>{customer.name || 'Unknown customer'}</strong></span></td><td>{customer.phone || '—'}</td><td>{getCustomerType(customer)}</td><td>{customer.purchase_count ?? 0}</td><td><span className={`review-status-pill ${eligible ? 'eligible' : 'ineligible'}`}>{status}</span></td><td>{(customer.purchases ?? []).length === 0 ? 'No purchase history' : customer.purchases.map((purchase) => <div key={purchase.id} className="review-history-line"><strong>{purchase.product_name || 'Purchase'}</strong> · {purchase.purchase_date} · {purchase.review_request ? `Request: ${purchase.review_request.status}` : 'No request'}</div>)}</td></tr>; })}{paginatedReviewCustomers.length === 0 && <tr><td colSpan="7" className="review-no-results">No customers found for this business.</td></tr>}</tbody></table></div>
            <div className="review-pagination"><span>Showing {filteredReviewCustomers.length === 0 ? 0 : reviewCustomerStartIndex + 1}–{Math.min(reviewCustomerStartIndex + paginatedReviewCustomers.length, filteredReviewCustomers.length)} of {filteredReviewCustomers.length}</span><div><button type="button" disabled={safePage === 1} onClick={() => setReviewCustomerPage((page) => Math.max(1, page - 1))}>Previous</button>{Array.from({ length: reviewCustomerTotalPages }, (_, index) => index + 1).map((page) => <button type="button" className={safePage === page ? 'active' : ''} key={page} onClick={() => setReviewCustomerPage(page)}>{page}</button>)}<button type="button" disabled={safePage >= reviewCustomerTotalPages} onClick={() => setReviewCustomerPage((page) => Math.min(reviewCustomerTotalPages, page + 1))}>Next</button></div></div>
            {selectedRequestsMessage && <p className="review-inline-message">{selectedRequestsMessage}</p>}
          </>}
        </div>
      </>}
    </section>
  );
}

export default ReviewAutomation;
