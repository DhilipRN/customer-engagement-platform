import { useState } from 'react';

function MessageTemplates({
  businesses,
  messageTemplates,
  templateLoading,
  templateError,
  newTemplate,
  setNewTemplate,
  templateSubmitting,
  templateMessage,
  handleAddTemplate,
  editingTemplate,
  editTemplateForm,
  setEditTemplateForm,
  templateActionLoading,
  handleEditTemplate,
  setEditingTemplate,
  startEditingTemplate,
  handleDeleteTemplate,
}) {
    const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 15;

  const filteredTemplates = messageTemplates.filter((template) => {
    const search = searchTerm.trim().toLowerCase();

    return (
      String(template.name || '').toLowerCase().includes(search) ||
      String(template.businessName || '').toLowerCase().includes(search) ||
      String(template.category || '').toLowerCase().includes(search) ||
      String(template.message || '').toLowerCase().includes(search)
    );
  });

  const totalTemplates = filteredTemplates.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalTemplates / pageSize)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;

  const paginatedTemplates = filteredTemplates.slice(
    startIndex,
    startIndex + pageSize
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Message Templates</h3>
          <p>
            Create and manage reusable customer
            messages.
          </p>
        </div>
      </div>

      <form
        className="customer-form"
        onSubmit={handleAddTemplate}
      >
        <h3>Add Message Template</h3>

        <label>
          Business

          <select
            value={newTemplate.business_id}
            onChange={(event) =>
              setNewTemplate({
                ...newTemplate,
                business_id: event.target.value,
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
          Template Name

          <input
            type="text"
            value={newTemplate.name}
            onChange={(event) =>
              setNewTemplate({
                ...newTemplate,
                name: event.target.value,
              })
            }
            placeholder="Example: Review Request"
            required
          />
        </label>

        <label>
          Category

          <select
            value={newTemplate.category}
            onChange={(event) =>
              setNewTemplate({
                ...newTemplate,
                category: event.target.value,
              })
            }
            required
          >
            <option value="">
              Select a category
            </option>
            <option value="review">
              Review
            </option>
            <option value="promotional">
              Promotional
            </option>
            <option value="transactional">
              Transactional
            </option>
            <option value="other">
              Other
            </option>
          </select>
        </label>

        <label>
          Message

          <textarea
            value={newTemplate.message}
            onChange={(event) =>
              setNewTemplate({
                ...newTemplate,
                message: event.target.value,
              })
            }
            placeholder="Enter your message template"
            rows="5"
            required
          />
        </label>

        <button
          type="submit"
          disabled={templateSubmitting}
        >
          {templateSubmitting
            ? 'Creating...'
            : 'Create Template'}
        </button>

        {templateMessage && (
          <p>{templateMessage}</p>
        )}
      </form>

      {editingTemplate && (
        <form
          className="customer-form"
          onSubmit={handleEditTemplate}
        >
          <h3>Edit Message Template</h3>

          <label>
            Template Name

            <input
              type="text"
              value={editTemplateForm.name}
              onChange={(event) =>
                setEditTemplateForm({
                  ...editTemplateForm,
                  name: event.target.value,
                })
              }
              required
            />
          </label>

          <label>
            Category

            <select
              value={editTemplateForm.category}
              onChange={(event) =>
                setEditTemplateForm({
                  ...editTemplateForm,
                  category: event.target.value,
                })
              }
              required
            >
              <option value="">
                Select a category
              </option>
              <option value="review">
                Review
              </option>
              <option value="promotional">
                Promotional
              </option>
              <option value="transactional">
                Transactional
              </option>
              <option value="other">
                Other
              </option>
            </select>
          </label>

          <label>
            Message

            <textarea
              value={editTemplateForm.message}
              onChange={(event) =>
                setEditTemplateForm({
                  ...editTemplateForm,
                  message: event.target.value,
                })
              }
              rows="5"
              required
            />
          </label>

          <div className="form-actions">
            <button
              type="submit"
              disabled={templateActionLoading}
            >
              {templateActionLoading
                ? 'Saving...'
                : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={() =>
                setEditingTemplate(null)
              }
              disabled={templateActionLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

           {/* ======================================================
          TEMPLATE LIST: SEARCH AND PAGINATION
      ====================================================== */}

      {templateLoading ? (
        <p>Loading message templates...</p>
      ) : templateError ? (
        <p className="error-message">
          {templateError}
        </p>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="template-search">
              Search Message Templates
            </label>

            <input
              id="template-search"
              type="search"
              value={searchTerm}
              placeholder="Search name, business, category or message..."
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {messageTemplates.length === 0 ? (
            <p>No message templates found.</p>
          ) : filteredTemplates.length === 0 ? (
            <p>No templates match your search.</p>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Template Name</th>
                      <th>Business</th>
                      <th>Category</th>
                      <th>Message</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedTemplates.map((template, index) => (
                      <tr key={template.id}>
                        <td>{startIndex + index + 1}</td>

                        <td>{template.name}</td>

                        <td>{template.businessName || '-'}</td>

                        <td>{template.category}</td>

                        <td>{template.message}</td>

                        <td>
                          <div className="form-actions">
                            <button
                              type="button"
                              onClick={() =>
                                startEditingTemplate(template)
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteTemplate(template)
                              }
                              disabled={templateActionLoading}
                            >
                              Delete
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
                    totalTemplates
                  )}{' '}
                  of {totalTemplates} templates
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

export default MessageTemplates;