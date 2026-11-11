function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(value);
}

function formatTime(value) {
  if (!value) return 'Time not set';
  const parsed = new Date(`1970-01-01T${value}`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  if (['delivered', 'read'].includes(normalized)) return 'Delivered';
  if (normalized === 'sent') return 'Sent';
  if (normalized === 'failed') return 'Failed';
  return 'Queued';
}

function Dashboard({ stats, backendStatus, setActivePage, showWhatsAppAction = true, activeBusinessId = '', businesses = [], customers = [], appointments = [], messages = [], campaigns = [], reviewAutomation = [], reviewForm = {} }) {
  const activeBusiness = businesses.find((business) => business.id === activeBusinessId);
  const reviewItems = Array.isArray(reviewAutomation) ? reviewAutomation : [];
  const scoped = (items) => activeBusinessId ? items.filter((item) => item.business_id === activeBusinessId) : items;
  const scopedCustomers = scoped(customers);
  const scopedAppointments = scoped(appointments);
  const scopedMessages = scoped(messages);
  const customerMap = new Map(scopedCustomers.map((customer) => [customer.id, customer]));
  const businessName = activeBusiness?.name || (businesses.length === 1 ? businesses[0].name : 'your workspace');
  const totalCustomers = scopedCustomers.length || Number(stats.find((item) => item.label === 'Total Customers')?.value || 0);
  const activeCustomers = scopedCustomers.filter((customer) => customer.active === true || customer.is_active === true || customer.status === 'active').length;
  const scheduledAppointments = scopedAppointments.filter((appointment) => appointment.status === 'scheduled');
  const sentMessages = scopedMessages.filter((message) => ['sent', 'delivered', 'read'].includes(String(message.status || '').toLowerCase()));
  const deliveredMessages = scopedMessages.filter((message) => ['delivered', 'read'].includes(String(message.status || '').toLowerCase()));
  const deliveryRate = sentMessages.length ? Math.round((deliveredMessages.length / sentMessages.length) * 100) : 0;
  const automationRecord = reviewItems.find((item) => item.business?.id === activeBusinessId);
  const automationActive = activeBusinessId ? Boolean(automationRecord?.automation?.enabled ?? reviewForm.enabled) : reviewItems.some((item) => item.automation?.enabled);
  const reviewLink = activeBusiness?.google_review_link || (!activeBusinessId ? businesses.find((business) => business.google_review_link)?.google_review_link : null);
  const today = new Date().toISOString().slice(0, 10);
  const todaysAppointments = scheduledAppointments.filter((appointment) => appointment.appointment_date === today).sort((left, right) => String(left.appointment_time || '').localeCompare(String(right.appointment_time || '')));
  const recentMessages = [...scopedMessages].sort((left, right) => new Date(right.sent_at || right.created_at || 0) - new Date(left.sent_at || left.created_at || 0)).slice(0, 5);
  const whatsappConnected = Boolean(activeBusiness?.whatsapp_enabled || activeBusiness?.whatsapp_settings?.isEnabled);
  const goTo = (page) => setActivePage(page);

  return (
    <section className="executive-dashboard">
      <section className="executive-hero">
        <div><p className="executive-kicker">COMMAND CENTER</p><h2>Welcome back, {businessName}</h2><p>Here is what is happening across your business today.</p></div>
        <div className="executive-date-badge">{formatDate()}</div>
      </section>

      <section className="executive-kpi-grid">
        <article className="executive-kpi executive-kpi-indigo"><span className="executive-kpi-label">Total Customers</span><strong>{totalCustomers}</strong><small>{activeCustomers} active · {Math.max(totalCustomers - activeCustomers, 0)} inactive</small></article>
        <article className="executive-kpi executive-kpi-blue"><span className="executive-kpi-label">Upcoming Appointments</span><strong>{scheduledAppointments.length}</strong><small>Scheduled bookings</small></article>
        <article className="executive-kpi executive-kpi-violet"><span className="executive-kpi-label">Messages Sent</span><strong>{sentMessages.length || stats.find((item) => item.label === 'Messages Sent')?.value || 0}</strong><small>{deliveryRate}% delivery rate</small></article>
        <article className="executive-kpi executive-kpi-amber"><span className="executive-kpi-label">Review Automation</span><strong>{automationActive ? 'Active' : 'Paused'}</strong><small>{reviewLink ? 'Google link configured' : 'Google link missing'}</small></article>
      </section>

      <section className="executive-top-grid">
        <article className="executive-card"><div className="executive-card-heading"><div><p className="executive-card-kicker">SHORTCUTS</p><h3>Quick Actions</h3></div><span className="executive-heading-icon">✦</span></div>
          <div className="executive-actions-grid">{[['Add Customer', '＋', 'Customers'], ['Book Appointment', '◷', 'Appointments'], ['New Campaign', '↗', 'Campaigns'], ['Open Live Chat', '◌', 'Chats'], ...(showWhatsAppAction ? [['WhatsApp Settings', '⚙', 'WhatsApp Settings']] : [])].map(([label, icon, page]) => <button className="executive-action" key={label} type="button" onClick={() => goTo(page)}><span className="executive-action-icon">{icon}</span><span>{label}</span><span className="executive-action-arrow">→</span></button>)}</div>
        </article>
        <article className="executive-card executive-whatsapp-card"><div className="executive-card-heading"><div><p className="executive-card-kicker">INTEGRATION</p><h3>WhatsApp Connection</h3></div><span className={`executive-status-dot ${whatsappConnected ? 'is-connected' : ''}`} /></div><div className="executive-connection-status"><strong>{whatsappConnected ? 'Connected' : 'Simulated / Test Mode'}</strong><span>{whatsappConnected ? 'Live message delivery is enabled.' : 'Messages are safely simulated until WhatsApp is connected.'}</span></div><button className="executive-link-button" type="button" onClick={() => goTo('WhatsApp Settings')}>Manage WhatsApp Settings <span>→</span></button></article>
      </section>

      <section className="executive-bottom-grid">
        <article className="executive-card"><div className="executive-card-heading"><div><p className="executive-card-kicker">TODAY</p><h3>Today's Appointments</h3></div><button className="executive-text-button" type="button" onClick={() => goTo('Appointments')}>View all</button></div>
          {todaysAppointments.length ? <div className="executive-appointment-list">{todaysAppointments.slice(0, 5).map((appointment) => { const customer = customerMap.get(appointment.customer_id); return <div className="executive-appointment-row" key={appointment.id}><span className="executive-avatar">{(customer?.name || appointment.customerName || 'C').charAt(0).toUpperCase()}</span><div><strong>{customer?.name || appointment.customerName || 'Customer'}</strong><small>{formatTime(appointment.appointment_time)}</small></div><span className="executive-reminder-badge">{appointment.reminder_enabled ? 'Reminder on' : 'Reminder off'}</span></div>; })}</div> : <div className="executive-empty-state"><span>◷</span><p>No appointments scheduled for today.</p><button type="button" onClick={() => goTo('Appointments')}>Book an Appointment</button></div>}
        </article>
        <article className="executive-card"><div className="executive-card-heading"><div><p className="executive-card-kicker">LIVE FEED</p><h3>Recent Activity</h3></div><button className="executive-text-button" type="button" onClick={() => goTo('Messages')}>Open inbox</button></div>
          {recentMessages.length ? <div className="executive-activity-list">{recentMessages.map((message) => <div className="executive-activity-row" key={message.id}><span className="executive-activity-icon">✉</span><div><strong>{message.customerName || 'Customer'}</strong><small>{message.body || message.content || 'Message activity'}</small></div><span className={`executive-message-status status-${String(message.status || 'queued').toLowerCase()}`}>{getStatusLabel(message.status)}</span></div>)}</div> : <div className="executive-empty-state compact"><span>✦</span><p>No recent message activity.</p></div>}
        </article>
      </section>

      <section className="executive-system-bar"><span><i className="executive-status-dot is-connected" /> Frontend running</span><span><i className={`executive-status-dot ${backendStatus === 'Connected' ? 'is-connected' : ''}`} /> Backend {backendStatus}</span><span>{campaigns.length} campaigns in workspace</span><span>Supabase connected through backend</span></section>
    </section>
  );
}

export default Dashboard;
