import { useState } from 'react';

function Purchases({
  businesses,
  customers,
  purchases,
  purchaseLoading,
  purchaseError,
  newPurchase,
  setNewPurchase,
  purchaseSubmitting,
  purchaseMessage,
  handleAddPurchase,
  editingPurchase,
  editPurchaseForm,
  setEditPurchaseForm,
  purchaseActionLoading,
  handleEditPurchase,
  setEditingPurchase,
  startEditingPurchase,
  handleDeletePurchase,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 15;

  const filteredPurchases = purchases.filter((purchase) => {
    const search = searchTerm.trim().toLowerCase();

    const purchaseDate = purchase.purchase_date
      ? new Date(purchase.purchase_date).toLocaleDateString()
      : '';

    return (
      String(purchase.customerName || '').toLowerCase().includes(search) ||
      String(purchase.businessName || '').toLowerCase().includes(search) ||
      String(purchase.product_name || '').toLowerCase().includes(search) ||
      String(purchase.amount ?? '').toLowerCase().includes(search) ||
      String(purchase.purchase_date || '').toLowerCase().includes(search) ||
      purchaseDate.toLowerCase().includes(search)
    );
  });

  const totalPurchases = filteredPurchases.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalPurchases / pageSize)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;

  const paginatedPurchases = filteredPurchases.slice(
    startIndex,
    startIndex + pageSize
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Purchases</h3>
          <p>
            Purchase history across your
            businesses
          </p>
        </div>
      </div>

      <form
        className="customer-form"
        onSubmit={handleAddPurchase}
      >
        <h3>Add Purchase</h3>

        <label>
          Business

          <select
            value={newPurchase.business_id}
            onChange={(event) =>
              setNewPurchase({
                ...newPurchase,
                business_id: event.target.value,
                customer_id: '',
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
            value={newPurchase.customer_id}
            onChange={(event) =>
              setNewPurchase({
                ...newPurchase,
                customer_id: event.target.value,
              })
            }
            required
            disabled={!newPurchase.business_id}
          >
            <option value="">
              Select a customer
            </option>

            {customers
              .filter(
                (customer) =>
                  customer.business_id ===
                  newPurchase.business_id
              )
              .map((customer) => (
                <option
                  key={customer.id}
                  value={customer.id}
                >
                  {customer.name}
                </option>
              ))}
          </select>
        </label>

        <label>
          Product / Service

          <input
            value={newPurchase.product_name}
            onChange={(event) =>
              setNewPurchase({
                ...newPurchase,
                product_name: event.target.value,
              })
            }
            placeholder="Enter product or service"
            required
          />
        </label>

        <label>
          Amount (₹)

          <input
            type="number"
            min="0"
            step="0.01"
            value={newPurchase.amount}
            onChange={(event) =>
              setNewPurchase({
                ...newPurchase,
                amount: event.target.value,
              })
            }
            placeholder="Enter amount"
            required
          />
        </label>

        <label>
          Purchase Date

          <input
            type="date"
            value={newPurchase.purchase_date}
            onChange={(event) =>
              setNewPurchase({
                ...newPurchase,
                purchase_date: event.target.value,
              })
            }
            required
          />
        </label>

        <button
          type="submit"
          disabled={purchaseSubmitting}
        >
          {purchaseSubmitting
            ? 'Adding...'
            : 'Add Purchase'}
        </button>

        {purchaseMessage && (
          <p>{purchaseMessage}</p>
        )}
      </form>

      {editingPurchase && (
        <form
          className="customer-form"
          onSubmit={handleEditPurchase}
        >
          <h3>Edit Purchase</h3>

          <div className="form-grid">
            <label>
              Product / Service

              <input
                type="text"
                value={editPurchaseForm.product_name}
                onChange={(event) =>
                  setEditPurchaseForm(
                    (previous) => ({
                      ...previous,
                      product_name:
                        event.target.value,
                    })
                  )
                }
                required
              />
            </label>

            <label>
              Amount (₹)

              <input
                type="number"
                min="0"
                step="0.01"
                value={editPurchaseForm.amount}
                onChange={(event) =>
                  setEditPurchaseForm(
                    (previous) => ({
                      ...previous,
                      amount:
                        event.target.value,
                    })
                  )
                }
                required
              />
            </label>

            <label>
              Purchase Date

              <input
                type="date"
                value={editPurchaseForm.purchase_date}
                onChange={(event) =>
                  setEditPurchaseForm(
                    (previous) => ({
                      ...previous,
                      purchase_date:
                        event.target.value,
                    })
                  )
                }
                required
              />
            </label>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              disabled={purchaseActionLoading}
            >
              {purchaseActionLoading
                ? 'Saving...'
                : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={() =>
                setEditingPurchase(null)
              }
              disabled={purchaseActionLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

       {/* ======================================================
          PURCHASE LIST: SEARCH AND PAGINATION
      ====================================================== */}

      {purchaseLoading ? (
        <p>Loading purchases...</p>
      ) : purchaseError ? (
        <p className="error-message">
          {purchaseError}
        </p>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="purchase-search">
              Search Purchases
            </label>

            <input
              id="purchase-search"
              type="search"
              value={searchTerm}
              placeholder="Search customer, business, product, amount or date..."
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {purchases.length === 0 ? (
            <p>No purchases found.</p>
          ) : filteredPurchases.length === 0 ? (
            <p>No purchases match your search.</p>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Customer</th>
                      <th>Business</th>
                      <th>Product / Service</th>
                      <th>Amount</th>
                      <th>Purchase Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedPurchases.map((purchase, index) => (
                      <tr key={purchase.id}>
                        <td>{startIndex + index + 1}</td>

                        <td>{purchase.customerName || '—'}</td>

                        <td>{purchase.businessName || '—'}</td>

                        <td>{purchase.product_name || '—'}</td>

                        <td>
                          {purchase.amount == null
                            ? '—'
                            : `₹${Number(
                                purchase.amount
                              ).toFixed(2)}`}
                        </td>

                        <td>
                          {purchase.purchase_date
                            ? new Date(
                                purchase.purchase_date
                              ).toLocaleDateString()
                            : '—'}
                        </td>

                        <td>
                          <div className="form-actions">
                            <button
                              type="button"
                              onClick={() =>
                                startEditingPurchase(purchase)
                              }
                              disabled={purchaseActionLoading}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDeletePurchase(purchase)
                              }
                              disabled={purchaseActionLoading}
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
                    totalPurchases
                  )}{' '}
                  of {totalPurchases} purchases
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

export default Purchases;