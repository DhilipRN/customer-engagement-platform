import Customers from './UI_Pages/Customers';
import Dashboard from './UI_Pages/Dashboard';
import Businesses from './UI_Pages/Businesses';
import Purchases from './UI_Pages/Purchases';
import MessageTemplates from './UI_Pages/MessageTemplates';
import Campaigns from './UI_Pages/Campaigns';
import ReviewAutomation from './UI_Pages/ReviewAutomation';
import Messages from './UI_Pages/Messages';
import Appointments from './UI_Pages/Appointments';
import { useEffect, useState } from 'react';
import './App.css';
import Login from './Login';
import { supabase } from './supabaseClient';
import { apiFetch } from './api';


const menuItems = [
  'Dashboard',
  'Businesses',
  'Customers',
  'Purchases',
  'Message Templates',
  'Campaigns',
  'Review Automation',
  'Appointments',
  'Messages',
];

function App() {

    const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setSession(session);
        setAuthLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);
  
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
              : window.location.pathname === '/appointments'
                ? 'Appointments'
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

    // -----------------------------
// Appointments
// -----------------------------
const [appointments, setAppointments] = useState([]);
const [appointmentLoading, setAppointmentLoading] = useState(false);
const [appointmentError, setAppointmentError] = useState('');

const [newAppointment, setNewAppointment] = useState({
  business_id: '',
  customer_id: '',
  appointment_date: '',
  appointment_time: '',
  appointment_type: '',
  reminder_enabled: true,
  reminder_minutes: 1440,
  template_id: '',
});

const [appointmentSubmitting, setAppointmentSubmitting] = useState(false);
const [appointmentMessage, setAppointmentMessage] = useState('');

const [editingAppointment, setEditingAppointment] = useState(null);

const [editAppointmentForm, setEditAppointmentForm] = useState({
  appointment_date: '',
  appointment_time: '',
  appointment_type: '',
  status: 'scheduled',
});

const [appointmentActionLoading, setAppointmentActionLoading] =
  useState(false);

  // ============================================================
  // BACKEND HEALTH
  // ============================================================

  useEffect(() => {
    apiFetch('http://localhost:3000/health')
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
        const response = await apiFetch(
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
        const businessesResponse = await apiFetch(
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
                apiFetch(
                  `http://localhost:3000/customers?business_id=${business.id}`
                )
              )
            ),
            Promise.all(
              businessList.map((business) =>
                apiFetch(
                  `http://localhost:3000/campaigns?business_id=${business.id}`
                )
              )
            ),
            Promise.all(
              businessList.map((business) =>
                apiFetch(
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
    if (
      activePage !== 'Customers' &&
      activePage !== 'Appointments'
    ) {
      return;
    }

    async function loadCustomers() {
      setCustomerLoading(true);
      setCustomerError('');

      try {
        const businessesResponse = await apiFetch(
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
            apiFetch(
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
        const businessesResponse = await apiFetch(
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
                apiFetch(
                  `http://localhost:3000/purchases?business_id=${business.id}`
                )
              )
            ),
            Promise.all(
              businessList.map((business) =>
                apiFetch(
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
  activePage !== 'Review Automation' &&
  activePage !== 'Appointments'
) {
  return;
}

    async function loadMessageTemplates() {
      setTemplateLoading(true);
      setTemplateError('');

      try {
        const businessesResponse = await apiFetch(
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
            apiFetch(
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
      const businessesResponse = await apiFetch(
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
          const response = await apiFetch(
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
      const businessesResponse = await apiFetch(
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
              apiFetch(
                `http://localhost:3000/messages?business_id=${business.id}`
              ),
              apiFetch(
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
        const businessesResponse = await apiFetch(
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
            apiFetch(
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
// LOAD APPOINTMENTS
// ============================================================

useEffect(() => {
  if (activePage !== 'Appointments') {
    return;
  }

  async function loadAppointments() {
    setAppointmentLoading(true);
    setAppointmentError('');

    try {
      const businessesResponse = await apiFetch(
        'http://localhost:3000/businesses'
      );

      if (!businessesResponse.ok) {
        throw new Error('Unable to load businesses');
      }

      const businessesResult = await businessesResponse.json();
      const businessList = businessesResult.data ?? [];

      setBusinesses(businessList);

      const appointmentResponses = await Promise.all(
        businessList.map((business) =>
          apiFetch(
            `http://localhost:3000/appointments?business_id=${business.id}`
          )
        )
      );

      if (appointmentResponses.some((response) => !response.ok)) {
        throw new Error('Unable to load appointments');
      }

      const appointmentResults = await Promise.all(
        appointmentResponses.map((response) => response.json())
      );

      const allAppointments = appointmentResults.flatMap(
        (result, index) =>
          (result.data ?? []).map((appointment) => ({
            ...appointment,
            businessName: businessList[index].name,
          }))
      );

      setAppointments(allAppointments);
    } catch (error) {
      setAppointmentError(error.message);
    } finally {
      setAppointmentLoading(false);
    }
  }

  loadAppointments();
}, [activePage]);

// ============================================================
// ADD APPOINTMENT
// ============================================================

async function handleAddAppointment(event) {
  event.preventDefault();

  setAppointmentSubmitting(true);
  setAppointmentMessage('');

  try {
    const payload = {
      ...newAppointment,
      reminder_minutes: Number(newAppointment.reminder_minutes),
      template_id: newAppointment.template_id || null,
    };

    const response = await apiFetch(
      'http://localhost:3000/appointments',
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
          'Unable to create appointment'
      );
    }

    const selectedBusiness = businesses.find(
      (business) => business.id === newAppointment.business_id
    );

    const selectedCustomer = customers.find(
      (customer) => customer.id === newAppointment.customer_id
    );

    setAppointments((previous) => [
      {
        ...result.data,
        businessName: selectedBusiness?.name || '',
        customerName: selectedCustomer?.name || '',
      },
      ...previous,
    ]);

    setNewAppointment({
      business_id: '',
      customer_id: '',
      appointment_date: '',
      appointment_time: '',
      appointment_type: '',
      reminder_enabled: true,
      reminder_minutes: 1440,
      template_id: '',
    });

    setAppointmentMessage('Appointment created successfully!');
  } catch (error) {
    setAppointmentMessage(error.message);
  } finally {
    setAppointmentSubmitting(false);
  }
}

// ============================================================
// EDIT APPOINTMENT
// ============================================================

function startEditingAppointment(appointment) {
  setEditingAppointment(appointment);

  setEditAppointmentForm({
    appointment_date: appointment.appointment_date || '',
    appointment_time: appointment.appointment_time || '',
    appointment_type: appointment.appointment_type || '',
    status: appointment.status || 'scheduled',
  });

  setAppointmentMessage('');
}

async function handleEditAppointment(event) {
  event.preventDefault();

  if (!editingAppointment) {
    return;
  }

  setAppointmentActionLoading(true);
  setAppointmentMessage('');

  try {
    const response = await apiFetch(
      `http://localhost:3000/appointments/${editingAppointment.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editAppointmentForm),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to update appointment'
      );
    }

    setAppointments((previous) =>
      previous.map((appointment) =>
        appointment.id === editingAppointment.id
          ? { ...appointment, ...result.data }
          : appointment
      )
    );

    setAppointmentMessage('Appointment updated successfully!');
    setEditingAppointment(null);
  } catch (error) {
    setAppointmentMessage(error.message);
  } finally {
    setAppointmentActionLoading(false);
  }
}

// ============================================================
// CANCEL APPOINTMENT
// ============================================================

async function handleCancelAppointment(appointment) {
  const confirmed = window.confirm(
    `Are you sure you want to cancel the appointment for ${
      appointment.customerName || 'this customer'
    }?`
  );

  if (!confirmed) {
    return;
  }

  setAppointmentActionLoading(true);
  setAppointmentMessage('');

  try {
    const response = await apiFetch(
      `http://localhost:3000/appointments/${appointment.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to cancel appointment'
      );
    }

    setAppointments((previous) =>
      previous.map((item) =>
        item.id === appointment.id
          ? { ...item, ...result.data }
          : item
      )
    );

    setAppointmentMessage('Appointment cancelled successfully!');

    if (editingAppointment?.id === appointment.id) {
      setEditingAppointment(null);
    }
  } catch (error) {
    setAppointmentMessage(error.message);
  } finally {
    setAppointmentActionLoading(false);
  }
}
  // ============================================================
  // BUSINESSES CRUD
  // ============================================================

  async function handleAddBusiness(event) {
    event.preventDefault();
    setBusinessSubmitting(true);
    setBusinessMessage('');

    try {
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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

    const response = await apiFetch(
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
    const response = await apiFetch(
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
    const response = await apiFetch(
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
    const response = await apiFetch(
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
    const response = await apiFetch(
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

    const response = await apiFetch(url, {
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

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout failed:', error);
      alert(error.message);
    }
  }
  // ============================================================
  // UI
  // ============================================================

if (authLoading) {
  return <div>Loading...</div>;
}

if (!session) {
  return <Login />;
}

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

    <button
      type="button"
      onClick={handleLogout}
      style={{
        marginTop: '8px',
        padding: '6px 10px',
        border: 'none',
        borderRadius: '6px',
        background: 'transparent',
        cursor: 'pointer',
        color: '#ffffff',
      }}
    >
      Logout
    </button>
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

      {activePage === 'Dashboard' ? (
  <Dashboard
    stats={stats}
    backendStatus={backendStatus}
    setActivePage={setActivePage}
  />

) : activePage === 'Businesses' ? (
  <Businesses
    businesses={businesses}
    businessLoading={businessLoading}
    businessError={businessError}
    newBusiness={newBusiness}
    setNewBusiness={setNewBusiness}
    businessSubmitting={businessSubmitting}
    businessMessage={businessMessage}
    handleAddBusiness={handleAddBusiness}
    editingBusiness={editingBusiness}
    editBusinessForm={editBusinessForm}
    setEditBusinessForm={setEditBusinessForm}
    businessActionLoading={businessActionLoading}
    handleEditBusiness={handleEditBusiness}
    setEditingBusiness={setEditingBusiness}
    startEditingBusiness={startEditingBusiness}
    handleDeleteBusiness={handleDeleteBusiness}
    />
) : activePage === 'Customers' ? (
  <Customers
    businesses={businesses}
    customers={customers}
    customerLoading={customerLoading}
    customerError={customerError}
    newCustomer={newCustomer}
    setNewCustomer={setNewCustomer}
    customerSubmitting={customerSubmitting}
    customerMessage={customerMessage}
    handleAddCustomer={handleAddCustomer}
    editingCustomer={editingCustomer}
    editCustomerForm={editCustomerForm}
    setEditCustomerForm={setEditCustomerForm}
    customerActionLoading={customerActionLoading}
    handleEditCustomer={handleEditCustomer}
    setEditingCustomer={setEditingCustomer}
    startEditingCustomer={startEditingCustomer}
    handleDeleteCustomer={handleDeleteCustomer}
    />

   ) : activePage === 'Purchases' ? (
  <Purchases
    businesses={businesses}
    customers={customers}
    purchases={purchases}
    purchaseLoading={purchaseLoading}
    purchaseError={purchaseError}
    newPurchase={newPurchase}
    setNewPurchase={setNewPurchase}
    purchaseSubmitting={purchaseSubmitting}
    purchaseMessage={purchaseMessage}
    handleAddPurchase={handleAddPurchase}
    editingPurchase={editingPurchase}
    editPurchaseForm={editPurchaseForm}
    setEditPurchaseForm={setEditPurchaseForm}
    purchaseActionLoading={purchaseActionLoading}
    handleEditPurchase={handleEditPurchase}
    setEditingPurchase={setEditingPurchase}
    startEditingPurchase={startEditingPurchase}
    handleDeletePurchase={handleDeletePurchase}
  />

   ) : activePage === 'Message Templates' ? (
  <MessageTemplates
    businesses={businesses}
    messageTemplates={messageTemplates}
    templateLoading={templateLoading}
    templateError={templateError}
    newTemplate={newTemplate}
    setNewTemplate={setNewTemplate}
    templateSubmitting={templateSubmitting}
    templateMessage={templateMessage}
    handleAddTemplate={handleAddTemplate}
    editingTemplate={editingTemplate}
    editTemplateForm={editTemplateForm}
    setEditTemplateForm={setEditTemplateForm}
    templateActionLoading={templateActionLoading}
    handleEditTemplate={handleEditTemplate}
    setEditingTemplate={setEditingTemplate}
    startEditingTemplate={startEditingTemplate}
    handleDeleteTemplate={handleDeleteTemplate}
  />
) : activePage === 'Campaigns' ? (
  <Campaigns
    businesses={businesses}
    messageTemplates={messageTemplates}
    campaigns={campaigns}
    campaignLoading={campaignLoading}
    campaignError={campaignError}
    newCampaign={newCampaign}
    setNewCampaign={setNewCampaign}
    campaignSubmitting={campaignSubmitting}
    campaignMessage={campaignMessage}
    handleAddCampaign={handleAddCampaign}
    editingCampaign={editingCampaign}
    editCampaignForm={editCampaignForm}
    setEditCampaignForm={setEditCampaignForm}
    campaignActionLoading={campaignActionLoading}
    handleEditCampaign={handleEditCampaign}
    setEditingCampaign={setEditingCampaign}
    startEditingCampaign={startEditingCampaign}
    handleDeleteCampaign={handleDeleteCampaign}
  />

    ) : activePage === 'Review Automation' ? (
  <ReviewAutomation
    businesses={businesses}
    messageTemplates={messageTemplates}
    selectedReviewBusinessId={
      selectedReviewBusinessId
    }
    setSelectedReviewBusinessId={
      setSelectedReviewBusinessId
    }
    reviewForm={reviewForm}
    setReviewForm={setReviewForm}
    reviewAutomationLoading={
      reviewAutomationLoading
    }
    reviewAutomationError={
      reviewAutomationError
    }
    reviewMessage={reviewMessage}
    reviewSubmitting={reviewSubmitting}
    handleSaveReviewAutomation={
      handleSaveReviewAutomation
    }
  />

  ) : activePage === 'Appointments' ? (
  <Appointments
    businesses={businesses}
    customers={customers}
    messageTemplates={messageTemplates}
    appointments={appointments}
    appointmentLoading={appointmentLoading}
    appointmentError={appointmentError}
    newAppointment={newAppointment}
    setNewAppointment={setNewAppointment}
    appointmentSubmitting={appointmentSubmitting}
    appointmentMessage={appointmentMessage}
    handleAddAppointment={handleAddAppointment}
    editingAppointment={editingAppointment}
    editAppointmentForm={editAppointmentForm}
    setEditAppointmentForm={setEditAppointmentForm}
    appointmentActionLoading={appointmentActionLoading}
    handleEditAppointment={handleEditAppointment}
    setEditingAppointment={setEditingAppointment}
    startEditingAppointment={startEditingAppointment}
    handleCancelAppointment={handleCancelAppointment}
  />
) : activePage === 'Messages' ? (
  <Messages
    messages={messages}
    messageLoading={messageLoading}
    messageError={messageError}
  />

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