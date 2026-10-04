import { useState } from 'react';

function Campaigns({
  businesses,
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
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 15;

  const filteredCampaigns = campaigns.filter((campaign) => {
    const search = searchTerm.trim().toLowerCase();

    const templateName =
      messageTemplates.find(
        (template) => template.id === campaign.template_id
      )?.name ||
      campaign.templateName ||
      '';

    const scheduledAt = campaign.scheduled_at
      ? new Date(campaign.scheduled_at).toLocaleString()
      : '';

    return (
      String(campaign.name || '').toLowerCase().includes(search) ||
      String(campaign.businessName || '').toLowerCase().includes(search) ||
      String(templateName).toLowerCase().includes(search) ||
      String(campaign.status || '').toLowerCase().includes(search) ||
      String(campaign.scheduled_at || '').toLowerCase().includes(search) ||
      scheduledAt.toLowerCase().includes(search)
    );
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

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Campaigns</h3>
          <p>
            Create and manage customer messaging
            campaigns.
          </p>
        </div>
      </div>

      <form
        className="customer-form"
        onSubmit={handleAddCampaign}
      >
        <h3>Add Campaign</h3>

        <label>
          Business

          <select
            value={newCampaign.business_id}
            onChange={(event) =>
              setNewCampaign({
                ...newCampaign,
                business_id:
                  event.target.value,
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
                  {template.name}
                </option>
              ))}
          </select>
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
      </form>

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
                    {template.name}
                  </option>
                ))}
            </select>
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
          <div className="form-group">
            <label htmlFor="campaign-search">
              Search Campaigns
            </label>

            <input
              id="campaign-search"
              type="search"
              value={searchTerm}
              placeholder="Search name, business, template, status or date..."
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
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
                      <th>Template</th>
                      <th>Status</th>
                      <th>Scheduled At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedCampaigns.map((campaign, index) => {
                      const templateName =
                        messageTemplates.find(
                          (template) =>
                            template.id === campaign.template_id
                        )?.name ||
                        campaign.templateName ||
                        '-';

                      return (
                        <tr key={campaign.id}>
                          <td>{startIndex + index + 1}</td>

                          <td>{campaign.name}</td>

                          <td>{campaign.businessName || '-'}</td>

                          <td>{templateName}</td>

                          <td>{campaign.status}</td>

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
                                onClick={() =>
                                  startEditingCampaign(campaign)
                                }
                                disabled={campaignActionLoading}
                              >
                                Edit
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
    </section>
  );
}

export default Campaigns;