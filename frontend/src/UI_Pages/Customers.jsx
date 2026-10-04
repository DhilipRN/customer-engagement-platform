import { useState } from 'react';

function Customers({
  businesses,
  customers,
  customerLoading,
  customerError,
  newCustomer,
  setNewCustomer,
  customerSubmitting,
  customerMessage,
  handleAddCustomer,
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

  const pageSize = 15;

  const filteredCustomers = customers.filter((customer) => {
    const search = searchTerm.trim().toLowerCase();

  return (
    String(customer.name || '').toLowerCase().includes(search) ||
    String(customer.phone || '').toLowerCase().includes(search) ||
    String(customer.email || '').toLowerCase().includes(search) ||
    String(customer.businessName || '').toLowerCase().includes(search) ||
    (customer.consent_given ? 'yes' : 'no').includes(search)
  );
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
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Customers</h3>
          <p>Customers across your businesses</p>
        </div>
      </div>

      {/* ======================================================
          ADD CUSTOMER
      ====================================================== */}

      <form
        onSubmit={handleAddCustomer}
        className="customer-form"
      >
        <h3>Add Customer</h3>

        <label>
          Business

          <select
            value={newCustomer.business_id}
            onChange={(event) =>
              setNewCustomer({
                ...newCustomer,
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
            }}
            pattern="[0-9]{10}"
            maxLength={10}
            minLength={10}
            title="Please enter exactly 10 digits"
            placeholder="Enter 10-digit phone number"
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

          Customer has given consent to receive
          messages
        </label>

        <button
          type="submit"
          disabled={customerSubmitting}
        >
          {customerSubmitting
            ? 'Adding...'
            : 'Add Customer'}
        </button>

        {customerMessage && (
          <p>{customerMessage}</p>
        )}
      </form>

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
          <div className="form-group">
            <label htmlFor="customer-search">
              Search Customers
            </label>

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
          </div>

          {customers.length === 0 ? (
            <p>No customers found.</p>
          ) : filteredCustomers.length === 0 ? (
            <p>No customers match your search.</p>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Name</th>
                      <th>Business</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Consent</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedCustomers.map((customer, index) => (
                      <tr key={customer.id}>
                        <td>{startIndex + index + 1}</td>

                        <td>{customer.name}</td>

                        <td>{customer.businessName}</td>

                        <td>{customer.phone}</td>

                        <td>{customer.email || '-'}</td>

                        <td>
                          {customer.consent_given ? 'Yes' : 'No'}
                        </td>

                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              startEditingCustomer(customer)
                            }
                            disabled={customerActionLoading}
                          >
                            Edit
                          </button>

                          <button
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
                  {Math.min(startIndex + pageSize, totalCustomers)}
                  {' '}of {totalCustomers} customers
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

export default Customers;