import { useEffect, useState } from 'react';
import './App.css';

const menuItems = [
  'Dashboard',
  'Businesses',
  'Customers',
  'Purchases',
  'Message Templates',
  'Campaigns',
  'Review Automation',
  'Messages',
];

function App() {
  const [activePage, setActivePage] = useState('Dashboard');
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [businessCount, setBusinessCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [customers, setCustomers] = useState([]);
const [customerLoading, setCustomerLoading] = useState(false);
const [customerError, setCustomerError] = useState('');

const [businesses, setBusinesses] = useState([]);
const [newCustomer, setNewCustomer] = useState({
  business_id: '',
  name: '',
  phone: '',
  email: '',
  consent_given: false,
});
const [customerSubmitting, setCustomerSubmitting] = useState(false);
const [customerMessage, setCustomerMessage] = useState('');

const [editingCustomer, setEditingCustomer] = useState(null);
const [editCustomerForm, setEditCustomerForm] = useState({
  name: '',
  phone: '',
  email: '',
  consent_given: false,
});
const [customerActionLoading, setCustomerActionLoading] = useState(false);

   useEffect(() => {
    fetch('http://localhost:3000/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Backend request failed');
        }

        return response.json();
      })
      .then((data) => {
        setBackendStatus(
          data.status === 'ok' ? 'Connected' : 'Unavailable'
        );
      })
      .catch(() => {
        setBackendStatus('Not connected');
      });
  }, []);

useEffect(() => {
  fetch('http://localhost:3000/businesses')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Unable to fetch businesses');
      }

      return response.json();
    })
    .then((result) => {
      setBusinessCount(result.data.length);
    })
    .catch((error) => {
      console.error('Businesses fetch failed:', error);
    });
}, []);
useEffect(() => {
  async function loadCustomerCount() {
    try {
      const businessesResponse = await fetch(
        'http://localhost:3000/businesses'
      );

      if (!businessesResponse.ok) {
        throw new Error('Unable to fetch businesses');
      }

      const businessesResult = await businessesResponse.json();
      const businesses = businessesResult.data ?? [];
      setBusinesses(businesses);

      const customerResponses = await Promise.all(
        businesses.map((business) =>
          fetch(
            `http://localhost:3000/customers?business_id=${business.id}`
          )
        )
      );

      if (customerResponses.some((response) => !response.ok)) {
        throw new Error('Unable to fetch customers');
      }

      const customerResults = await Promise.all(
        customerResponses.map((response) => response.json())
      );

      const total = customerResults.reduce(
        (count, result) => count + (result.data?.length ?? 0),
        0
      );

      setCustomerCount(total);
    } catch (error) {
      console.error('Customer fetch failed:', error);
    }
  }

  loadCustomerCount();
}, []);

useEffect(() => {
  if (activePage !== 'Customers') {
    return;
  }

  async function loadCustomers() {
    setCustomerLoading(true);
    setCustomerError('');

    try {
      const businessesResponse = await fetch(
        'http://localhost:3000/businesses'
      );

      if (!businessesResponse.ok) {
        throw new Error('Unable to fetch businesses');
      }

      const businessesResult = await businessesResponse.json();
      const businesses = businessesResult.data ?? [];

      const customerResponses = await Promise.all(
        businesses.map((business) =>
          fetch(
            `http://localhost:3000/customers?business_id=${business.id}`
          )
        )
      );

      if (customerResponses.some((response) => !response.ok)) {
        throw new Error('Unable to fetch customers');
      }

      const customerResults = await Promise.all(
        customerResponses.map((response) => response.json())
      );

      const allCustomers = customerResults.flatMap((result, index) =>
        (result.data ?? []).map((customer) => ({
          ...customer,
          businessName: businesses[index].name,
        }))
      );

      setCustomers(allCustomers);
    } catch (error) {
      setCustomerError(error.message);
    } finally {
      setCustomerLoading(false);
    }
  }

  loadCustomers();
}, [activePage]);

async function handleAddCustomer(event) {
  event.preventDefault();
  setCustomerSubmitting(true);
  setCustomerMessage('');

  try {
    const response = await fetch('http://localhost:3000/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newCustomer),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Unable to create customer');
    }

    const selectedBusiness = businesses.find(
      (business) => business.id === newCustomer.business_id
    );

    setCustomers((previous) => [
      { ...result.data, businessName: selectedBusiness?.name || '' },
      ...previous,
    ]);

    setCustomerCount((previous) => previous + 1);

    setCustomerMessage('Customer added successfully!');

    setNewCustomer({
      business_id: '',
      name: '',
      phone: '',
      email: '',
      consent_given: false,
    });
  } catch (error) {
    setCustomerMessage(error.message);
  } finally {
    setCustomerSubmitting(false);
  }
}

async function handleEditCustomer(event) {
  event.preventDefault();

  if (!editingCustomer) return;

  setCustomerActionLoading(true);
  setCustomerMessage('');

  try {
    const response = await fetch(
      `http://localhost:3000/customers/${editingCustomer.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editCustomerForm),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to update customer'
      );
    }

    setCustomers((previous) =>
      previous.map((customer) =>
        customer.id === editingCustomer.id
          ? {
              ...customer,
              ...result.data,
            }
          : customer
      )
    );

    setCustomerMessage('Customer updated successfully!');
    setEditingCustomer(null);
  } catch (error) {
    setCustomerMessage(error.message);
  } finally {
    setCustomerActionLoading(false);
  }
}

function startEditingCustomer(customer) {
  setEditingCustomer(customer);

  setEditCustomerForm({
    name: customer.name || '',
    phone: customer.phone || '',
    email: customer.email || '',
    consent_given: Boolean(customer.consent_given),
  });

  setCustomerMessage('');
}

async function handleDeleteCustomer(customer) {
  const confirmed = window.confirm(
    `Are you sure you want to delete ${customer.name}?`
  );

  if (!confirmed) return;

  setCustomerActionLoading(true);
  setCustomerMessage('');

  try {
    const response = await fetch(
      `http://localhost:3000/customers/${customer.id}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      let errorMessage = 'Unable to delete customer';

      try {
        const result = await response.json();
        errorMessage =
          result.error ||
          result.errors?.join(', ') ||
          errorMessage;
      } catch {
        // The response may not contain a JSON body.
      }

      throw new Error(errorMessage);
    }

    setCustomers((previous) =>
      previous.filter((item) => item.id !== customer.id)
    );

    setCustomerCount((previous) => Math.max(0, previous - 1));
    setCustomerMessage('Customer deleted successfully!');

    if (editingCustomer?.id === customer.id) {
      setEditingCustomer(null);
    }
  } catch (error) {
    setCustomerMessage(error.message);
  } finally {
    setCustomerActionLoading(false);
  }
}
  const stats = [
    {
  label: 'Total Businesses',
  value: String(businessCount),
  icon: '🏢',
},
    { label: 'Total Customers', value: String(customerCount), icon: '👥' },
    { label: 'Campaigns', value: '0', icon: '📣' },
    { label: 'Messages Sent', value: '0', icon: '✉️' },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">C</div>
          <div>
            <h2>Connectly</h2>
            <span>Customer Engagement</span>
          </div>
        </div>

        <div className="menu-heading">WORKSPACE</div>

        <nav className="navigation">
          {menuItems.map((item) => (
            <button
              key={item}
              className={`nav-item ${activePage === item ? 'active' : ''}`}
              onClick={() => setActivePage(item)}
            >
              {item === 'Dashboard' && '▦'}
              {item === 'Businesses' && '🏢'}
              {item === 'Customers' && '♙'}
              {item === 'Purchases' && '🛍'}
              {item === 'Message Templates' && '▤'}
              {item === 'Campaigns' && '↗'}
              {item === 'Review Automation' && '☆'}
              {item === 'Messages' && '✉'}
              <span>{item}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">D</div>
          <div>
            <strong>Platform Admin</strong>
            <span>Administrator</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Workspace / {activePage}</p>
            <h1>{activePage}</h1>
          </div>
          <div className="admin-badge">
            <span className="status-dot" />
            Admin Workspace
          </div>
        </header>

        {activePage === 'Dashboard' ? (
          <>
            <section className="welcome">
              <div>
                <p className="eyebrow">OVERVIEW</p>
                <h2>Welcome to your workspace 👋</h2>
                <p>
                  Manage businesses, customers, campaigns, and review
                  automation from one place.
                </p>
              </div>
            </section>

            <section className="stats-grid">
              {stats.map((stat) => (
                <article className="stat-card" key={stat.label}>
                  <div className="stat-top">
                    <span>{stat.label}</span>
                    <span className="stat-icon">{stat.icon}</span>
                  </div>
                  <strong>{stat.value}</strong>
                  <p>Awaiting data connection</p>
                </article>
              ))}
            </section>

            <section className="content-grid">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Quick Actions</h3>
                    <p>Jump into a workspace feature</p>
                  </div>
                </div>

                <div className="quick-actions">
                  {['Businesses', 'Customers', 'Campaigns', 'Messages'].map(
                    (item) => (
                      <button
                        key={item}
                        className="quick-action"
                        onClick={() => setActivePage(item)}
                      >
                        <span>{item}</span>
                        <span className="action-arrow">→</span>
                      </button>
                    )
                  )}
                </div>
              </article>

              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>System Status</h3>
                    <p>Application setup overview</p>
                  </div>
                </div>

                <div className="status-row">
                  <span>Frontend</span>
                  <span className="status-label">
                    <span className="status-dot" /> Running
                  </span>
                </div>
                <div className="status-row">
                 <span
                  className={`status-label ${
                    backendStatus === 'Connected' ? '' : 'pending'
                  }`}
                >
                  {backendStatus}
</span>
                </div>
                <div className="status-row">
                  <span>Supabase</span>
                  <span className="status-label pending">
                    Not connected
                  </span>
                </div>
                <p className="panel-note">
                  The dashboard currently uses placeholder values.
                </p>
              </article>
            </section>
          </>
        ) : activePage === 'Customers' ? (
  <section className="panel">
    <div className="panel-heading">
      <div>
        <h3>Customers</h3>
        <p>Customers across your businesses</p>
      </div>
    </div>

    <form onSubmit={handleAddCustomer} className="customer-form">
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
      <option value="">Select a business</option>
      {businesses.map((business) => (
        <option key={business.id} value={business.id}>
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
        setNewCustomer({ ...newCustomer, name: event.target.value })
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
        setNewCustomer({ ...newCustomer, email: event.target.value })
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
    Customer has given consent to receive messages
  </label>

  <button type="submit" disabled={customerSubmitting}>
    {customerSubmitting ? 'Adding...' : 'Add Customer'}
  </button>

  {customerMessage && <p>{customerMessage}</p>}
</form>
{editingCustomer && (
  <form onSubmit={handleEditCustomer} className="customer-form">
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
            consent_given: event.target.checked,
          })
        }
      />
      Customer has given consent to receive messages
    </label>

    <button type="submit" disabled={customerActionLoading}>
      {customerActionLoading ? 'Saving...' : 'Save Changes'}
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

    {customerLoading ? (
      <p>Loading customers...</p>
    ) : customerError ? (
      <p className="error-message">{customerError}</p>
    ) : customers.length === 0 ? (
      <p>No customers found.</p>
    ) : (
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Business</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Consent</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
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
    onClick={() => startEditingCustomer(customer)}
    disabled={customerActionLoading}
  >
    Edit
  </button>

  <button
    type="button"
    onClick={() => handleDeleteCustomer(customer)}
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
    )}
  </section>
) : (
  <section className="placeholder-page">
    <div className="placeholder-icon">✦</div>
    <h2>{activePage}</h2>
    <p>
      This section is part of your platform interface. We’ll implement
      its functionality and connect it to the backend in upcoming
      steps.
    </p>
    <button
      className="primary-button"
      onClick={() => setActivePage('Dashboard')}
    >
      Back to Dashboard
    </button>
  </section>
)}
      </main>
    </div>
  );
}

export default App;