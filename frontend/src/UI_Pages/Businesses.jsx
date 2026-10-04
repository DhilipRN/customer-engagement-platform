import { useState } from 'react';

function Businesses({
  businesses,
  businessLoading,
  businessError,
  newBusiness,
  setNewBusiness,
  businessSubmitting,
  businessMessage,
  handleAddBusiness,
  editingBusiness,
  editBusinessForm,
  setEditBusinessForm,
  businessActionLoading,
  handleEditBusiness,
  setEditingBusiness,
  startEditingBusiness,
  handleDeleteBusiness,
}) {
   const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 15;

  const filteredBusinesses = businesses.filter((business) => {
    const search = searchTerm.trim().toLowerCase();

    return (
      String(business.name || '').toLowerCase().includes(search) ||
      String(business.phone || '').toLowerCase().includes(search) ||
      String(business.email || '').toLowerCase().includes(search) ||
      String(business.address || '').toLowerCase().includes(search) ||
      String(business.google_review_link || '')
        .toLowerCase()
        .includes(search)
    );
  });

  const totalBusinesses = filteredBusinesses.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalBusinesses / pageSize)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;

  const paginatedBusinesses = filteredBusinesses.slice(
    startIndex,
    startIndex + pageSize
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Businesses</h3>
          <p>
            Manage the businesses connected to your platform.
          </p>
        </div>
      </div>

      {/* ======================================================
          ADD BUSINESS
      ====================================================== */}

      <form
        className="customer-form"
        onSubmit={handleAddBusiness}
      >
        <h3>Add Business</h3>

        <div className="form-grid">
          <label>
            Business Name

            <input
              value={newBusiness.name}
              onChange={(event) =>
                setNewBusiness({
                  ...newBusiness,
                  name: event.target.value,
                })
              }
              placeholder="Enter business name"
              required
            />
          </label>

          <label>
            Phone

            <input
              type="tel"
              value={newBusiness.phone}
              onChange={(event) =>
                setNewBusiness({
                  ...newBusiness,
                  phone: event.target.value,
                })
              }
              placeholder="Enter business phone"
            />
          </label>

          <label>
            Email

            <input
              type="email"
              value={newBusiness.email}
              onChange={(event) =>
                setNewBusiness({
                  ...newBusiness,
                  email: event.target.value,
                })
              }
              placeholder="Enter business email"
            />
          </label>

          <label>
            Google Review Link

            <input
              type="url"
              value={newBusiness.google_review_link}
              onChange={(event) =>
                setNewBusiness({
                  ...newBusiness,
                  google_review_link: event.target.value,
                })
              }
              placeholder="https://g.page/..."
            />
          </label>

          <label>
            Address

            <textarea
              value={newBusiness.address}
              onChange={(event) =>
                setNewBusiness({
                  ...newBusiness,
                  address: event.target.value,
                })
              }
              placeholder="Enter business address"
              rows="3"
            />
          </label>
        </div>

        <div
          className="form-actions"
          style={{ gridColumn: '1 / -1' }}
        >
          <button
            type="submit"
            disabled={businessSubmitting}
          >
            {businessSubmitting
              ? 'Adding...'
              : 'Add Business'}
          </button>
        </div>

        {businessMessage && (
          <p>{businessMessage}</p>
        )}
      </form>

      {/* ======================================================
          EDIT BUSINESS
      ====================================================== */}

      {editingBusiness && (
        <form
          className="customer-form"
          onSubmit={handleEditBusiness}
        >
          <h3>Edit Business</h3>

          <div className="form-grid">
            <label>
              Business Name

              <input
                value={editBusinessForm.name}
                onChange={(event) =>
                  setEditBusinessForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label>
              Phone

              <input
                type="tel"
                value={editBusinessForm.phone}
                onChange={(event) =>
                  setEditBusinessForm((previous) => ({
                    ...previous,
                    phone: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Email

              <input
                type="email"
                value={editBusinessForm.email}
                onChange={(event) =>
                  setEditBusinessForm((previous) => ({
                    ...previous,
                    email: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Google Review Link

              <input
                type="url"
                value={
                  editBusinessForm.google_review_link
                }
                onChange={(event) =>
                  setEditBusinessForm((previous) => ({
                    ...previous,
                    google_review_link:
                      event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Address

              <textarea
                value={editBusinessForm.address}
                onChange={(event) =>
                  setEditBusinessForm((previous) => ({
                    ...previous,
                    address: event.target.value,
                  }))
                }
                rows="3"
              />
            </label>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              disabled={businessActionLoading}
            >
              {businessActionLoading
                ? 'Saving...'
                : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={() => setEditingBusiness(null)}
              disabled={businessActionLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ======================================================
          BUSINESS LIST: SEARCH AND PAGINATION
      ====================================================== */}

      {businessLoading ? (
        <p>Loading businesses...</p>
      ) : businessError ? (
        <p className="error-message">
          {businessError}
        </p>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="business-search">
              Search Businesses
            </label>

            <input
              id="business-search"
              type="search"
              value={searchTerm}
              placeholder="Search by name, phone, email, address..."
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {businesses.length === 0 ? (
            <p>No businesses found.</p>
          ) : filteredBusinesses.length === 0 ? (
            <p>No businesses match your search.</p>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Address</th>
                      <th>Google Review Link</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedBusinesses.map((business, index) => (
                      <tr key={business.id}>
                        <td>{startIndex + index + 1}</td>

                        <td>{business.name}</td>

                        <td>{business.phone || '-'}</td>

                        <td>{business.email || '-'}</td>

                        <td>{business.address || '-'}</td>

                        <td>
                          {business.google_review_link ? (
                            <a
                              href={business.google_review_link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open Link
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>

                        <td>
                          <div className="form-actions">
                            <button
                              type="button"
                              onClick={() =>
                                startEditingBusiness(business)
                              }
                              disabled={businessActionLoading}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteBusiness(business)
                              }
                              disabled={businessActionLoading}
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
                    totalBusinesses
                  )}{' '}
                  of {totalBusinesses} businesses
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

export default Businesses;