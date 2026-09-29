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
  
  const [activePage, setActivePage] = useState(
  window.location.pathname === '/message-templates'
    ? 'Message Templates'
    : window.location.pathname === '/campaigns'
      ? 'Campaigns'
      : window.location.pathname === '/businesses'
        ? 'Businesses'
        : window.location.pathname === '/customers'
          ? 'Customers'
          : window.location.pathname === '/purchases'
            ? 'Purchases'
            : window.location.pathname === '/review-automation'
              ? 'Review Automation'
              : window.location.pathname === '/messages'
                ? 'Messages'
                : 'Dashboard'
);

  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [businessCount, setBusinessCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);

const [sentMessageCount, setSentMessageCount] = useState(0);

  // -----------------------------
  // Businesses
  // -----------------------------
  const [businesses, setBusinesses] = useState([]);
  const [businessLoading, setBusinessLoading] = useState(false);
  const [businessError, setBusinessError] = useState('');
  const [newBusiness, setNewBusiness] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    google_review_link: '',
  });
  const [businessSubmitting, setBusinessSubmitting] = useState(false);
  const [businessMessage, setBusinessMessage] = useState('');
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [editBusinessForm, setEditBusinessForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    google_review_link: '',
  });
  const [businessActionLoading, setBusinessActionLoading] = useState(false);

  // -----------------------------
  // Customers
  // -----------------------------
  const [customers, setCustomers] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');

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

  // -----------------------------
  // Purchases
  // -----------------------------
  const [purchases, setPurchases] = useState([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');

  const [newPurchase, setNewPurchase] = useState({
    business_id: '',
    customer_id: '',
    product_name: '',
    amount: '',
    purchase_date: '',
  });

  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState('');

  const [editingPurchase, setEditingPurchase] = useState(null);

  const [editPurchaseForm, setEditPurchaseForm] = useState({
    product_name: '',
    amount: '',
    purchase_date: '',
  });

  const [purchaseActionLoading, setPurchaseActionLoading] = useState(false);

  // -----------------------------
// Messages
// -----------------------------
const [messages, setMessages] = useState([]);
const [messageLoading, setMessageLoading] = useState(false);
const [messageError, setMessageError] = useState('');


  // -----------------------------
  // Message Templates
  // -----------------------------
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState('');

  const [newTemplate, setNewTemplate] = useState({
    business_id: '',
    name: '',
    category: '',
    message: '',
  });

  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('');

  const [editingTemplate, setEditingTemplate] = useState(null);

const [editTemplateForm, setEditTemplateForm] = useState({
  name: '',
  category: '',
  message: '',
});

// -----------------------------
// Review Automation
// -----------------------------
const [reviewAutomation, setReviewAutomation] = useState(null);
const [reviewAutomationLoading, setReviewAutomationLoading] = useState(false);
const [reviewAutomationError, setReviewAutomationError] = useState('');

const [selectedReviewBusinessId, setSelectedReviewBusinessId] =
  useState('');

const [reviewForm, setReviewForm] = useState({
  enabled: true,
  delay_minutes: 120,
  template_id: '',
});

const [reviewSubmitting, setReviewSubmitting] =
  useState(false);

const [reviewMessage, setReviewMessage] =
  useState('');


const [templateActionLoading, setTemplateActionLoading] = useState(false);

  // -----------------------------
  // Campaigns
  // -----------------------------
  const [campaigns, setCampaigns] = useState([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignError, setCampaignError] = useState('');

  const [newCampaign, setNewCampaign] = useState({
    business_id: '',
    name: '',
    template_id: '',
    status: 'draft',
    scheduled_at: '',
  });

  const [campaignSubmitting, setCampaignSubmitting] =
    useState(false);

  const [campaignMessage, setCampaignMessage] =
    useState('');

  const [editingCampaign, setEditingCampaign] =
    useState(null);

  const [editCampaignForm, setEditCampaignForm] = useState({
    name: '',
    template_id: '',
    status: 'draft',
    scheduled_at: '',
  });

  const [campaignActionLoading, setCampaignActionLoading] =
    useState(false);

  // ============================================================
  // BACKEND HEALTH
  // ============================================================

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

  // ============================================================
  // LOAD BUSINESSES
  // ============================================================

  useEffect(() => {
    if (activePage !== 'Businesses') {
      return;
    }

    async function loadBusinesses() {
      setBusinessLoading(true);
      setBusinessError('');

      try {
        const response = await fetch(
          'http://localhost:3000/businesses'
        );

        if (!response.ok) {
          throw new Error('Unable to fetch businesses');
        }

        const result = await response.json();
        const businessList = result.data ?? [];

        setBusinesses(businessList);
        setBusinessCount(businessList.length);
      } catch (error) {
        setBusinessError(error.message);
      } finally {
        setBusinessLoading(false);
      }
    }

    loadBusinesses();
  }, [activePage]);

  // ============================================================
  // LOAD DASHBOARD DATA
  // ============================================================

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const businessesResponse = await fetch(
          'http://localhost:3000/businesses'
        );

        if (!businessesResponse.ok) {
          throw new Error('Unable to fetch businesses');
        }

        const businessesResult = await businessesResponse.json();
        const businessList = businessesResult.data ?? [];

        setBusinesses(businessList);
        setBusinessCount(businessList.length);

        const [customerResponses, campaignResponses, messageResponses] =
          await Promise.all([
            Promise.all(
              businessList.map((business) =>
                fetch(
                  `http://localhost:3000/customers?business_id=${business.id}`
                )
              )
            ),
            Promise.all(
              businessList.map((business) =>
                fetch(
                  `http://localhost:3000/campaigns?business_id=${business.id}`
                )
              )
            ),
            Promise.all(
              businessList.map((business) =>
                fetch(
                  `http://localhost:3000/messages?business_id=${business.id}&status=sent`
                )
              )
            ),
          ]);

        if (
          customerResponses.some((response) => !response.ok) ||
          campaignResponses.some((response) => !response.ok) ||
          messageResponses.some((response) => !response.ok)
        ) {
          throw new Error('Unable to load dashboard data');
        }

        const [customerResults, campaignResults, messageResults] =
          await Promise.all([
            Promise.all(customerResponses.map((response) => response.json())),
            Promise.all(campaignResponses.map((response) => response.json())),
            Promise.all(messageResponses.map((response) => response.json())),
          ]);

        setCustomerCount(
          customerResults.reduce(
            (count, result) => count + (result.data?.length ?? 0),
            0
          )
        );

        setCampaignCount(
          campaignResults.reduce(
            (count, result) => count + (result.data?.length ?? 0),
            0
          )
        );

        setSentMessageCount(
          messageResults.reduce(
            (count, result) => count + (result.data?.length ?? 0),
            0
          )
        );
      } catch (error) {
        console.error('Dashboard data fetch failed:', error);
      }
    }

    loadDashboardData();
  }, []);

  // ============================================================
  // LOAD CUSTOMERS
  // ============================================================

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
        const businessList = businessesResult.data ?? [];

        setBusinesses(businessList);

        const customerResponses = await Promise.all(
          businessList.map((business) =>
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

        const allCustomers = customerResults.flatMap(
          (result, index) =>
            (result.data ?? []).map((customer) => ({
              ...customer,
              businessName: businessList[index].name,
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

  // ============================================================
  // LOAD PURCHASES
  // ============================================================

  useEffect(() => {
    if (activePage !== 'Purchases') {
      return;
    }

    async function loadPurchases() {
      setPurchaseLoading(true);
      setPurchaseError('');

      try {
        const businessesResponse = await fetch(
          'http://localhost:3000/businesses'
        );

        if (!businessesResponse.ok) {
          throw new Error('Unable to fetch businesses');
        }

        const businessesResult = await businessesResponse.json();
        const businessList = businessesResult.data ?? [];

        setBusinesses(businessList);

        const [purchaseResponses, customerResponses] =
          await Promise.all([
            Promise.all(
              businessList.map((business) =>
                fetch(
                  `http://localhost:3000/purchases?business_id=${business.id}`
                )
              )
            ),
            Promise.all(
              businessList.map((business) =>
                fetch(
                  `http://localhost:3000/customers?business_id=${business.id}`
                )
              )
            ),
          ]);

        if (
          purchaseResponses.some((response) => !response.ok) ||
          customerResponses.some((response) => !response.ok)
        ) {
          throw new Error(
            'Unable to fetch purchases or customers'
          );
        }

        const [purchaseResults, customerResults] =
          await Promise.all([
            Promise.all(
              purchaseResponses.map((response) => response.json())
            ),
            Promise.all(
              customerResponses.map((response) => response.json())
            ),
          ]);

        const allCustomers = customerResults.flatMap(
          (result, index) =>
            (result.data ?? []).map((customer) => ({
              ...customer,
              businessName: businessList[index].name,
            }))
        );

        setCustomers(allCustomers);

        const customerMap = new Map(
          allCustomers.map((customer) => [
            customer.id,
            customer.name,
          ])
        );

        const allPurchases = purchaseResults.flatMap(
          (result, index) =>
            (result.data ?? []).map((purchase) => ({
              ...purchase,
              businessName: businessList[index].name,
              customerName:
                customerMap.get(purchase.customer_id) ||
                'Unknown',
            }))
        );

        setPurchases(allPurchases);
      } catch (error) {
        setPurchaseError(error.message);
      } finally {
        setPurchaseLoading(false);
      }
    }

    loadPurchases();
  }, [activePage]);

  // ============================================================
  // LOAD MESSAGE TEMPLATES
  // ============================================================

  useEffect(() => {
  if (
  activePage !== 'Message Templates' &&
  activePage !== 'Review Automation'
) {
  return;
}

    async function loadMessageTemplates() {
      setTemplateLoading(true);
      setTemplateError('');

      try {
        const businessesResponse = await fetch(
          'http://localhost:3000/businesses'
        );

        if (!businessesResponse.ok) {
          throw new Error('Unable to load businesses');
        }

        const businessesResult =
          await businessesResponse.json();

        const businessList = businessesResult.data ?? [];

        setBusinesses(businessList);

        const templateResponses = await Promise.all(
          businessList.map((business) =>
            fetch(
              `http://localhost:3000/message-templates?business_id=${business.id}`
            )
          )
        );

        if (
          templateResponses.some((response) => !response.ok)
        ) {
          throw new Error(
            'Unable to load message templates'
          );
        }

        const templateResults = await Promise.all(
          templateResponses.map((response) => response.json())
        );

        const allTemplates = templateResults.flatMap(
          (result, index) =>
            (result.data ?? []).map((template) => ({
              ...template,
              businessName: businessList[index].name,
            }))
        );

        setMessageTemplates(allTemplates);
      } catch (error) {
        setTemplateError(error.message);
      } finally {
        setTemplateLoading(false);
      }
    }

    loadMessageTemplates();
  }, [activePage]);

  // ============================================================
// LOAD REVIEW AUTOMATION
// ============================================================

useEffect(() => {
  if (activePage !== 'Review Automation') {
    return;
  }

  async function loadReviewAutomation() {
    setReviewAutomationLoading(true);
    setReviewAutomationError('');

    try {
      const businessesResponse = await fetch(
        'http://localhost:3000/businesses'
      );

      if (!businessesResponse.ok) {
        throw new Error('Unable to load businesses');
      }

      const businessesResult =
        await businessesResponse.json();

      const businessList = businessesResult.data ?? [];

      const results = await Promise.all(
        businessList.map(async (business) => {
          const response = await fetch(
            `http://localhost:3000/review-automations?business_id=${business.id}`
          );

          if (!response.ok) {
            throw new Error(
              `Unable to load review automation for ${business.name}`
            );
          }

          const result = await response.json();

          return {
            business,
            automation: result.data,
          };
        })
      );

      setReviewAutomation(results);
    } catch (error) {
      setReviewAutomationError(error.message);
    } finally {
      setReviewAutomationLoading(false);
    }
  }

  loadReviewAutomation();
}, [activePage]);

// ============================================================
// SELECT REVIEW AUTOMATION
// ============================================================

useEffect(() => {
  if (!selectedReviewBusinessId) {
    return;
  }

  const selected = reviewAutomation?.find(
    (item) =>
      item.business.id === selectedReviewBusinessId
  );

  if (selected?.automation) {
    setReviewForm({
      enabled: selected.automation.enabled ?? true,
      delay_minutes:
        selected.automation.delay_minutes ?? 120,
      template_id:
        selected.automation.template_id ?? '',
    });
  } else {
    setReviewForm({
      enabled: true,
      delay_minutes: 120,
      template_id: '',
    });
  }

  setReviewMessage('');
}, [selectedReviewBusinessId, reviewAutomation]);

// ============================================================
// LOAD MESSAGES
// ============================================================

useEffect(() => {
  if (activePage !== 'Messages') {
    return;
  }

  async function loadMessages() {
    setMessageLoading(true);
    setMessageError('');

    try {
      const businessesResponse = await fetch(
        'http://localhost:3000/businesses'
      );

      if (!businessesResponse.ok) {
        throw new Error('Unable to load businesses');
      }

      const businessesResult =
        await businessesResponse.json();

      const businessList = businessesResult.data ?? [];

      const results = await Promise.all(
        businessList.map(async (business) => {
          const [messagesResponse, customersResponse] =
            await Promise.all([
              fetch(
                `http://localhost:3000/messages?business_id=${business.id}`
              ),
              fetch(
                `http://localhost:3000/customers?business_id=${business.id}`
              ),
            ]);

          if (
            !messagesResponse.ok ||
            !customersResponse.ok
          ) {
            throw new Error(
              `Unable to load data for ${business.name}`
            );
          }

          const messagesResult =
            await messagesResponse.json();

          const customersResult =
            await customersResponse.json();

          return {
            business,
            messages: messagesResult.data ?? [],
            customers: customersResult.data ?? [],
          };
        })
      );

      const allMessages = results.flatMap(
        ({ business, messages, customers }) => {
          const customerMap = new Map(
            customers.map((customer) => [
              customer.id,
              customer.name,
            ])
          );

          return messages.map((message) => ({
            ...message,
            businessName: business.name,
            customerName:
              customerMap.get(message.customer_id) ||
              'Unknown Customer',
          }));
        }
      );

      setMessages(allMessages);
    } catch (error) {
      setMessageError(error.message);
    } finally {
      setMessageLoading(false);
    }
  }

  loadMessages();
}, [activePage]);

// LOAD CAMPAIGNS
  // ============================================================

  useEffect(() => {
    if (activePage !== 'Campaigns') {
      return;
    }

    async function loadCampaigns() {
      setCampaignLoading(true);
      setCampaignError('');

      try {
        const businessesResponse = await fetch(
          'http://localhost:3000/businesses'
        );

        if (!businessesResponse.ok) {
          throw new Error('Unable to load businesses');
        }

        const businessesResult =
          await businessesResponse.json();

        const businessList = businessesResult.data ?? [];

        setBusinesses(businessList);

        const campaignResponses = await Promise.all(
          businessList.map((business) =>
            fetch(
              `http://localhost:3000/campaigns?business_id=${business.id}`
            )
          )
        );

        if (
          campaignResponses.some(
            (response) => !response.ok
          )
        ) {
          throw new Error('Unable to load campaigns');
        }

        const campaignResults = await Promise.all(
          campaignResponses.map((response) =>
            response.json()
          )
        );

        const allCampaigns =
          campaignResults.flatMap(
            (result, index) =>
              (result.data ?? []).map((campaign) => ({
                ...campaign,
                businessName:
                  businessList[index].name,
              }))
          );

        setCampaigns(allCampaigns);
      } catch (error) {
        setCampaignError(error.message);
      } finally {
        setCampaignLoading(false);
      }
    }

    loadCampaigns();
  }, [activePage]);

  // ============================================================
  // BUSINESSES CRUD
  // ============================================================

  async function handleAddBusiness(event) {
    event.preventDefault();
    setBusinessSubmitting(true);
    setBusinessMessage('');

    try {
      const response = await fetch(
        'http://localhost:3000/businesses',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newBusiness),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.errors?.join(', ') ||
            'Unable to create business'
        );
      }

      setBusinesses((previous) => [result.data, ...previous]);
      setBusinessCount((previous) => previous + 1);
      setNewBusiness({
        name: '',
        phone: '',
        email: '',
        address: '',
        google_review_link: '',
      });
      setBusinessMessage('Business added successfully!');
    } catch (error) {
      setBusinessMessage(error.message);
    } finally {
      setBusinessSubmitting(false);
    }
  }

  function startEditingBusiness(business) {
    setEditingBusiness(business);
    setEditBusinessForm({
      name: business.name || '',
      phone: business.phone || '',
      email: business.email || '',
      address: business.address || '',
      google_review_link: business.google_review_link || '',
    });
    setBusinessMessage('');
  }

  async function handleEditBusiness(event) {
    event.preventDefault();

    if (!editingBusiness) {
      return;
    }

    setBusinessActionLoading(true);
    setBusinessMessage('');

    try {
      const response = await fetch(
        `http://localhost:3000/businesses/${editingBusiness.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editBusinessForm),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.errors?.join(', ') ||
            'Unable to update business'
        );
      }

      setBusinesses((previous) =>
        previous.map((business) =>
          business.id === editingBusiness.id
            ? { ...business, ...result.data }
            : business
        )
      );
      setBusinessMessage('Business updated successfully!');
      setEditingBusiness(null);
    } catch (error) {
      setBusinessMessage(error.message);
    } finally {
      setBusinessActionLoading(false);
    }
  }

  async function handleDeleteBusiness(business) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${business.name}"?`
    );

    if (!confirmed) {
      return;
    }

    setBusinessActionLoading(true);
    setBusinessMessage('');

    try {
      const response = await fetch(
        `http://localhost:3000/businesses/${business.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        let errorMessage = 'Unable to delete business';
        try {
          const result = await response.json();
          errorMessage =
            result.error ||
            result.errors?.join(', ') ||
            errorMessage;
        } catch {
          // DELETE may return 204 No Content.
        }
        throw new Error(errorMessage);
      }

      setBusinesses((previous) =>
        previous.filter((item) => item.id !== business.id)
      );
      setBusinessCount((previous) => Math.max(0, previous - 1));

      if (editingBusiness?.id === business.id) {
        setEditingBusiness(null);
      }

      setBusinessMessage('Business deleted successfully!');
    } catch (error) {
      setBusinessMessage(error.message);
    } finally {
      setBusinessActionLoading(false);
    }
  }

  // ============================================================
  // ADD CUSTOMER
  // ============================================================

  async function handleAddCustomer(event) {
    event.preventDefault();

    setCustomerSubmitting(true);
    setCustomerMessage('');

    try {
      const response = await fetch(
        'http://localhost:3000/customers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newCustomer),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.errors?.join(', ') ||
            'Unable to create customer'
        );
      }

      const selectedBusiness = businesses.find(
        (business) =>
          business.id === newCustomer.business_id
      );

      setCustomers((previous) => [
        {
          ...result.data,
          businessName: selectedBusiness?.name || '',
        },
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

  // ============================================================
  // EDIT CUSTOMER
  // ============================================================

  async function handleEditCustomer(event) {
    event.preventDefault();

    if (!editingCustomer) {
      return;
    }

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

      setCustomerMessage(
        'Customer updated successfully!'
      );

      setEditingCustomer(null);
    } catch (error) {
      setCustomerMessage(error.message);
    } finally {
      setCustomerActionLoading(false);
    }
  }

  // ============================================================
  // START EDIT CUSTOMER
  // ============================================================

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

  // ============================================================
  // DELETE CUSTOMER
  // ============================================================

  async function handleDeleteCustomer(customer) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${customer.name}?`
    );

    if (!confirmed) {
      return;
    }

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
          // DELETE may return 204 No Content.
        }

        throw new Error(errorMessage);
      }

      setCustomers((previous) =>
        previous.filter(
          (item) => item.id !== customer.id
        )
      );

      setCustomerCount((previous) =>
        Math.max(0, previous - 1)
      );

      setCustomerMessage(
        'Customer deleted successfully!'
      );

      if (editingCustomer?.id === customer.id) {
        setEditingCustomer(null);
      }
    } catch (error) {
      setCustomerMessage(error.message);
    } finally {
      setCustomerActionLoading(false);
    }
  }

  // ============================================================
  // ADD PURCHASE
  // ============================================================

  async function handleAddPurchase(event) {
    event.preventDefault();

    setPurchaseSubmitting(true);
    setPurchaseMessage('');

    try {
      const response = await fetch(
        'http://localhost:3000/purchases',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...newPurchase,
            amount: Number(newPurchase.amount),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.errors?.join(', ') ||
            'Unable to create purchase'
        );
      }

      const selectedBusiness = businesses.find(
        (business) =>
          business.id === newPurchase.business_id
      );

      const selectedCustomer = customers.find(
        (customer) =>
          customer.id === newPurchase.customer_id
      );

      setPurchases((previous) => [
        {
          ...result.data,
          businessName:
            selectedBusiness?.name || '',
          customerName:
            selectedCustomer?.name || 'Unknown',
        },
        ...previous,
      ]);

      setPurchaseMessage(
        'Purchase added successfully!'
      );

      setNewPurchase({
        business_id: '',
        customer_id: '',
        product_name: '',
        amount: '',
        purchase_date: '',
      });
    } catch (error) {
      setPurchaseMessage(error.message);
    } finally {
      setPurchaseSubmitting(false);
    }
  }

  // ============================================================
  // EDIT PURCHASE
  // ============================================================

  async function handleEditPurchase(event) {
    event.preventDefault();

    if (!editingPurchase) {
      return;
    }

    setPurchaseActionLoading(true);
    setPurchaseMessage('');

    try {
      const response = await fetch(
        `http://localhost:3000/purchases/${editingPurchase.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...editPurchaseForm,
            amount: Number(editPurchaseForm.amount),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.errors?.join(', ') ||
            'Unable to update purchase'
        );
      }

      setPurchases((previous) =>
        previous.map((purchase) =>
          purchase.id === editingPurchase.id
            ? {
                ...purchase,
                ...result.data,
              }
            : purchase
        )
      );

      setPurchaseMessage(
        'Purchase updated successfully!'
      );

      setEditingPurchase(null);
    } catch (error) {
      setPurchaseMessage(error.message);
    } finally {
      setPurchaseActionLoading(false);
    }
  }

  // ============================================================
  // START EDIT PURCHASE
  // ============================================================

  function startEditingPurchase(purchase) {
    setEditingPurchase(purchase);

    setEditPurchaseForm({
      product_name: purchase.product_name || '',
      amount:
        purchase.amount == null
          ? ''
          : String(purchase.amount),
      purchase_date: purchase.purchase_date
        ? purchase.purchase_date.slice(0, 10)
        : '',
    });

    setPurchaseMessage('');
  }

  // ============================================================
  // DELETE PURCHASE
  // ============================================================

  async function handleDeletePurchase(purchase) {
    const confirmed = window.confirm(
      `Are you sure you want to delete the purchase "${purchase.product_name}"?`
    );

    if (!confirmed) {
      return;
    }

    setPurchaseActionLoading(true);
    setPurchaseMessage('');

    try {
      const response = await fetch(
        `http://localhost:3000/purchases/${purchase.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        let errorMessage = 'Unable to delete purchase';

        try {
          const result = await response.json();

          errorMessage =
            result.error ||
            result.errors?.join(', ') ||
            errorMessage;
        } catch {
          // DELETE may return 204 No Content.
        }

        throw new Error(errorMessage);
      }

      setPurchases((previous) =>
        previous.filter(
          (item) => item.id !== purchase.id
        )
      );

      if (editingPurchase?.id === purchase.id) {
        setEditingPurchase(null);
      }

      setPurchaseMessage(
        'Purchase deleted successfully!'
      );
    } catch (error) {
      setPurchaseMessage(error.message);
    } finally {
      setPurchaseActionLoading(false);
    }
  }

  // ============================================================
  // ADD MESSAGE TEMPLATE
  // ============================================================

  async function handleAddTemplate(event) {
    event.preventDefault();

    setTemplateSubmitting(true);
    setTemplateMessage('');

    try {
      const response = await fetch(
        'http://localhost:3000/message-templates',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newTemplate),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.errors?.join(', ') ||
            'Unable to create message template'
        );
      }

      const selectedBusiness = businesses.find(
        (business) =>
          business.id === newTemplate.business_id
      );

      setMessageTemplates((previous) => [
        {
          ...result.data,
          businessName:
            selectedBusiness?.name || '',
        },
        ...previous,
      ]);

      setNewTemplate({
        business_id: '',
        name: '',
        category: '',
        message: '',
      });

      setTemplateMessage(
        'Message template created successfully!'
      );
    } catch (error) {
      setTemplateMessage(error.message);
    } finally {
      setTemplateSubmitting(false);
    }
  }

  async function handleAddCampaign(event) {
  event.preventDefault();

  setCampaignSubmitting(true);
  setCampaignMessage('');

  try {
    const payload = {
      ...newCampaign,
      scheduled_at:
        newCampaign.status === 'scheduled'
          ? newCampaign.scheduled_at
          : undefined,
    };

    const response = await fetch(
      'http://localhost:3000/campaigns',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to create campaign'
      );
    }

    const selectedBusiness = businesses.find(
      (business) =>
        business.id === newCampaign.business_id
    );

    const selectedTemplate = messageTemplates.find(
      (template) =>
        template.id === newCampaign.template_id
    );

    setCampaigns((previous) => [
      {
        ...result.data,
        businessName:
          selectedBusiness?.name || '',
        templateName:
          selectedTemplate?.name || '',
      },
      ...previous,
    ]);

    setNewCampaign({
      business_id: '',
      name: '',
      template_id: '',
      status: 'draft',
      scheduled_at: '',
    });

    setCampaignMessage(
      'Campaign created successfully!'
    );
  } catch (error) {
    setCampaignMessage(error.message);
  } finally {
    setCampaignSubmitting(false);
  }
}
// ============================================================
// EDIT CAMPAIGN
// ============================================================

async function handleEditCampaign(event) {
  event.preventDefault();

  if (!editingCampaign) {
    return;
  }

  setCampaignActionLoading(true);
  setCampaignMessage('');

  try {
    const response = await fetch(
      `http://localhost:3000/campaigns/${editingCampaign.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...editCampaignForm,
          scheduled_at:
            editCampaignForm.status === 'scheduled'
              ? editCampaignForm.scheduled_at
              : undefined,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to update campaign'
      );
    }

    setCampaigns((previous) =>
      previous.map((campaign) =>
        campaign.id === editingCampaign.id
          ? {
              ...campaign,
              ...result.data,
            }
          : campaign
      )
    );

    setCampaignMessage(
      'Campaign updated successfully!'
    );

    setEditingCampaign(null);
  } catch (error) {
    setCampaignMessage(error.message);
  } finally {
    setCampaignActionLoading(false);
  }
}

// ============================================================
// DELETE CAMPAIGN
// ============================================================

async function handleDeleteCampaign(campaign) {
  const confirmed = window.confirm(
    `Are you sure you want to delete "${campaign.name}"?`
  );

  if (!confirmed) {
    return;
  }

  setCampaignActionLoading(true);
  setCampaignMessage('');

  try {
    const response = await fetch(
      `http://localhost:3000/campaigns/${campaign.id}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      let errorMessage = 'Unable to delete campaign';

      try {
        const result = await response.json();

        errorMessage =
          result.error ||
          result.errors?.join(', ') ||
          errorMessage;
      } catch {
        // DELETE may return 204 No Content.
      }

      throw new Error(errorMessage);
    }

    setCampaigns((previous) =>
      previous.filter(
        (item) => item.id !== campaign.id
      )
    );

    if (editingCampaign?.id === campaign.id) {
      setEditingCampaign(null);
    }

    setCampaignMessage(
      'Campaign deleted successfully!'
    );
  } catch (error) {
    setCampaignMessage(error.message);
  } finally {
    setCampaignActionLoading(false);
  }
}
function startEditingCampaign(campaign) {
  setEditingCampaign(campaign);

  setEditCampaignForm({
    name: campaign.name || '',
    template_id: campaign.template_id || '',
    status: campaign.status || 'draft',
    scheduled_at: campaign.scheduled_at
      ? new Date(campaign.scheduled_at)
          .toISOString()
          .slice(0, 16)
      : '',
  });

  setCampaignMessage('');
}

  async function handleEditTemplate(event) {
  event.preventDefault();

  if (!editingTemplate) {
    return;
  }

  setTemplateActionLoading(true);
  setTemplateMessage('');

  try {
    const response = await fetch(
      `http://localhost:3000/message-templates/${editingTemplate.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editTemplateForm),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to update message template'
      );
    }

    setMessageTemplates((previous) =>
      previous.map((template) =>
        template.id === editingTemplate.id
          ? {
              ...template,
              ...result.data,
            }
          : template
      )
    );

    setTemplateMessage(
      'Message template updated successfully!'
    );

    setEditingTemplate(null);
  } catch (error) {
    setTemplateMessage(error.message);
  } finally {
    setTemplateActionLoading(false);
  }
}

function startEditingTemplate(template) {
    console.log('Starting edit for:', template.name);

  setEditingTemplate(template);

  setEditTemplateForm({
    name: template.name || '',
    category: template.category || '',
    message: template.message || '',
  });

  setTemplateMessage('');
}

async function handleDeleteTemplate(template) {
  const confirmed = window.confirm(
    `Are you sure you want to delete "${template.name}"?`
  );

  if (!confirmed) {
    return;
  }

  setTemplateActionLoading(true);
  setTemplateMessage('');

  try {
    const response = await fetch(
      `http://localhost:3000/message-templates/${template.id}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      let result = {};

      try {
        result = await response.json();
      } catch {
        // DELETE may return 204 No Content
      }

      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to delete message template'
      );
    }

    setMessageTemplates((previous) =>
      previous.filter(
        (item) => item.id !== template.id
      )
    );

    if (editingTemplate?.id === template.id) {
      setEditingTemplate(null);
    }

    setTemplateMessage(
      'Message template deleted successfully!'
    );
  } catch (error) {
    setTemplateMessage(error.message);
  } finally {
    setTemplateActionLoading(false);
  }
}

  // ============================================================
  // DASHBOARD STATS
  // ============================================================

  const stats = [
    {
      label: 'Total Businesses',
      value: String(businessCount),
      icon: '🏢',
    },
    {
      label: 'Total Customers',
      value: String(customerCount),
      icon: '👥',
    },
    {
      label: 'Campaigns',
      value: String(campaignCount),
      icon: '📣',
    },
    {
      label: 'Messages Sent',
      value: String(sentMessageCount),
      icon: '✉️',
    },
  ];

  async function handleSaveReviewAutomation(event) {
  event.preventDefault();

  if (!selectedReviewBusinessId) {
    setReviewMessage('Please select a business.');
    return;
  }

  if (!reviewForm.template_id) {
    setReviewMessage('Please select a review template.');
    return;
  }

  setReviewSubmitting(true);
  setReviewMessage('');

  try {
    const existing = reviewAutomation?.find(
      (item) =>
        item.business.id === selectedReviewBusinessId
    );

    const payload = {
      business_id: selectedReviewBusinessId,
      enabled: reviewForm.enabled,
      delay_minutes: Number(
        reviewForm.delay_minutes
      ),
      template_id: reviewForm.template_id,
    };

    const method = existing?.automation
      ? 'PUT'
      : 'POST';

    const url = existing?.automation
      ? `http://localhost:3000/review-automations/${existing.automation.id}`
      : 'http://localhost:3000/review-automations';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to save review automation'
      );
    }

    setReviewAutomation((previous) =>
      (previous ?? []).map((item) =>
        item.business.id === selectedReviewBusinessId
          ? {
              ...item,
              automation: result.data,
            }
          : item
      )
    );

    setReviewMessage(
      'Review automation saved successfully!'
    );
  } catch (error) {
    setReviewMessage(error.message);
  } finally {
    setReviewSubmitting(false);
  }
}
  // ============================================================
  // UI
  // ============================================================

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
              className={`nav-item ${
                activePage === item ? 'active' : ''
              }`}
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
            <p className="breadcrumb">
              Workspace / {activePage}
            </p>

            <h1>{activePage}</h1>
          </div>

          <div className="admin-badge">
            <span className="status-dot" />
            Admin Workspace
          </div>
        </header>

        {/* ======================================================
            DASHBOARD
        ====================================================== */}

        {activePage === 'Dashboard' ? (
          <>
            <section className="welcome">
              <div>
                <p className="eyebrow">OVERVIEW</p>

                <h2>
                  Welcome to your workspace 👋
                </h2>

                <p>
                  Manage businesses, customers,
                  campaigns, and review automation
                  from one place.
                </p>
              </div>
            </section>

            <section className="stats-grid">
              {stats.map((stat) => (
                <article
                  className="stat-card"
                  key={stat.label}
                >
                  <div className="stat-top">
                    <span>{stat.label}</span>

                    <span className="stat-icon">
                      {stat.icon}
                    </span>
                  </div>

                  <strong>{stat.value}</strong>

                  <p>Live backend data</p>
                </article>
              ))}
            </section>

            <section className="content-grid">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Quick Actions</h3>
                    <p>
                      Jump into a workspace feature
                    </p>
                  </div>
                </div>

                <div className="quick-actions">
                  {[
                    'Businesses',
                    'Customers',
                    'Campaigns',
                    'Messages',
                  ].map((item) => (
                    <button
                      key={item}
                      className="quick-action"
                      onClick={() =>
                        setActivePage(item)
                      }
                    >
                      <span>{item}</span>
                      <span className="action-arrow">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>System Status</h3>
                    <p>
                      Application setup overview
                    </p>
                  </div>
                </div>

                <div className="status-row">
                  <span>Frontend</span>

                  <span className="status-label">
                    <span className="status-dot" />
                    Running
                  </span>
                </div>

                <div className="status-row">
                  <span>Backend</span>

                  <span
                    className={`status-label ${
                      backendStatus === 'Connected'
                        ? ''
                        : 'pending'
                    }`}
                  >
                    {backendStatus}
                  </span>
                </div>

                <div className="status-row">
                  <span>Supabase</span>

                  <span className="status-label pending">
                    Connected through backend
                  </span>
                </div>

                <p className="panel-note">
                  Dashboard data is connected to your backend.
                </p>
              </article>
            </section>
          </>

        /* ======================================================
           BUSINESSES / CUSTOMERS
        ====================================================== */

         ) : activePage === 'Businesses' ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Businesses</h3>
                <p>Manage the businesses connected to your platform.</p>
              </div>
            </div>

            <form className="customer-form" onSubmit={handleAddBusiness}>
              <h3>Add Business</h3>

              <div className="form-grid">
                <label>
                  Business Name
                  <input
                    value={newBusiness.name}
                    onChange={(event) =>
                      setNewBusiness({ ...newBusiness, name: event.target.value })
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
                      setNewBusiness({ ...newBusiness, phone: event.target.value })
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
                      setNewBusiness({ ...newBusiness, email: event.target.value })
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
                      setNewBusiness({ ...newBusiness, address: event.target.value })
                    }
                    placeholder="Enter business address"
                    rows="3"
                  />
                </label>
              </div>

              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="submit" disabled={businessSubmitting}>
                  {businessSubmitting ? 'Adding...' : 'Add Business'}
                </button>
              </div>

              {businessMessage && <p>{businessMessage}</p>}
            </form>

            {editingBusiness && (
              <form className="customer-form" onSubmit={handleEditBusiness}>
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
                      value={editBusinessForm.google_review_link}
                      onChange={(event) =>
                        setEditBusinessForm((previous) => ({
                          ...previous,
                          google_review_link: event.target.value,
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
                  <button type="submit" disabled={businessActionLoading}>
                    {businessActionLoading ? 'Saving...' : 'Save Changes'}
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

            {businessLoading ? (
              <p>Loading businesses...</p>
            ) : businessError ? (
              <p className="error-message">{businessError}</p>
            ) : businesses.length === 0 ? (
              <p>No businesses found.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Address</th>
                      <th>Google Review Link</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businesses.map((business) => (
                      <tr key={business.id}>
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
                              onClick={() => startEditingBusiness(business)}
                              disabled={businessActionLoading}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBusiness(business)}
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
            )}
          </section>

) : activePage === 'Customers' ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Customers</h3>
                <p>
                  Customers across your businesses
                </p>
              </div>
            </div>

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
                      business_id:
                        event.target.value,
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
                    const digitsOnly =
                      event.target.value
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
                  checked={
                    newCustomer.consent_given
                  }
                  onChange={(event) =>
                    setNewCustomer({
                      ...newCustomer,
                      consent_given:
                        event.target.checked,
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
                      const digitsOnly =
                        event.target.value
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
                    checked={
                      editCustomerForm.consent_given
                    }
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
                  onClick={() =>
                    setEditingCustomer(null)
                  }
                  disabled={customerActionLoading}
                >
                  Cancel
                </button>
              </form>
            )}

            {customerLoading ? (
              <p>Loading customers...</p>
            ) : customerError ? (
              <p className="error-message">
                {customerError}
              </p>
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
                        <td>
                          {customer.businessName}
                        </td>
                        <td>{customer.phone}</td>
                        <td>
                          {customer.email || '-'}
                        </td>
                        <td>
                          {customer.consent_given
                            ? 'Yes'
                            : 'No'}
                        </td>

                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              startEditingCustomer(
                                customer
                              )
                            }
                            disabled={
                              customerActionLoading
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteCustomer(
                                customer
                              )
                            }
                            disabled={
                              customerActionLoading
                            }
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

        /* ======================================================
           PURCHASES
        ====================================================== */

        ) : activePage === 'Purchases' ? (
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
                      business_id:
                        event.target.value,
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
                      customer_id:
                        event.target.value,
                    })
                  }
                  required
                  disabled={
                    !newPurchase.business_id
                  }
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
                      product_name:
                        event.target.value,
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
                  value={
                    newPurchase.purchase_date
                  }
                  onChange={(event) =>
                    setNewPurchase({
                      ...newPurchase,
                      purchase_date:
                        event.target.value,
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
                      value={
                        editPurchaseForm.product_name
                      }
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
                      value={
                        editPurchaseForm.amount
                      }
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
                      value={
                        editPurchaseForm.purchase_date
                      }
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
                    disabled={
                      purchaseActionLoading
                    }
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
                    disabled={
                      purchaseActionLoading
                    }
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {purchaseLoading ? (
              <p>Loading purchases...</p>
            ) : purchaseError ? (
              <p className="error-message">
                {purchaseError}
              </p>
            ) : purchases.length === 0 ? (
              <p>No purchases found.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Business</th>
                      <th>Product / Service</th>
                      <th>Amount</th>
                      <th>Purchase Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td>
                          {purchase.customerName}
                        </td>

                        <td>
                          {purchase.businessName}
                        </td>

                        <td>
                          {purchase.product_name}
                        </td>

                        <td>
                          {purchase.amount == null
                            ? '-'
                            : `₹${Number(
                                purchase.amount
                              ).toFixed(2)}`}
                        </td>

                        <td>
                          {purchase.purchase_date
                            ? new Date(
                                purchase.purchase_date
                              ).toLocaleDateString()
                            : '-'}
                        </td>

                        <td>
                          <div className="form-actions">
                            <button
                              type="button"
                              onClick={() =>
                                startEditingPurchase(
                                  purchase
                                )
                              }
                              disabled={
                                purchaseActionLoading
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDeletePurchase(
                                  purchase
                                )
                              }
                              disabled={
                                purchaseActionLoading
                              }
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
            )}
          </section>

        /* ======================================================
           MESSAGE TEMPLATES
        ====================================================== */

        ) : activePage === 'Message Templates' ? (
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
                      business_id:
                        event.target.value,
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
    <option value="">Select a category</option>
    <option value="review">Review</option>
    <option value="promotional">Promotional</option>
    <option value="transactional">Transactional</option>
    <option value="other">Other</option>
  </select>
</label>

              <label>
                Message

                <textarea
                  value={newTemplate.message}
                  onChange={(event) =>
                    setNewTemplate({
                      ...newTemplate,
                      message:
                        event.target.value,
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

            {templateLoading ? (
              <p>
                Loading message templates...
              </p>
            ) : templateError ? (
              <p className="error-message">
                {templateError}
              </p>
            ) : messageTemplates.length === 0 ? (
              <p>No message templates found.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Template Name</th>
                      <th>Business</th>
                      <th>Category</th>
                      <th>Message</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {messageTemplates.map((template) => (
                        <tr key={template.id}>
                          <td>{template.name}</td>

                          <td>
                            {template.businessName}
                          </td>

                          <td>
                            {template.category}
                          </td>

                          <td>
                            {template.message}
                          </td>
                          
     <td>
  <button
    type="button"
    onClick={() => startEditingTemplate(template)}
  >
    Edit
  </button>

  <button
    type="button"
    onClick={() => handleDeleteTemplate(template)}
    disabled={templateActionLoading}
  >
    Delete
  </button>
</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

             /* ======================================================
           CAMPAIGNS
        ====================================================== */

        ) : activePage === 'Campaigns' ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Campaigns</h3>
                <p>
                  Create and manage customer messaging campaigns.
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
                    value={
                      newCampaign.scheduled_at
                    }
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
            template_id: event.target.value,
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
              event.target.value === 'scheduled'
                ? editCampaignForm.scheduled_at
                : '',
          })
        }
        required
      >
        <option value="draft">Draft</option>
        <option value="scheduled">Scheduled</option>
        <option value="running">Running</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </label>

    {editCampaignForm.status === 'scheduled' && (
      <label>
        Scheduled Date & Time

        <input
          type="datetime-local"
          value={editCampaignForm.scheduled_at}
          onChange={(event) =>
            setEditCampaignForm({
              ...editCampaignForm,
              scheduled_at: event.target.value,
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
        onClick={() => setEditingCampaign(null)}
        disabled={campaignActionLoading}
      >
        Cancel
      </button>
    </div>
  </form>
)}

            {campaignLoading ? (
              <p>Loading campaigns...</p>
            ) : campaignError ? (
              <p className="error-message">
                {campaignError}
              </p>
            ) : campaigns.length === 0 ? (
              <p>No campaigns found.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Campaign Name</th>
                      <th>Business</th>
                      <th>Status</th>
                      <th>Scheduled At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {campaigns.map((campaign) => (
                      <tr key={campaign.id}>
                        <td>{campaign.name}</td>

                        <td>
                          {campaign.businessName}
                        </td>

                        <td>{campaign.status}</td>

                        <td>
                          {campaign.scheduled_at
                            ? new Date(
                                campaign.scheduled_at
                              ).toLocaleString()
                            : '-'}
                        </td>

<td>
  <button
    type="button"
    onClick={() => startEditingCampaign(campaign)}
    disabled={campaignActionLoading}
  >
    Edit
  </button>

  <button
    type="button"
    onClick={() => handleDeleteCampaign(campaign)}
    disabled={campaignActionLoading}
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

        /* ======================================================
           OTHER PLACEHOLDER PAGES
        ====================================================== */

        ) : activePage === 'Review Automation' ? (
  <section className="panel">
    <div className="panel-heading">
      <div>
        <h2>Review Automation</h2>
        <p>
          Automatically request customer reviews after a purchase.
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
    <form onSubmit={handleSaveReviewAutomation}>
        <div className="form-group">
          <label>Business</label>

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
              <label>Delay (minutes)</label>

              <input
                type="number"
                min="0"
                value={reviewForm.delay_minutes}
                onChange={(event) =>
                  setReviewForm({
                    ...reviewForm,
                    delay_minutes:
                      Number(event.target.value),
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Review Message Template</label>

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
  </section>

) : activePage === 'Messages' ? (
  <section className="panel">
    <div className="panel-heading">
      <div>
        <h2>Messages</h2>
        <p>View messages sent through your campaigns.</p>
      </div>
    </div>

    {messageLoading ? (
      <p>Loading messages...</p>
    ) : messageError ? (
      <p className="error-message">{messageError}</p>
    ) : messages.length === 0 ? (
      <p>No messages found.</p>
    ) : (
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Customer</th>
              <th>Message</th>
              <th>Status</th>
              <th>Scheduled At</th>
              <th>Sent At</th>
            </tr>
          </thead>

          <tbody>
            {messages.map((message) => (
              <tr key={message.id}>
                <td>{message.businessName}</td>
                <td>{message.customerName}</td>
                <td>{message.message_text}</td>
                <td>{message.status}</td>
                <td>
                  {message.scheduled_at
                    ? new Date(
                        message.scheduled_at
                      ).toLocaleString()
                    : '-'}
                </td>
                <td>
                  {message.sent_at
                    ? new Date(
                        message.sent_at
                      ).toLocaleString()
                    : '-'}
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
    <div className="placeholder-icon">
      ✦
    </div>

    <h2>{activePage}</h2>

    <p>
      This section is part of your platform
      interface. We’ll implement its
      functionality and connect it to the
      backend in upcoming steps.
    </p>

    <button
      className="primary-button"
      onClick={() =>
        setActivePage('Dashboard')
      }
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