import { useMemo, useState } from 'react';

const STATUS_FILTERS = ['all', 'sent', 'delivered', 'read', 'failed', 'queued'];
const CHANNEL_FILTERS = ['all', 'whatsapp', 'sms'];

function getMetadata(message) {
  return message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
}

function getChannel(message) {
  const metadata = getMetadata(message);
  const value = String(metadata.channel || message.channel || metadata.provider || message.provider || message.source || '').toLowerCase();
  return value.includes('sms') ? 'sms' : 'whatsapp';
}

function getIntent(message) {
  const metadata = getMetadata(message);
  const source = String(message.source || metadata.source || '').toLowerCase();
  if (message.appointment_id || source.includes('appointment') || source.includes('reminder')) return 'Appointment Reminder';
  if (message.campaign_id || source.includes('campaign')) return 'Campaign';
  if (source.includes('comeback')) return 'Customer Comeback';
  if (source.includes('review')) return 'Review Request';
  if (source.includes('inbound') || source.includes('received')) return 'Inbound';
  return 'Message';
}

function getMessageText(message) {
  return message.message_text || message.body || message.content || message.text || '';
}

function getStatus(message) {
  const status = String(message.status || 'queued').toLowerCase();
  return STATUS_FILTERS.includes(status) ? status : 'queued';
}

function getFailureReason(message) {
  const metadata = getMetadata(message);
  return metadata.failure_reason || metadata.error_reason || metadata.error?.message || message.failure_reason || '';
}

function formatPhone(phone) {
  const value = String(phone || '');
  if (value.length === 10 && /^\d+$/.test(value)) return `${value.slice(0, 3)} ${value.slice(3, 6)} ${value.slice(6)}`;
  return value || 'Phone unavailable';
}

function formatTimestamp(value) {
  if (!value) return 'Not timestamped';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not timestamped' : parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusPresentation(status) {
  return {
    read: ['✓✓', 'Read'],
    delivered: ['✓✓', 'Delivered'],
    sent: ['✓', 'Sent'],
    queued: ['⏳', 'Queued'],
    failed: ['⚠', 'Failed'],
  }[status] || ['⏳', 'Queued'];
}

function Messages({ messages = [], messageLoading, messageError }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const metrics = useMemo(() => {
    const delivered = messages.filter((message) => ['delivered', 'read'].includes(getStatus(message))).length;
    const read = messages.filter((message) => getStatus(message) === 'read').length;
    const failed = messages.filter((message) => getStatus(message) === 'failed').length;
    const pending = messages.filter((message) => getStatus(message) === 'queued').length;
    return { delivered, read, failed, pending, deliveredRate: messages.length ? Math.round((delivered / messages.length) * 100) : 0 };
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return messages.filter((message) => {
      const searchable = [message.businessName, message.customerName, message.customerPhone, getMessageText(message), message.status, message.scheduled_at, message.sent_at].map((value) => String(value || '').toLowerCase()).join(' ');
      return (!search || searchable.includes(search))
        && (statusFilter === 'all' || getStatus(message) === statusFilter)
        && (channelFilter === 'all' || getChannel(message) === channelFilter);
    });
  }, [channelFilter, messages, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedMessages = filteredMessages.slice(startIndex, startIndex + pageSize);

  const updateFilter = (setter, value) => {
    setter(value);
    setCurrentPage(1);
  };

  return (
    <section className="messages-console">
      <div className="messages-console-header">
        <div><p className="messages-console-kicker">DELIVERY OPERATIONS</p><h2>Message Delivery Console</h2><p>Monitor customer communications, delivery signals, and channel performance in one place.</p></div>
        <div className="messages-console-live"><span /> Live message log</div>
      </div>

      <section className="messages-metric-grid">
        <article className="messages-metric"><span>Total Messages Logged</span><strong>{messages.length}</strong><small>All loaded message records</small></article>
        <article className="messages-metric messages-metric-green"><span>Delivered Rate</span><strong>{metrics.deliveredRate}%</strong><small>{metrics.delivered} delivered or read</small></article>
        <article className="messages-metric messages-metric-blue"><span>Read Receipts</span><strong>{metrics.read}</strong><small>Customer read confirmations</small></article>
        <article className="messages-metric messages-metric-alert"><span>Failed / Pending</span><strong>{metrics.failed + metrics.pending}</strong><small>{metrics.failed} failed · {metrics.pending} queued</small></article>
      </section>

      {messageLoading ? <div className="messages-console-state">Loading messages...</div> : messageError ? <div className="messages-console-state messages-console-error">{messageError}</div> : (
        <>
          <section className="messages-console-toolbar">
            <label className="messages-search-field" htmlFor="message-search"><span aria-hidden="true">⌕</span><input id="message-search" type="search" value={searchTerm} placeholder="Search recipient, phone, message, or status..." onChange={(event) => updateFilter(setSearchTerm, event.target.value)} /></label>
            <div className="messages-filter-group" aria-label="Message status filters">{STATUS_FILTERS.map((status) => <button key={status} type="button" className={statusFilter === status ? 'active' : ''} onClick={() => updateFilter(setStatusFilter, status)}>{status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}</button>)}</div>
            <div className="messages-channel-group" aria-label="Message channel filters">{CHANNEL_FILTERS.map((channel) => <button key={channel} type="button" className={channelFilter === channel ? 'active' : ''} onClick={() => updateFilter(setChannelFilter, channel)}>{channel === 'all' ? 'All Channels' : channel === 'whatsapp' ? '🟢 WhatsApp' : '💬 Normal SMS'}</button>)}</div>
          </section>

          {messages.length === 0 ? <div className="messages-console-state">No messages found.</div> : filteredMessages.length === 0 ? <div className="messages-console-state">No messages match the selected filters.</div> : (
            <>
              <div className="messages-table-shell"><table className="messages-delivery-table"><thead><tr><th>Recipient</th><th>Channel</th><th>Source / Intent</th><th>Message Snippet</th><th>Status</th><th>Timestamp</th></tr></thead><tbody>{paginatedMessages.map((message) => { const status = getStatus(message); const [icon, label] = statusPresentation(status); const reason = getFailureReason(message); return <tr key={message.id}><td><div className="messages-recipient"><span className="messages-recipient-avatar">{String(message.customerName || 'C').trim().charAt(0).toUpperCase()}</span><span><strong>{message.customerName || 'Customer'}</strong><small>{formatPhone(message.customerPhone || message.phone)}</small></span></div></td><td><span className={`messages-channel-badge ${getChannel(message)}`}>{getChannel(message) === 'whatsapp' ? '🟢 WhatsApp' : '💬 SMS'}</span></td><td><span className="messages-intent-badge">{getIntent(message)}</span></td><td><span className="messages-snippet" title={getMessageText(message)}>{getMessageText(message) || 'No message text'}</span></td><td><span className={`messages-status-pill ${status}`}>{icon} {label}</span>{reason && status === 'failed' && <small className="messages-failure-reason">{reason}</small>}</td><td><span className="messages-timestamp">{formatTimestamp(message.sent_at || message.scheduled_at || message.created_at)}</span></td></tr>; })}</tbody></table></div>
              <div className="messages-pagination"><p>Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredMessages.length)} of {filteredMessages.length} messages</p><div>{Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <button type="button" key={page} className={page === safeCurrentPage ? 'active' : ''} onClick={() => setCurrentPage(page)}>{page}</button>)}</div><button type="button" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>Previous</button><button type="button" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>Next</button></div>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default Messages;
