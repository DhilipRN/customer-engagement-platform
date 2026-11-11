import Customers from './UI_Pages/Customers';
import CustomerComeback from './UI_Pages/CustomerComeback';
import Dashboard from './UI_Pages/Dashboard';
import Businesses from './UI_Pages/Businesses';
import { applyBusinessMutation, getBusinessAuditWarning } from './businessState';
import Purchases from './UI_Pages/Purchases';
import MessageTemplates from './UI_Pages/MessageTemplates';
import Campaigns from './UI_Pages/Campaigns';
import ReviewAutomation from './UI_Pages/ReviewAutomation';
import Messages from './UI_Pages/Messages';
import Chats from './UI_Pages/Chats';
import Appointments from './UI_Pages/Appointments';
import UserProfiles from './UI_Pages/UserProfiles';
import BusinessMemberships from './UI_Pages/BusinessMemberships';
import WhatsAppSettings from './UI_Pages/WhatsAppSettings';
import { useEffect, useRef, useState } from 'react';
import './App.css';
import Login from './Login';
import { supabase } from './supabaseClient';
import { apiFetch } from './api';


const adminMenuItems = [
  'Dashboard',
  'Businesses',
  'Customers',
  'Customer Comeback',
  'Purchases',
  'Message Templates',
  'Campaigns',
  'Review Automation',
  'Appointments',
  'Chats',
  'Messages',
  'User Profiles',
  'Business Members',
  'WhatsApp Settings',
];

const clientMenuItems = [
  'Dashboard',
  'Customers',
  'Customer Comeback',
  'Purchases',
  'Message Templates',
  'Campaigns',
  'Review Automation',
  'Appointments',
  'Chats',
  'Messages',
  'Business Members',
  'WhatsApp Settings',
];

const FEATURE_PAGE_PERMISSIONS = Object.freeze({
  Customers: 'view_chats',
  Chats: 'view_chats',
  Messages: 'view_chats',
  Purchases: 'view_purchases',
  Campaigns: 'view_campaigns',
  'Message Templates': 'view_message_templates',
  Appointments: 'view_appointments',
  'Review Automation': 'view_automations',
  'Customer Comeback': 'view_automations',
});

const ALL_FEATURE_PERMISSIONS = Object.freeze(
  [...new Set(Object.values(FEATURE_PAGE_PERMISSIONS))]
    .concat([
      'view_customer_activity',
      'send_messages',
      'manage_customers',
      'manage_appointments',
      'manage_purchases',
      'manage_campaigns',
      'manage_message_templates',
      'manage_automations',
    ])
    .reduce((permissions, permission) => ({
      ...permissions,
      [permission]: true,
    }), {})
);

function createLoaderGuard() {
  let active = true;

  return {
    isActive: () => active,
    cleanup: () => {
      active = false;
    },
  };
}


function ClientDashboard({
  stats,
  backendStatus,
  setActivePage,
  businessName,
}) {
  return (
    <section>
      <div
        style={{
          background: 'linear-gradient(135deg, #5146e5, #7c6cf6)',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '30px',
          marginBottom: '22px',
          boxShadow: '0 10px 25px rgba(81, 70, 229, 0.18)',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '1.5px',
            opacity: 0.85,
            marginBottom: '8px',
          }}
        >
          CLIENT WORKSPACE
        </div>

        <h2
          style={{
            margin: '0 0 8px',
            fontSize: '26px',
          }}
        >
          Welcome to your workspace 👋
        </h2>

        <p
          style={{
            margin: 0,
            opacity: 0.9,
          }}
        >
          {businessName
            ? `Manage ${businessName}'s customers, purchases, campaigns, and messages from one place.`
            : 'Manage your customers, purchases, campaigns, and messages from one place.'}
        </p>
      </div>

      {businessName && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '22px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: '#6b7280',
              marginBottom: '4px',
            }}
          >
            ASSIGNED BUSINESS
          </div>

          <strong style={{ fontSize: '18px' }}>
            {businessName}
          </strong>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '16px',
          marginBottom: '22px',
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '20px',
              minHeight: '105px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  color: '#6b7280',
                  fontSize: '13px',
                }}
              >
                {stat.label}
              </span>

              <span style={{ fontSize: '20px' }}>
                {stat.icon}
              </span>
            </div>

            <div
              style={{
                fontSize: '30px',
                fontWeight: 700,
                marginTop: '12px',
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: '18px',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '22px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Quick Actions</h3>

          <p style={{ color: '#6b7280', fontSize: '13px' }}>
            Jump into your business operations.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <button
              type="button"
              className="primary-button"
              onClick={() => setActivePage('Customers')}
            >
              Customers →
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => setActivePage('Purchases')}
            >
              Purchases →
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => setActivePage('Campaigns')}
            >
              Campaigns →
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => setActivePage('Messages')}
            >
              Messages →
            </button>
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '22px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>System Status</h3>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <span>Frontend</span>
            <strong>Running</strong>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <span>Backend</span>
            <strong>{backendStatus}</strong>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 0',
            }}
          >
            <span>Workspace</span>
            <strong>{businessName || 'Not assigned'}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function App() {

    const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [userBusinessId, setUserBusinessId] = useState(null);
  const [userBusiness, setUserBusiness] = useState(null);
  const [requestedSelectedBusinessId, setSelectedBusinessId] = useState('');

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
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let profileLoadPromise = null;

    async function loadUserProfile() {
      if (profileLoadPromise) {
        return profileLoadPromise;
      }

      profileLoadPromise = (async () => {
      if (!session?.user) {
        setUserRole(null);
        setUserBusinessId(null);
        setUserBusiness(null);
        setBusinessAccessVerified(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role, business_id')
        .eq('id', session.user.id)
        .single();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Unable to load user profile:', error);
        setUserRole(null);
        setUserBusinessId(null);
        setUserBusiness(null);
        setBusinessAccessVerified(false);
        return;
      }

      setUserRole(data?.role ?? null);
      setUserBusinessId(data?.business_id ?? null);

      if (data?.role === 'client') {
        const response = await apiFetch(
          'http://localhost:3000/businesses/accessible'
        );

        if (!response.ok) {
          if (isMounted) {
            setBusinesses([]);
            setBusinessCount(0);
            setUserBusiness(null);
            setBusinessAccessVerified(false);
            setBusinessError('Unable to load accessible businesses.');
          }
          return;
        }

        const result = await response.json();
        const accessibleBusinesses = Array.isArray(result.data)
          ? result.data
          : [];
        const assignedBusiness = accessibleBusinesses.find(
          (business) => business.id === data.business_id
        );

        if (isMounted) {
          setBusinesses(accessibleBusinesses);
          setBusinessCount(accessibleBusinesses.length);
          setUserBusiness(assignedBusiness ?? accessibleBusinesses[0] ?? null);
          setBusinessAccessVerified(true);
          setBusinessError('');
        }
      } else if (data?.role === 'admin') {
  setUserBusiness(null);
  setBusinessAccessVerified(true);
} else {
  setUserBusiness(null);
  setBusinessAccessVerified(false);
}
      })();

      try {
        return await profileLoadPromise;
      } finally {
        profileLoadPromise = null;
      }
    }

    loadUserProfile();
    window.addEventListener('focus', loadUserProfile);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', loadUserProfile);
    };
  }, [session]);

  const [requestedActivePage, setActivePage] = useState(
  window.location.pathname === '/message-templates'
    ? 'Message Templates'
    : window.location.pathname === '/campaigns'
      ? 'Campaigns'
      : window.location.pathname === '/businesses'
        ? 'Businesses'
        : window.location.pathname === '/customers'
          ? 'Customers'
          : window.location.pathname === '/customer-comeback'
            ? 'Customer Comeback'
          : window.location.pathname === '/purchases'
            ? 'Purchases'
            : window.location.pathname === '/review-automation'
              ? 'Review Automation'
              : window.location.pathname === '/appointments'
                ? 'Appointments'
            : window.location.pathname === '/chats'
              ? 'Chats'
            : window.location.pathname === '/messages'
  ? 'Messages'
  : window.location.pathname === '/user-profiles'
    ? 'User Profiles'
    : window.location.pathname === '/business-members'
      ? 'Business Members'
    : window.location.pathname === '/whatsapp-settings'
      ? 'WhatsApp Settings'
    : 'Dashboard'
                
);

  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [businessCount, setBusinessCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [userProfiles, setUserProfiles] = useState([]);
const [userProfileLoading, setUserProfileLoading] = useState(false);
const [userProfileError, setUserProfileError] = useState('');

const [sentMessageCount, setSentMessageCount] = useState(0);

  // -----------------------------
  // Businesses
  // -----------------------------
  const [businesses, setBusinesses] = useState([]);
  const businessLoadRef = useRef(null);
  const [businessLoading, setBusinessLoading] = useState(false);
  const [businessError, setBusinessError] = useState('');
  const [businessAccessVerified, setBusinessAccessVerified] = useState(false);
  const [membershipAuthorizedBusinessIds, setMembershipAuthorizedBusinessIds] = useState([]);
  const [membershipAuthorizationLoading, setMembershipAuthorizationLoading] = useState(true);
  const [membershipAuthorizationError, setMembershipAuthorizationError] = useState('');
  const [businessPermissions, setBusinessPermissions] = useState(null);
  const [businessPermissionsLoading, setBusinessPermissionsLoading] = useState(true);
  const [businessPermissionsError, setBusinessPermissionsError] = useState('');

  const selectedBusinessId = userRole === 'admin' &&
    businesses.some((business) => business.id === requestedSelectedBusinessId)
    ? requestedSelectedBusinessId
    : '';

  useEffect(() => {
    let active = true;

    async function verifyMembershipManagementAccess() {
      setMembershipAuthorizationLoading(true);
      setMembershipAuthorizationError('');
      setMembershipAuthorizedBusinessIds([]);

      if (!session?.user || !userRole || !businessAccessVerified) {
        if (active) setMembershipAuthorizationLoading(false);
        return;
      }

      if (userRole === 'admin') {
        if (active) {
          setMembershipAuthorizedBusinessIds(businesses.map((business) => business.id));
          setMembershipAuthorizationLoading(false);
        }
        return;
      }

      if (userRole !== 'client' || businesses.length === 0) {
        if (active) setMembershipAuthorizationLoading(false);
        return;
      }

      const authorizedBusinessIds = [];
      let lookupError = '';

      await Promise.all(businesses.map(async (business) => {
        try {
          const response = await apiFetch(
            `http://localhost:3000/businesses/${encodeURIComponent(business.id)}/members`
          );

          if (response.ok) {
            authorizedBusinessIds.push(business.id);
          } else if (response.status !== 403) {
            lookupError = response.status === 401
              ? 'Your session is no longer authorized.'
              : 'Unable to verify business membership management access.';
          }
        } catch (error) {
          lookupError = error.message || 'Unable to verify business membership management access.';
        }
      }));

      if (active) {
        setMembershipAuthorizedBusinessIds(authorizedBusinessIds);
        setMembershipAuthorizationError(lookupError);
        setMembershipAuthorizationLoading(false);
      }
    }

    verifyMembershipManagementAccess();
    return () => { active = false; };
  }, [session, userRole, businesses, businessAccessVerified]);

  const permissionBusinessId = userRole === 'admin'
    ? selectedBusinessId
    : (userBusiness?.id || '');

  useEffect(() => {
    let active = true;

    async function loadBusinessPermissions() {
      if (userRole === 'admin') {
        if (active) {
          setBusinessPermissions(ALL_FEATURE_PERMISSIONS);
          setBusinessPermissionsError('');
          setBusinessPermissionsLoading(false);
        }
        return;
      }

      if (!session?.user || userRole !== 'client' || !permissionBusinessId) {
        if (active) {
          setBusinessPermissions(null);
          setBusinessPermissionsError('');
          setBusinessPermissionsLoading(false);
        }
        return;
      }

      setBusinessPermissionsLoading(true);
      setBusinessPermissionsError('');
      setBusinessPermissions(null);

      try {
        const response = await apiFetch(
          `http://localhost:3000/businesses/${encodeURIComponent(permissionBusinessId)}/permissions`
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load business permissions.');
        }

        if (active) {
          setBusinessPermissions(result.data?.permissions ?? null);
          setBusinessPermissionsLoading(false);
        }
      } catch (error) {
        if (active) {
          setBusinessPermissions(null);
          setBusinessPermissionsError(error.message);
          setBusinessPermissionsLoading(false);
        }
      }
    }

    loadBusinessPermissions();

    return () => {
      active = false;
    };
  }, [permissionBusinessId, session?.user?.id, userRole]);

const canManageMemberships =
  !membershipAuthorizationLoading &&
  !membershipAuthorizationError &&
  (
    userRole === 'admin'
      ? businessAccessVerified
      : membershipAuthorizedBusinessIds.length > 0
  );

  const canManageWhatsApp = userRole === 'admin' || (
    userRole === 'client' &&
    Boolean(userBusiness?.id) &&
    membershipAuthorizedBusinessIds.includes(userBusiness.id)
  );

  const permissionsReady = userRole === 'admin'
    || (!businessPermissionsLoading && !businessPermissionsError && businessPermissions);
  const canAccessPage = (page) => {
    if (userRole === 'admin') return true;
    const permission = FEATURE_PAGE_PERMISSIONS[page];
    return !permission || (permissionsReady && businessPermissions?.[permission] === true);
  };

  const activePage = userRole === 'client' &&
    (requestedActivePage === 'Businesses' || requestedActivePage === 'User Profiles')
    ? 'Dashboard'
    : requestedActivePage === 'Business Members' &&
      !membershipAuthorizationLoading &&
      !canManageMemberships
      ? 'Dashboard'
      : requestedActivePage === 'WhatsApp Settings' && !canManageWhatsApp
      ? 'Dashboard'
      : FEATURE_PAGE_PERMISSIONS[requestedActivePage] &&
        !canAccessPage(requestedActivePage)
        ? 'Dashboard'
      : requestedActivePage;

  const [newBusiness, setNewBusiness] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    google_review_link: '',
  });
  const [businessSubmitting, setBusinessSubmitting] = useState(false);
  const [businessMessage, setBusinessMessage] = useState('');
  const [businessMessageError, setBusinessMessageError] = useState(false);
  const [businessWarning, setBusinessWarning] = useState('');
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
  const [comebackCustomers, setComebackCustomers] = useState([]);
  const [comebackLoading, setComebackLoading] = useState(false);
  const [comebackError, setComebackError] = useState('');
  const [inactivityDays, setInactivityDays] = useState(30);

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
    metadata: { language: 'en', buttons: [] },
  });

  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('');

  const [editingTemplate, setEditingTemplate] = useState(null);

const [editTemplateForm, setEditTemplateForm] = useState({
  name: '',
  category: '',
  message: '',
  metadata: { language: 'en', buttons: [] },
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

const handleSelectedReviewBusinessChange = (businessId) => {
  setSelectedReviewBusinessId(businessId);
  const selected = reviewAutomation?.find(
    (item) => item.business.id === businessId
  );
  setReviewForm({
    enabled: selected?.automation?.enabled ?? true,
    delay_minutes: selected?.automation?.delay_minutes ?? 120,
    template_id: selected?.automation?.template_id ?? '',
  });
  setReviewMessage('');
};


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
  reminder_enabled: false,
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
  template_id: '',
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
// LOAD USER PROFILES
// ============================================================

useEffect(() => {
  if (userRole !== 'admin' || !['User Profiles', 'Business Members'].includes(activePage)) {
    return;
  }

  async function loadUserProfiles() {
    setUserProfileLoading(true);
    setUserProfileError('');

    try {
      const response = await apiFetch(
        'http://localhost:3000/user-profiles'
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Unable to fetch user profiles'
        );
      }

      setUserProfiles(result.data ?? []);
    } catch (error) {
      setUserProfileError(error.message);
    } finally {
      setUserProfileLoading(false);
    }
  }

  loadUserProfiles();
}, [activePage, userRole]);

  // ============================================================
  // LOAD BUSINESSES
  // ============================================================

  useEffect(() => {
      if (userRole !== 'admin') {
    return;
  }

    const guard = createLoaderGuard();

    async function loadBusinesses() {
      try {
        await loadAllBusinesses(guard.isActive);
      } catch (error) {
        if (guard.isActive()) {
          setBusinessError(error.message);
        }
      }
    }

    loadBusinesses();

    return () => {
      guard.cleanup();
    };
  }, [userRole]);

  // ============================================================
  // LOAD DASHBOARD DATA
  // ============================================================

  useEffect(() => {
    if (!userRole) {
      return;
    }

    const guard = createLoaderGuard();

    async function loadDashboardData() {
      try {
        if (
          userRole === 'client' &&
          (!userBusinessId || !userBusiness)
        ) {
          if (guard.isActive()) {
            setBusinesses([]);
            setBusinessCount(0);
            setCustomerCount(0);
            setPurchaseCount(0);
            setCampaignCount(0);
            setSentMessageCount(0);
          }
          return;
        }

        const businessList = await getAccessibleBusinesses(guard.isActive);

        if (!guard.isActive()) {
          return;
        }

        setBusinessCount(businessList.length);

        const customerResponses = await Promise.all(
          businessList.map((business) =>
            apiFetch(
              `http://localhost:3000/customers?business_id=${business.id}`
            )
          )
        );

        const purchaseResponses = await Promise.all(
          businessList.map((business) =>
            apiFetch(
              `http://localhost:3000/purchases?business_id=${business.id}`
            )
          )
        );

        const campaignResponses = await Promise.all(
          businessList.map((business) =>
            apiFetch(
              `http://localhost:3000/campaigns?business_id=${business.id}`
            )
          )
        );

        const messageResponses = await Promise.all(
          businessList.map((business) =>
            apiFetch(
              `http://localhost:3000/messages?business_id=${business.id}&status=sent`
            )
          )
        );

        if (
          customerResponses.some((response) => !response.ok) ||
          purchaseResponses.some((response) => !response.ok) ||
          campaignResponses.some((response) => !response.ok) ||
          messageResponses.some((response) => !response.ok)
        ) {
          throw new Error('Unable to load dashboard data');
        }

        const [
          customerResults,
          purchaseResults,
          campaignResults,
          messageResults,
        ] = await Promise.all([
          Promise.all(
            customerResponses.map((response) => response.json())
          ),
          Promise.all(
            purchaseResponses.map((response) => response.json())
          ),
          Promise.all(
            campaignResponses.map((response) => response.json())
          ),
          Promise.all(
            messageResponses.map((response) => response.json())
          ),
        ]);

        if (!guard.isActive()) {
          return;
        }

        setCustomerCount(
          customerResults.reduce(
            (count, result) => count + (result.data?.length ?? 0),
            0
          )
        );

        setPurchaseCount(
          purchaseResults.reduce(
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
        if (guard.isActive()) {
          console.error('Dashboard data fetch failed:', error);
        }
      }
    }

    loadDashboardData();

    return guard.cleanup;
  }, [
    userRole,
    userBusinessId,
    userBusiness,
    selectedBusinessId,
  ]);

  // ============================================================
  // LOAD CUSTOMERS
  // ============================================================

  useEffect(() => {
    if (
      activePage !== 'Customers' &&
      activePage !== 'Appointments' &&
      activePage !== 'Dashboard'
    ) {
      return;
    }

    const guard = createLoaderGuard();

    async function loadCustomers() {
      setCustomerLoading(true);
      setCustomerError('');

      try {
        const businessList = await getAccessibleBusinesses(guard.isActive);

        if (!guard.isActive()) {
          return;
        }

        if (userRole === 'client') {
          setBusinesses(businessList);
        }

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

        if (!guard.isActive()) {
          return;
        }

        setCustomers(allCustomers);
      } catch (error) {
        if (guard.isActive()) {
          setCustomerError(error.message);
        }
      } finally {
        if (guard.isActive()) {
          setCustomerLoading(false);
        }
      }
    }

    loadCustomers();

    return () => {
      guard.cleanup();
      setCustomerLoading(false);
    };
  }, [activePage, userRole, userBusiness, selectedBusinessId]);

  // ============================================================
  // LOAD CUSTOMER COMEBACK DATA
  // ============================================================

  useEffect(() => {
    if (activePage !== 'Customer Comeback') {
      return;
    }

    const guard = createLoaderGuard();

    async function loadComebackCustomers() {
      setComebackLoading(true);
      setComebackError('');

      try {
        const businessList = await getAccessibleBusinesses(guard.isActive);

        if (!guard.isActive()) {
          return;
        }

        const responses = await Promise.all(
          businessList.map((business) =>
            apiFetch(
              `http://localhost:3000/customers/inactive?business_id=${encodeURIComponent(
                business.id
              )}&days=${inactivityDays}`
            )
          )
        );

        if (responses.some((response) => !response.ok)) {
          throw new Error('Unable to load customer comeback data');
        }

        const results = await Promise.all(
          responses.map((response) => response.json())
        );

        const allComebackCustomers = results.flatMap((result, index) =>
          (result.data ?? []).map((customer) => ({
            ...customer,
            businessName: businessList[index].name,
          }))
        );

        if (!guard.isActive()) {
          return;
        }

        setComebackCustomers(allComebackCustomers);
      } catch (error) {
        if (guard.isActive()) {
          setComebackError(error.message);
        }
      } finally {
        if (guard.isActive()) {
          setComebackLoading(false);
        }
      }
    }

    loadComebackCustomers();

    return () => {
      guard.cleanup();
      setComebackLoading(false);
    };
  }, [activePage, userRole, userBusiness, selectedBusinessId, inactivityDays]);

  // ============================================================
  // LOAD PURCHASES
  // ============================================================

  useEffect(() => {
    if (activePage !== 'Purchases') {
      return;
    }

    const guard = createLoaderGuard();

    async function loadPurchases() {
      setPurchaseLoading(true);
      setPurchaseError('');

      try {
        const businessList = await getAccessibleBusinesses(guard.isActive);

        if (!guard.isActive()) {
          return;
        }

        if (userRole === 'client') {
          setBusinesses(businessList);
        }

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

        if (!guard.isActive()) {
          return;
        }

        setPurchases(allPurchases);
      } catch (error) {
        if (guard.isActive()) {
          setPurchaseError(error.message);
        }
      } finally {
        if (guard.isActive()) {
          setPurchaseLoading(false);
        }
      }
    }

    loadPurchases();

    return () => {
      guard.cleanup();
      setPurchaseLoading(false);
    };
  }, [activePage, userRole, userBusiness, selectedBusinessId]);

  // ============================================================
  // LOAD MESSAGE TEMPLATES
  // ============================================================

  useEffect(() => {
  if (
  activePage !== 'Message Templates' &&
  activePage !== 'Review Automation' &&
  activePage !== 'Appointments' &&
  activePage !== 'Customer Comeback'
) {
  return;
}

    const guard = createLoaderGuard();

    async function loadMessageTemplates() {
      setTemplateLoading(true);
      setTemplateError('');

      try {
        const businessList = await getAccessibleBusinesses(guard.isActive);

        if (!guard.isActive()) {
          return;
        }

        if (userRole === 'client') {
          setBusinesses(businessList);
        }

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

        if (!guard.isActive()) {
          return;
        }

        setMessageTemplates(allTemplates);
      } catch (error) {
        if (guard.isActive()) {
          setTemplateError(error.message);
        }
      } finally {
        if (guard.isActive()) {
          setTemplateLoading(false);
        }
      }
    }

    loadMessageTemplates();

    return () => {
      guard.cleanup();
      setTemplateLoading(false);
    };
  }, [activePage, userRole, userBusiness, selectedBusinessId]);

  // ============================================================
// LOAD REVIEW AUTOMATION
// ============================================================

useEffect(() => {
  if (activePage !== 'Review Automation' && activePage !== 'Dashboard') {
    return;
  }

  const guard = createLoaderGuard();

  async function loadReviewAutomation() {
    setReviewAutomationLoading(true);
    setReviewAutomationError('');

    try {
      const businessList = await getAccessibleBusinesses(guard.isActive);

      if (!guard.isActive()) {
        return;
      }

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

      if (!guard.isActive()) {
        return;
      }

      setReviewAutomation(results);
      const selected = results.find(
        (item) => item.business.id === selectedReviewBusinessId
      );
      setReviewForm({
        enabled: selected?.automation?.enabled ?? true,
        delay_minutes: selected?.automation?.delay_minutes ?? 120,
        template_id: selected?.automation?.template_id ?? '',
      });
    } catch (error) {
      if (guard.isActive()) {
        setReviewAutomationError(error.message);
      }
    } finally {
      if (guard.isActive()) {
        setReviewAutomationLoading(false);
      }
    }
  }

  loadReviewAutomation();

  return () => {
    guard.cleanup();
    setReviewAutomationLoading(false);
  };
}, [activePage, userRole, userBusiness, selectedBusinessId]);

// ============================================================
// LOAD MESSAGES
// ============================================================

useEffect(() => {
  if (activePage !== 'Messages' && activePage !== 'Dashboard') {
    return;
  }

  const guard = createLoaderGuard();

  async function loadMessages() {
    setMessageLoading(true);
    setMessageError('');

    try {
      const businessList = await getAccessibleBusinesses(guard.isActive);

      if (!guard.isActive()) {
        return;
      }

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

      if (!guard.isActive()) {
        return;
      }

      setMessages(allMessages);
    } catch (error) {
      if (guard.isActive()) {
        setMessageError(error.message);
      }
    } finally {
      if (guard.isActive()) {
        setMessageLoading(false);
      }
    }
  }

  loadMessages();

  return () => {
    guard.cleanup();
    setMessageLoading(false);
  };
}, [activePage, userRole, userBusiness, selectedBusinessId]);

// LOAD CAMPAIGNS
  // ============================================================

  useEffect(() => {
    if (activePage !== 'Campaigns' && activePage !== 'Dashboard') {
      return;
    }

    const guard = createLoaderGuard();

    async function loadCampaigns() {
      setCampaignLoading(true);
      setCampaignError('');

      try {
        const businessList = await getAccessibleBusinesses(guard.isActive);

        if (!guard.isActive()) {
          return;
        }

        if (userRole === 'client') {
          setBusinesses(businessList);
        }

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

        const audienceCustomerResponses = await Promise.all(
          businessList.map((business) =>
            apiFetch(
              `http://localhost:3000/customers?business_id=${business.id}`
            )
          )
        );

        if (audienceCustomerResponses.every((response) => response.ok)) {
          const audienceCustomerResults = await Promise.all(
            audienceCustomerResponses.map((response) => response.json())
          );
          const audienceCustomers = audienceCustomerResults.flatMap(
            (result, index) =>
              (result.data ?? []).map((customer) => ({
                ...customer,
                businessName: businessList[index].name,
              }))
          );

          if (guard.isActive()) {
            setCustomers(audienceCustomers);
          }
        }

        const allCampaigns =
          campaignResults.flatMap(
            (result, index) =>
              (result.data ?? []).map((campaign) => ({
                ...campaign,
                businessName:
                  businessList[index].name,
              }))
          );

        if (!guard.isActive()) {
          return;
        }

        setCampaigns(allCampaigns);
      } catch (error) {
        if (guard.isActive()) {
          setCampaignError(error.message);
        }
      } finally {
        if (guard.isActive()) {
          setCampaignLoading(false);
        }
      }
    }

    loadCampaigns();

    return () => {
      guard.cleanup();
      setCampaignLoading(false);
    };
  }, [activePage, userRole, userBusiness, selectedBusinessId]);

  // ============================================================
// LOAD APPOINTMENTS
// ============================================================

useEffect(() => {
  if (activePage !== 'Appointments' && activePage !== 'Dashboard') {
    return;
  }

  const guard = createLoaderGuard();

  async function loadAppointments() {
    setAppointmentLoading(true);
    setAppointmentError('');

    try {
      const businessList = await getAccessibleBusinesses(guard.isActive);

      if (!guard.isActive()) {
        return;
      }

      if (userRole === 'client') {
        setBusinesses(businessList);
      }

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

      if (!guard.isActive()) {
        return;
      }

      setAppointments(allAppointments);
  } catch (error) {
      if (guard.isActive()) {
        setAppointmentError(error.message);
      }
    } finally {
      if (guard.isActive()) {
        setAppointmentLoading(false);
      }
    }
  }

  loadAppointments();

  return () => {
    guard.cleanup();
    setAppointmentLoading(false);
  };
}, [activePage, userRole, userBusiness, selectedBusinessId]);

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
      reminder_enabled: false,
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
    template_id: appointment.template_id || '',
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
        body: JSON.stringify({
          ...editAppointmentForm,
          template_id: editAppointmentForm.template_id || null,
        }),
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

async function handleUpdateReminderSettings(appointment, changes) {
  setAppointmentActionLoading(true);
  setAppointmentMessage('');

  try {
    const response = await apiFetch(
      `http://localhost:3000/appointments/${appointment.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      },
    );
    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || result.errors?.join(', ') || 'Unable to update reminder settings',
      );
    }

    setAppointments((previous) => previous.map((item) => (
      item.id === appointment.id ? { ...item, ...result.data } : item
    )));
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
    setBusinessMessageError(false);
    setBusinessWarning('');

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

      setBusinesses((previous) => applyBusinessMutation(previous, 'create', result.data));
      setBusinessCount((previous) => previous + 1);
      setNewBusiness({
        name: '',
        phone: '',
        email: '',
        address: '',
        google_review_link: '',
      });
      setBusinessMessage('Business added successfully!');
      setBusinessMessageError(false);
      setBusinessWarning(getBusinessAuditWarning(result));
    } catch (error) {
      setBusinessMessage(error.message);
      setBusinessMessageError(true);
      setBusinessWarning('');
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
    setBusinessMessageError(false);
    setBusinessWarning('');

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

      setBusinesses((previous) => applyBusinessMutation(previous, 'update', result.data));
      setBusinessMessage('Business updated successfully!');
      setBusinessMessageError(false);
      setBusinessWarning(getBusinessAuditWarning(result));
      setEditingBusiness(null);
    } catch (error) {
      setBusinessMessage(error.message);
      setBusinessMessageError(true);
      setBusinessWarning('');
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
    setBusinessMessageError(false);
    setBusinessWarning('');

    try {
      const response = await apiFetch(
        `http://localhost:3000/businesses/${business.id}`,
        { method: 'DELETE' }
      );

      let result = null;
      if (response.status !== 204) {
        result = await response.json();
      }

      if (!response.ok) {
        let errorMessage = 'Unable to delete business';
        if (result) {
          errorMessage =
            result.error ||
            result.errors?.join(', ') ||
            errorMessage;
        }
        throw new Error(errorMessage);
      }

      setBusinesses((previous) => applyBusinessMutation(previous, 'delete', business));
      setBusinessCount((previous) => Math.max(0, previous - 1));

      if (editingBusiness?.id === business.id) {
        setEditingBusiness(null);
      }

      setBusinessMessage('Business deleted successfully!');
      setBusinessMessageError(false);
      setBusinessWarning(getBusinessAuditWarning(result));
    } catch (error) {
      setBusinessMessage(error.message);
      setBusinessMessageError(true);
      setBusinessWarning('');
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

  async function handleCreateCustomerForAppointment(customerValues) {
    const response = await apiFetch(
      'http://localhost:3000/customers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerValues),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to create customer',
      );
    }

    const selectedBusiness = businesses.find(
      (business) => business.id === customerValues.business_id,
    );
    const customer = {
      ...result.data,
      businessName: selectedBusiness?.name || '',
    };

    setCustomers((previous) => [customer, ...previous]);
    setCustomerCount((previous) => previous + 1);

    return customer;
  }

  async function handleImportCustomers({ businessId, rows }) {
    const response = await apiFetch(
      'http://localhost:3000/customers/import',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          business_id: businessId,
          rows,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.errors?.join(', ') ||
          'Unable to import customers'
      );
    }

    const selectedBusiness = businesses.find(
      (business) => business.id === businessId
    );
    const importedCustomers = (result.data ?? [])
      .filter((outcome) => outcome.status === 'imported' && outcome.customer)
      .map((outcome) => ({
        ...outcome.customer,
        businessName: selectedBusiness?.name || '',
      }));

    if (importedCustomers.length > 0) {
      setCustomers((previous) => [
        ...importedCustomers,
        ...previous,
      ]);
      setCustomerCount((previous) => previous + importedCustomers.length);
    }

    return result;
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
        metadata: { language: 'en', buttons: [] },
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
    category: template.metadata?.meta_category || template.category || '',
    message: template.message || '',
    metadata: {
      language: template.metadata?.language || 'en',
      meta_template_name: template.metadata?.meta_template_name || '',
      header: template.metadata?.header || '',
      footer: template.metadata?.footer || '',
      buttons: Array.isArray(template.metadata?.buttons) ? template.metadata.buttons : [],
    },
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

  const stats =
    userRole === 'admin'
      ? [
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
        ]
      : [
          {
            label: 'Total Customers',
            value: String(customerCount),
            icon: '👥',
          },
          {
            label: 'Purchases',
            value: String(purchaseCount),
            icon: '🛍',
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

async function loadAllBusinesses(isActive = () => true) {
  if (!businessLoadRef.current) {
    setBusinessLoading(true);
    setBusinessError('');

    const request = (async () => {
      const response = await apiFetch(
        'http://localhost:3000/businesses'
      );

      if (!response.ok) {
        throw new Error('Unable to load businesses');
      }

      const result = await response.json();
      return result.data ?? [];
    })();

    businessLoadRef.current = request;
    request.then(
      () => {
        if (businessLoadRef.current === request) {
          businessLoadRef.current = null;
          setBusinessLoading(false);
        }
      },
      () => {
        if (businessLoadRef.current === request) {
          businessLoadRef.current = null;
          setBusinessLoading(false);
        }
      }
    );
  }

  try {
    const businessList = await businessLoadRef.current;

    if (isActive()) {
      setBusinesses(businessList);
      setBusinessCount(businessList.length);
      setBusinessAccessVerified(true);
    }

    return businessList;
  } catch (error) {
    if (isActive()) {
      setBusinessAccessVerified(false);
      setBusinessError(error.message);
    }

    throw error;
  }
}

async function getAccessibleBusinesses(isActive = () => true) {
  if (userRole === 'client') {
    return businesses.length
      ? businesses
      : (userBusiness ? [userBusiness] : []);
  }

  const businessList = businesses.length
    ? businesses
    : await loadAllBusinesses(isActive);

  if (!selectedBusinessId) {
    return businessList;
  }

  return businessList.filter(
    (business) => business.id === selectedBusinessId
  );
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

if (!userRole) {
  return <div>Loading workspace...</div>;
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
          {(userRole === 'admin'
  ? adminMenuItems
  : clientMenuItems
 ).filter((item) => (
   (item !== 'Business Members' || userRole === 'admin' || canManageMemberships)
   && (item !== 'WhatsApp Settings' || canManageWhatsApp)
   && canAccessPage(item)
 )).map((item) => (
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
              {item === 'WhatsApp Settings' && '◉'}

              <span>{item}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
  <div className="avatar">
    {userRole === 'admin' ? 'A' : 'C'}
  </div>

  <div>
    <strong>
      {userRole === 'admin'
        ? 'Platform Admin'
        : userBusiness?.name || 'Client'}
    </strong>

    <span>
      {userRole === 'admin'
        ? 'Administrator'
        : 'Client'}
    </span>

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
            {userRole === 'admin'
              ? 'Admin Workspace'
              : userBusiness?.name
                ? `${userBusiness.name} Workspace`
                : 'Client Workspace'}
          </div>

          {userRole === 'admin' && (
            <div style={{ marginLeft: '16px' }}>
              {businessLoading ? (
                <span aria-live="polite">Loading businesses...</span>
              ) : businessError ? (
                <span role="alert">
                  {businessError}
                </span>
              ) : businesses.length === 0 ? (
                <span>No businesses available.</span>
              ) : (
                <label>
                  <span className="sr-only">Business view</span>
                  <select
                    value={selectedBusinessId}
                    onChange={(event) =>
                      setSelectedBusinessId(event.target.value)
                    }
                    aria-label="Business view"
                  >
                    <option value="">All businesses</option>
                    {businesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </header>

{activePage === 'Dashboard' ? (
    <Dashboard
      stats={stats}
      backendStatus={backendStatus}
      setActivePage={setActivePage}
      showWhatsAppAction={canManageWhatsApp}
      activeBusinessId={selectedBusinessId}
      businesses={businesses}
      customers={customers}
      appointments={appointments}
      messages={messages}
      campaigns={campaigns}
      reviewAutomation={reviewAutomation}
      reviewForm={reviewForm}
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
    businessMessageError={businessMessageError}
    businessWarning={businessWarning}
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
    setCustomerMessage={setCustomerMessage}
    handleAddCustomer={handleAddCustomer}
    handleImportCustomers={handleImportCustomers}
    editingCustomer={editingCustomer}
    editCustomerForm={editCustomerForm}
    setEditCustomerForm={setEditCustomerForm}
    customerActionLoading={customerActionLoading}
    handleEditCustomer={handleEditCustomer}
    setEditingCustomer={setEditingCustomer}
    startEditingCustomer={startEditingCustomer}
     handleDeleteCustomer={handleDeleteCustomer}
     />

   ) : activePage === 'Customer Comeback' ? (
  <CustomerComeback
    customers={comebackCustomers}
    businesses={businesses}
    messageTemplates={messageTemplates}
    templateLoading={templateLoading}
    templateError={templateError}
    inactivityDays={inactivityDays}
    setInactivityDays={setInactivityDays}
    customerLoading={comebackLoading}
    customerError={comebackError}
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
    customers={customers}
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
      handleSelectedReviewBusinessChange
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
    handleCreateCustomer={handleCreateCustomerForAppointment}
    editingAppointment={editingAppointment}
    editAppointmentForm={editAppointmentForm}
    setEditAppointmentForm={setEditAppointmentForm}
    appointmentActionLoading={appointmentActionLoading}
    templateLoading={templateLoading}
    templateError={templateError}
    handleEditAppointment={handleEditAppointment}
    handleUpdateReminderSettings={handleUpdateReminderSettings}
    setEditingAppointment={setEditingAppointment}
    startEditingAppointment={startEditingAppointment}
    handleCancelAppointment={handleCancelAppointment}
  />
) : activePage === 'Chats' ? (
  <Chats
    businesses={businesses}
    businessLoading={businessLoading}
    businessError={businessError}
    userRole={userRole}
    userBusiness={userBusiness}
    selectedBusinessId={selectedBusinessId}
  />

) : activePage === 'Messages' ? (
  <Messages
    messages={messages}
    messageLoading={messageLoading}
    messageError={messageError}
  />

  ) : activePage === 'WhatsApp Settings' ? (
  <WhatsAppSettings
    businessId={userRole === 'admin' ? selectedBusinessId : userBusiness?.id}
    businessName={userRole === 'admin'
      ? businesses.find((business) => business.id === selectedBusinessId)?.name
      : userBusiness?.name}
  />

  ) : activePage === 'User Profiles' ? (
 <UserProfiles
  userProfiles={userProfiles}
  userProfileLoading={userProfileLoading}
  userProfileError={userProfileError}
  businesses={businesses}
/>

) : activePage === 'Business Members' ? (
 <BusinessMemberships
  businesses={businesses}
  businessLoading={businessLoading}
  businessError={businessError}
  userRole={userRole}
  userBusiness={userBusiness}
  selectedBusinessId={selectedBusinessId}
  userProfiles={userProfiles}
  userProfileLoading={userProfileLoading}
  userProfileError={userProfileError}
  authorizedBusinessIds={membershipAuthorizedBusinessIds}
  membershipAuthorizationLoading={membershipAuthorizationLoading}
  membershipAuthorizationError={membershipAuthorizationError}
  canManageMemberships={canManageMemberships}
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

export default App
