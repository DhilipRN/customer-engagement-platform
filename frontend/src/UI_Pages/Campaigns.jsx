import { useState } from 'react';
import { apiFetch } from '../api';

function getTemplateCategory(template) {
  return template?.metadata?.meta_category || template?.category || 'other';
}

function formatTemplateOption(template) {
  const category = getTemplateCategory(template);
  return `[${category.charAt(0).toUpperCase()}${category.slice(1)}] ${template.name}`;
}

function getCustomerActivityDate(customer) {
  const values = [
    customer.last_activity_date,
    customer.last_purchase_date,
    customer.last_completed_appointment_date,
  ].filter(Boolean).sort();

  return values.at(-1) || null;
}

function isInactiveCustomer(customer, days = 30) {
  const activityDate = getCustomerActivityDate(customer);
  if (!activityDate) return false;

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);

  return new Date(`${activityDate}T00:00:00.000Z`) <= cutoff;
}

function Campaigns({
  businesses,
  customers = [],
  messageTemplates,
  campaigns,
  campaignLoading,
  campaignError,
  newCampaign,
  setNewCampaign,
  campaignSubmitting,
  campaignMessage,
  handleAddCampaign,
  editingCampaign,
  editCampaignForm,
  setEditCampaignForm,
  campaignActionLoading,
  handleEditCampaign,
  setEditingCampaign,
  startEditingCampaign,
  handleDeleteCampaign,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAudience, setNewAudience] = useState('all_consented');
  const [editAudience, setEditAudience] = useState('all_consented');
  const [recipientCampaign, setRecipientCampaign] = useState(null);
  const [recipientMessages, setRecipientMessages] = useState([]);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [recipientError, setRecipientError] = useState('');

  const pageSize = 15;

  const summaryCards = [
    { label: 'Total campaigns', value: campaigns.length, tone: 'purple' },
    {
      label: 'Draft campaigns',
      value: campaigns.filter((campaign) => campaign.status === 'draft').length,
      tone: 'slate',
    },
    {
      label: 'Scheduled campaigns',
      value: campaigns.filter((campaign) => campaign.status === 'scheduled').length,
      tone: 'blue',
    },
    {
      label: 'Running / completed',
      value: campaigns.filter((campaign) => ['running', 'completed'].includes(campaign.status)).length,
      tone: 'green',
    },
  ];

  const formatStatus = (status) => (
    String(status || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  );

  const filteredCampaigns = campaigns.filter((campaign) => {
    const search = searchTerm.trim().toLowerCase();

    const template =
      messageTemplates.find(
        (template) => template.id === campaign.template_id
      );
    const templateLabel = template
      ? formatTemplateOption(template)
      : null;
    const resolvedTemplateName = templateLabel ||
      campaign.templateName ||
      '';

    const scheduledAt = campaign.scheduled_at
      ? new Date(campaign.scheduled_at).toLocaleString()
      : '';

    const matchesSearch = [
      campaign.name,
      campaign.businessName,
      resolvedTemplateName,
      campaign.status,
      campaign.scheduled_at,
      scheduledAt,
    ].some((value) => String(value || '').toLowerCase().includes(search));

    return (statusFilter === 'all' || campaign.status === statusFilter) && matchesSearch;
  });

  const totalCampaigns = filteredCampaigns.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCampaigns / pageSize)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;

  const paginatedCampaigns = filteredCampaigns.slice(
    startIndex,
    startIndex + pageSize
  );

  const audienceCustomers = customers.filter(
    (customer) => customer.business_id === newCampaign.business_id
  );
  const eligibleAudienceCount = audienceCustomers.filter((customer) => {
    if (customer.consent_given !== true) return false;
    return newAudience === 'inactive_30' ? isInactiveCustomer(customer, 30) : true;
  }).length;

  const editAudienceCustomerCount = customers.filter(
    (customer) => customer.business_id === editingCampaign?.business_id && customer.consent_given === true
  ).length;

  async function openRecipients(campaign) {
    setRecipientCampaign(campaign);
    setRecipientMessages([]);
    setRecipientError('');
    setRecipientLoading(true);

    try {
      const response = await apiFetch(
        `http://localhost:3000/messages?business_id=${encodeURIComponent(campaign.business_id)}&campaign_id=${encodeURIComponent(campaign.id)}`
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'Unable to load campaign recipients.');
      }

      setRecipientMessages(result.data ?? []);
    } catch (error) {
      setRecipientError(error.message || 'Unable to load campaign recipients.');
    } finally {
      setRecipientLoading(false);
    }
  }

  function closeRecipients() {
    setRecipientCampaign(null);
    setRecipientMessages([]);
    setRecipientError('');
  }

  return (
    <section className="panel campaigns-dashboard">
      <div className="campaigns-page-header">
        <div>
          <span className="campaigns-eyebrow">Broadcast campaigns</span>
          <h3>Campaigns</h3>
          <p>Create, schedule, and manage customer messaging campaigns.</p>
        </div>
        <button
          type="button"
          className="campaign-create-button"
          onClick={() => setShowCreateForm((visible) => !visible)}
        >
          {showCreateForm ? 'Close form' : '+ Create Campaign'}
        </button>
      </div>

      <div className="campaign-summary-grid" aria-label="Campaign summary">
        {summaryCards.map((card) => (
          <div className={`campaign-summary-card campaign-summary-card-${card.tone}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </div>

      {showCreateForm && <form
        className="customer-form"
        onSubmit={handleAddCampaign}
      >
        <div className="campaign-form-heading">
          <div>
            <span className="campaigns-eyebrow">New broadcast</span>
            <h3>Create Campaign</h3>
          </div>
          <span className="campaign-form-step">Step 1 of 1</span>
        </div>

        <label>
          Business

          <select
            value={newCampaign.business_id}
            onChange={(event) => {
              setNewAudience('all_consented');
              setNewCampaign({
                ...newCampaign,
                business_id:
                  event.target.value,
                template_id: '',
              });
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
          Campaign Name

          <input
            type="text"
            value={newCampaign.name}
            onChange={(event) =>
              setNewCampaign({
                ...newCampaign,
                name: event.target.value,
              })
            }
            placeholder="Example: Diwali Promotion"
            required
          />
        </label>

        <label>
          Message Template

          <select
            value={newCampaign.template_id}
            onChange={(event) =>
              setNewCampaign({
                ...newCampaign,
                template_id:
                  event.target.value,
              })
            }
            disabled={!newCampaign.business_id}
            required
          >
            <option value="">
              Select a template
            </option>

            {messageTemplates
              .filter(
                (template) =>
                  template.business_id ===
                  newCampaign.business_id
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
        </label>

        <label>
          Target Audience

          <select
            value={newAudience}
            onChange={(event) => setNewAudience(event.target.value)}
            disabled={!newCampaign.business_id}
          >
            <option value="all_consented">All Consented Customers</option>
            <option value="inactive_30">Inactive Customers (30+ days)</option>
          </select>
          {newCampaign.business_id && (
            <span className="campaign-audience-helper">
              Targeting {eligibleAudienceCount} eligible customers with consent
            </span>
          )}
        </label>

        <label>
          Status

          <select
            value={newCampaign.status}
            onChange={(event) =>
              setNewCampaign({
                ...newCampaign,
                status: event.target.value,
                scheduled_at:
                  event.target.value ===
                  'scheduled'
                    ? newCampaign.scheduled_at
                    : '',
              })
            }
            required
          >
            <option value="draft">
              Draft
            </option>
            <option value="scheduled">
              Scheduled
            </option>
          </select>
        </label>

        {newCampaign.status === 'scheduled' && (
          <label>
            Scheduled Date & Time

            <input
              type="datetime-local"
              value={newCampaign.scheduled_at}
              onChange={(event) =>
                setNewCampaign({
                  ...newCampaign,
                  scheduled_at:
                    event.target.value,
                })
              }
              required
            />
          </label>
        )}

        <button
          type="submit"
          disabled={campaignSubmitting}
        >
          {campaignSubmitting
            ? 'Creating...'
            : 'Create Campaign'}
        </button>

        {campaignMessage && (
          <p>{campaignMessage}</p>
        )}
      </form>}

      {editingCampaign && (
        <form
          className="customer-form"
          onSubmit={handleEditCampaign}
        >
          <h3>Edit Campaign</h3>

          <label>
            Campaign Name

            <input
              type="text"
              value={editCampaignForm.name}
              onChange={(event) =>
                setEditCampaignForm({
                  ...editCampaignForm,
                  name: event.target.value,
                })
              }
              required
            />
          </label>

          <label>
            Message Template

            <select
              value={editCampaignForm.template_id}
              onChange={(event) =>
                setEditCampaignForm({
                  ...editCampaignForm,
                  template_id:
                    event.target.value,
                })
              }
              required
            >
              <option value="">
                Select a template
              </option>

              {messageTemplates
                .filter(
                  (template) =>
                    template.business_id ===
                    editingCampaign.business_id
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
          </label>

          <label>
            Target Audience

            <select
              value={editAudience}
              onChange={(event) => setEditAudience(event.target.value)}
            >
              <option value="all_consented">All Consented Customers</option>
              <option value="inactive_30">Inactive Customers (30+ days)</option>
            </select>
            <span className="campaign-audience-helper">
              {editAudience === 'inactive_30'
                ? 'Targeting is preview-only until campaign audience persistence is supported.'
                : `Targeting ${editAudienceCustomerCount} eligible customers with consent`}
            </span>
          </label>

          <label>
            Status

            <select
              value={editCampaignForm.status}
              onChange={(event) =>
                setEditCampaignForm({
                  ...editCampaignForm,
                  status: event.target.value,
                  scheduled_at:
                    event.target.value ===
                    'scheduled'
                      ? editCampaignForm.scheduled_at
                      : '',
                })
              }
              required
            >
              <option value="draft">
                Draft
              </option>
              <option value="scheduled">
                Scheduled
              </option>
              <option value="running">
                Running
              </option>
              <option value="completed">
                Completed
              </option>
              <option value="cancelled">
                Cancelled
              </option>
            </select>
          </label>

          {editCampaignForm.status ===
            'scheduled' && (
            <label>
              Scheduled Date & Time

              <input
                type="datetime-local"
                value={
                  editCampaignForm.scheduled_at
                }
                onChange={(event) =>
                  setEditCampaignForm({
                    ...editCampaignForm,
                    scheduled_at:
                      event.target.value,
                  })
                }
                required
              />
            </label>
          )}

          <div className="form-actions">
            <button
              type="submit"
              disabled={campaignActionLoading}
            >
              {campaignActionLoading
                ? 'Saving...'
                : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={() =>
                setEditingCampaign(null)
              }
              disabled={campaignActionLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

           {/* ======================================================
          CAMPAIGN LIST: SEARCH AND PAGINATION
      ====================================================== */}

      {campaignLoading ? (
        <p>Loading campaigns...</p>
      ) : campaignError ? (
        <p className="error-message">
          {campaignError}
        </p>
      ) : (
        <>
          <div className="campaign-list-toolbar">
            <div className="form-group campaign-search-field">
              <label htmlFor="campaign-search">Search campaigns</label>
              <input
                id="campaign-search"
                type="search"
                value={searchTerm}
                placeholder="Search name, business, template or date..."
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="form-group campaign-status-filter">
              <label htmlFor="campaign-status-filter">Status</label>
              <select
                id="campaign-status-filter"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {campaigns.length === 0 ? (
            <p>No campaigns found.</p>
          ) : filteredCampaigns.length === 0 ? (
            <p>No campaigns match your search.</p>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Campaign Name</th>
                      <th>Business</th>
                      <th>Message template</th>
                      <th>Audience</th>
                      <th>Status</th>
                      <th>Scheduled At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedCampaigns.map((campaign, index) => {
                      const template =
                        messageTemplates.find(
                          (template) =>
                            template.id === campaign.template_id
                        );
                      const templateName = template
                        ? formatTemplateOption(template)
                        : campaign.templateName || '-';

                      return (
                        <tr key={campaign.id}>
                          <td>{startIndex + index + 1}</td>

                          <td>{campaign.name}</td>

                          <td>{campaign.businessName || '-'}</td>

                          <td>{templateName}</td>

                          <td>All consented customers</td>

                          <td>
                            <span className={`campaign-status-badge campaign-status-${campaign.status}`}>
                              {formatStatus(campaign.status)}
                            </span>
                          </td>

                          <td>
                            {campaign.scheduled_at
                              ? new Date(
                                  campaign.scheduled_at
                                ).toLocaleString()
                              : '-'}
                          </td>

                          <td>
                            <div className="form-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditAudience('all_consented');
                                  startEditingCampaign(campaign);
                                }}
                                disabled={campaignActionLoading}
                              >
                                Edit
                              </button>

                              <button
                                className="campaign-recipient-action"
                                type="button"
                                onClick={() => openRecipients(campaign)}
                                disabled={campaignActionLoading}
                              >
                                Recipients
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteCampaign(campaign)
                                }
                                disabled={campaignActionLoading}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
                    totalCampaigns
                  )}{' '}
                  of {totalCampaigns} campaigns
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

      {recipientCampaign && (
        <div className="campaign-recipient-modal-backdrop" role="presentation" onClick={closeRecipients}>
          <aside
            className="campaign-recipient-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="campaign-recipient-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="campaign-recipient-header">
              <div>
                <span className="campaigns-eyebrow">Campaign audience</span>
                <h3 id="campaign-recipient-title">{recipientCampaign.name}</h3>
                <p>{recipientCampaign.businessName || 'Business'} · {recipientMessages.length} recorded recipients</p>
              </div>
              <button className="campaign-recipient-close" type="button" onClick={closeRecipients} aria-label="Close recipients">
                ×
              </button>
            </div>

            <div className="campaign-recipient-meta">
              <span className={`campaign-status-badge campaign-status-${recipientCampaign.status}`}>
                {formatStatus(recipientCampaign.status)}
              </span>
              <span>{recipientMessages.length} messages</span>
            </div>

            {recipientLoading ? (
              <p role="status">Loading recipients...</p>
            ) : recipientError ? (
              <p className="error-message" role="alert">{recipientError}</p>
            ) : recipientMessages.length === 0 ? (
              <div className="campaign-recipient-empty">
                <strong>No recipients recorded yet</strong>
                <span>Messages will appear here when this campaign is processed.</span>
              </div>
            ) : (
              <div className="campaign-recipient-list">
                {recipientMessages.map((message) => (
                  <div className="campaign-recipient-row" key={message.id}>
                    <div>
                      <strong>{message.customerName || 'Unknown Customer'}</strong>
                      <span>{message.customerPhone || 'Phone unavailable'}</span>
                    </div>
                    <div className="campaign-recipient-row-meta">
                      <span className={`campaign-recipient-status campaign-recipient-status-${message.status}`}>
                        {formatStatus(message.status)}
                      </span>
                      <small>
                        {message.sent_at
                          ? `Sent ${new Date(message.sent_at).toLocaleString()}`
                          : message.scheduled_at
                            ? `Scheduled ${new Date(message.scheduled_at).toLocaleString()}`
                            : 'Timestamp unavailable'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

export default Campaigns;
