import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';

const TIMELINE_PAGE_SIZE = 25;

function formatTimelineTimestamp(timestamp) {
  if (!timestamp) {
    return 'Time unavailable';
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.valueOf())
    ? 'Time unavailable'
    : date.toLocaleString();
}

function getApiError(result, fallback) {
  if (result?.error) {
    return result.error;
  }

  if (Array.isArray(result?.errors) && result.errors.length > 0) {
    return result.errors.join(' ');
  }

  return fallback;
}

function getTimelineError(result) {
  return getApiError(result, 'Unable to load the conversation.');
}

async function fetchContacts(businessList) {
  const responses = await Promise.all(
    businessList.map((business) =>
      apiFetch(
        `http://localhost:3000/customers?business_id=${encodeURIComponent(
          business.id
        )}`
      )
    )
  );

  if (responses.some((response) => !response.ok)) {
    throw new Error('Unable to load chat contacts.');
  }

  const results = await Promise.all(
    responses.map((response) => response.json())
  );

  return results.flatMap((result, index) =>
    (result.data ?? []).map((customer) => ({
      ...customer,
      businessName: businessList[index].name,
    }))
  );
}

function Chats({
  businesses,
  businessLoading,
  businessError,
  userRole,
  userBusiness,
  selectedBusinessId,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    phone: '',
    email: '',
    consent_given: false,
  });
  const [contactCreating, setContactCreating] = useState(false);
  const [contactCreateError, setContactCreateError] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [timelineItems, setTimelineItems] = useState([]);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('whatsapp');
  const [contactChannelFilter, setContactChannelFilter] = useState('all');
  const timelineRequestRef = useRef(0);
  const sendControllerRef = useRef(null);
  const messageOperationRef = useRef(null);
  const timelineEndRef = useRef(null);

  const contactBusiness = useMemo(() => {
    if (selectedBusinessId) {
      return businesses.find(
        (business) => business.id === selectedBusinessId
      ) ?? null;
    }

    if (userRole === 'client' && userBusiness) {
      return businesses.find(
        (business) => business.id === userBusiness.id
      ) ?? userBusiness;
    }

    return businesses.length === 1 ? businesses[0] : null;
  }, [businesses, selectedBusinessId, userBusiness, userRole]);

  const accessibleBusinesses = useMemo(() => {
    if (!selectedBusinessId) {
      return businesses.length
        ? businesses
        : (userBusiness ? [userBusiness] : []);
    }

    return businesses.filter(
      (business) => business.id === selectedBusinessId
    );
  }, [businesses, selectedBusinessId, userBusiness]);

  useEffect(() => {
    let isActive = true;

    async function loadContacts() {
      if (businessLoading || businessError) {
        return;
      }

      if (accessibleBusinesses.length === 0) {
        setContacts([]);
        setContactError('');
        setContactLoading(false);
        return;
      }

      setContactLoading(true);
      setContactError('');

      try {
        const loadedContacts = await fetchContacts(accessibleBusinesses);

        if (isActive) {
          setContacts(loadedContacts);
        }
      } catch (error) {
        if (isActive) {
          setContacts([]);
          setContactError(error.message);
        }
      } finally {
        if (isActive) {
          setContactLoading(false);
        }
      }
    }

    loadContacts();

    return () => {
      isActive = false;
    };
  }, [accessibleBusinesses, businessError, businessLoading]);

  const filteredContacts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return contacts.filter((contact) => {
      const channel = String(
        contact.channel || contact.preferred_channel || 'whatsapp'
      ).toLowerCase();
      const matchesChannel =
        contactChannelFilter === 'all' || channel === contactChannelFilter;
      const matchesSearch = !search || [
        contact.name,
        contact.phone,
        contact.email,
      ].some((value) => String(value || '').toLowerCase().includes(search));

      return matchesChannel && matchesSearch;
    });
  }, [contacts, contactChannelFilter, searchTerm]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );

  const showBusinessName = new Set(
    filteredContacts.map((contact) => contact.business_id)
  ).size > 1;

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timelineItems, selectedContactId]);

  function handleContactSelect(contactId) {
    sendControllerRef.current?.abort();
    sendControllerRef.current = null;
    timelineRequestRef.current += 1;
    setMessageSending(false);
    setSelectedContactId(contactId);
    setTimelineItems([]);
    setTimelinePage(1);
    setTimelineHasMore(false);
    setTimelineError('');
    setMessageText('');
    messageOperationRef.current = null;
    setMessageError('');
  }

  function resetContactForm() {
    setNewContact({
      name: '',
      phone: '',
      email: '',
      consent_given: false,
    });
    setContactCreateError('');
  }

  function handleCancelAddContact() {
    if (contactCreating) {
      return;
    }

    setShowAddContact(false);
    resetContactForm();
  }

  async function handleAddContact(event) {
    event.preventDefault();

    if (!contactBusiness || contactCreating) {
      return;
    }

    setContactCreating(true);
    setContactCreateError('');

    try {
      const response = await apiFetch(
        'http://localhost:3000/customers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            business_id: contactBusiness.id,
            name: newContact.name.trim(),
            phone: newContact.phone,
            email: newContact.email.trim(),
            consent_given: newContact.consent_given,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          getApiError(result, 'Unable to create contact.')
        );
      }

      const refreshedContacts = await fetchContacts(accessibleBusinesses);
      const createdContact = refreshedContacts.find(
        (contact) => contact.id === result.data?.id
      );

      if (!createdContact) {
        throw new Error(
          'Contact was created, but could not be found after refreshing contacts.'
        );
      }

      setContacts(refreshedContacts);
      setShowAddContact(false);
      resetContactForm();
      handleContactSelect(createdContact.id);
    } catch (error) {
      setContactCreateError(error.message);
    } finally {
      setContactCreating(false);
    }
  }

  useEffect(() => {
    const requestId = timelineRequestRef.current + 1;
    timelineRequestRef.current = requestId;
    let isActive = true;
    const controller = new AbortController();

    if (!selectedContact) {
      return () => {
        isActive = false;
        controller.abort();
      };
    }

    async function loadInitialTimeline() {
      setTimelineLoading(true);

      try {
        const response = await apiFetch(
          `http://localhost:3000/customers/${encodeURIComponent(
            selectedContact.id
          )}/timeline?business_id=${encodeURIComponent(
            selectedContact.business_id
          )}&page=1&limit=${TIMELINE_PAGE_SIZE}`,
          { signal: controller.signal }
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(getTimelineError(result));
        }

        if (
          isActive &&
          timelineRequestRef.current === requestId
        ) {
          setTimelineItems(result.data ?? []);
          setTimelinePage(result.page ?? 1);
          setTimelineHasMore(result.has_more === true);
        }
      } catch (error) {
        if (
          isActive &&
          timelineRequestRef.current === requestId &&
          error.name !== 'AbortError'
        ) {
          setTimelineError(error.message);
        }
      } finally {
        if (
          isActive &&
          timelineRequestRef.current === requestId
        ) {
          setTimelineLoading(false);
        }
      }
    }

    loadInitialTimeline();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [selectedContact]);

  async function loadOlderTimeline() {
    if (
      !selectedContact ||
      !timelineHasMore ||
      timelineLoading
    ) {
      return;
    }

    const requestId = timelineRequestRef.current + 1;
    timelineRequestRef.current = requestId;
    const controller = new AbortController();
    const nextPage = timelinePage + 1;
    const contactId = selectedContact.id;
    const businessId = selectedContact.business_id;

    setTimelineLoading(true);
    setTimelineError('');

    try {
      const response = await apiFetch(
        `http://localhost:3000/customers/${encodeURIComponent(
          contactId
        )}/timeline?business_id=${encodeURIComponent(
          businessId
        )}&page=${nextPage}&limit=${TIMELINE_PAGE_SIZE}`,
        { signal: controller.signal }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(getTimelineError(result));
      }

      if (
        timelineRequestRef.current === requestId &&
        selectedContactId === contactId
      ) {
        setTimelineItems((currentItems) => [
          ...currentItems,
          ...(result.data ?? []),
        ]);
        setTimelinePage(result.page ?? nextPage);
        setTimelineHasMore(result.has_more === true);
      }
    } catch (error) {
      if (
        timelineRequestRef.current === requestId &&
        selectedContactId === contactId &&
        error.name !== 'AbortError'
      ) {
        setTimelineError(error.message);
      }
    } finally {
      if (timelineRequestRef.current === requestId) {
        setTimelineLoading(false);
      }
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();

    const text = messageText.trim();

    if (
      !selectedContact ||
      !text ||
      selectedContact.consent_given !== true ||
      messageSending
    ) {
      return;
    }

    const contactId = selectedContact.id;
    const businessId = selectedContact.business_id;
    const operationFingerprint = `${businessId}:${contactId}:${text}`;
    if (
      !messageOperationRef.current ||
      messageOperationRef.current.fingerprint !== operationFingerprint
    ) {
      messageOperationRef.current = {
        fingerprint: operationFingerprint,
        key: crypto.randomUUID(),
      };
    }
    const idempotencyKey = messageOperationRef.current.key;
    const requestId = timelineRequestRef.current + 1;
    const controller = new AbortController();
    timelineRequestRef.current = requestId;
    sendControllerRef.current = controller;
    setMessageSending(true);
    setMessageError('');
    setTimelineError('');

    try {
      const response = await apiFetch(
        'http://localhost:3000/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            business_id: businessId,
            customer_id: contactId,
            message_text: text,
            idempotency_key: idempotencyKey,
          }),
          signal: controller.signal,
        }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(getTimelineError(result));
      }

      if (
        timelineRequestRef.current !== requestId ||
        selectedContactId !== contactId
      ) {
        return;
      }

      const timelineResponse = await apiFetch(
        `http://localhost:3000/customers/${encodeURIComponent(
          contactId
        )}/timeline?business_id=${encodeURIComponent(
          businessId
        )}&page=1&limit=${TIMELINE_PAGE_SIZE}`,
        { signal: controller.signal }
      );
      const timelineResult = await timelineResponse.json();

      if (!timelineResponse.ok) {
        throw new Error(getTimelineError(timelineResult));
      }

      if (
        timelineRequestRef.current === requestId &&
        selectedContactId === contactId
      ) {
        setTimelineItems(timelineResult.data ?? []);
        setTimelinePage(timelineResult.page ?? 1);
        setTimelineHasMore(timelineResult.has_more === true);
        setMessageText('');
        messageOperationRef.current = null;
      }
    } catch (error) {
      if (
        timelineRequestRef.current === requestId &&
        selectedContactId === contactId &&
        error.name !== 'AbortError'
      ) {
        setMessageError(error.message);
      }
    } finally {
      if (
        timelineRequestRef.current === requestId &&
        selectedContactId === contactId
      ) {
        setMessageSending(false);
      }

      if (sendControllerRef.current === controller) {
        sendControllerRef.current = null;
      }
    }
  }

  function renderAddContactForm() {
    if (!showAddContact) {
      return null;
    }

    return (
      <form className="chats-add-contact-form" onSubmit={handleAddContact}>
        <div className="chats-add-contact-heading">
          <h3>Add contact</h3>
          <button
            type="button"
            className="chats-form-close"
            onClick={handleCancelAddContact}
            disabled={contactCreating}
            aria-label="Cancel adding contact"
          >
            ×
          </button>
        </div>
        {!contactBusiness && (
          <p className="chats-business-required" role="status">
            Select a business before creating a contact.
          </p>
        )}
        <label>
          Name
          <input
            value={newContact.name}
            onChange={(event) =>
              setNewContact({
                ...newContact,
                name: event.target.value,
              })
            }
            required
            disabled={contactCreating}
          />
        </label>
        <label>
          Phone
          <input
            type="tel"
            value={newContact.phone}
            onChange={(event) =>
              setNewContact({
                ...newContact,
                phone: event.target.value
                  .replace(/\D/g, '')
                  .slice(0, 10),
              })
            }
            pattern="[0-9]{10}"
            maxLength={10}
            minLength={10}
            title="Please enter exactly 10 digits"
            placeholder="Enter 10-digit phone number"
            required
            disabled={contactCreating}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={newContact.email}
            onChange={(event) =>
              setNewContact({
                ...newContact,
                email: event.target.value,
              })
            }
            disabled={contactCreating}
          />
        </label>
        <label className="chats-consent-field">
          <input
            type="checkbox"
            checked={newContact.consent_given}
            onChange={(event) =>
              setNewContact({
                ...newContact,
                consent_given: event.target.checked,
              })
            }
            disabled={contactCreating}
          />
          Customer has given consent to receive messages
        </label>
        {contactCreateError && (
          <p className="chats-composer-error" role="alert">
            {contactCreateError}
          </p>
        )}
        <div className="chats-add-contact-actions">
          <button
            type="submit"
            disabled={contactCreating || !contactBusiness}
          >
            {contactCreating ? 'Adding...' : 'Add contact'}
          </button>
          <button
            type="button"
            className="chats-secondary-button"
            onClick={handleCancelAddContact}
            disabled={contactCreating}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  function renderContactState() {
    if (businessLoading || contactLoading) {
      return <p className="chats-state-message">Loading contacts...</p>;
    }

    if (businessError || contactError) {
      return (
        <p className="chats-state-message error-message" role="alert">
          {businessError || contactError}
        </p>
      );
    }

    if (accessibleBusinesses.length === 0) {
      return (
        <p className="chats-state-message">
          No accessible businesses are available for chats.
        </p>
      );
    }

    if (contacts.length === 0) {
      return (
        <p className="chats-state-message">
          No customers found in the selected business.
        </p>
      );
    }

    if (filteredContacts.length === 0) {
      return (
        <p className="chats-state-message">
          No contacts match your search.
        </p>
      );
    }

    return filteredContacts.map((contact) => (
      <button
        className={`chats-contact-row ${
          selectedContactId === contact.id ? 'selected' : ''
        }`}
        key={contact.id}
        type="button"
        aria-pressed={selectedContactId === contact.id}
        onClick={() => handleContactSelect(contact.id)}
      >
        <div className="chats-contact-avatar" aria-hidden="true">
          {String(contact.name || '?')
            .split(/\s+/)
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="chats-contact-details">
          <strong>{contact.name || 'Unnamed customer'}</strong>
          <span>{contact.phone || 'No phone number available'}</span>
          {showBusinessName && <small>{contact.businessName}</small>}
        </div>
        <span className="chats-channel-badge" aria-label="WhatsApp contact">
          <span aria-hidden="true">●</span> WhatsApp
        </span>
      </button>
    ));
  }

  function renderTimelineItem(item) {
    if (item.type === 'message') {
      const message = item.message ?? {};
      const channel = String(
        message.channel || message.metadata?.channel || 'whatsapp'
      ).toLowerCase();
      const isOutgoing = message.direction
        ? ['outgoing', 'sent', 'system'].includes(String(message.direction).toLowerCase())
        : true;
      const deliveryStatus = String(message.status || '').toLowerCase();

      return (
        <div
          className={`chats-timeline-row message ${isOutgoing ? 'outgoing' : 'incoming'}`}
          key={`${item.type}-${item.id}`}
        >
          <div className="chats-message-bubble">
            <p>{message.message_text || 'Message text unavailable.'}</p>
            <div className="chats-message-meta">
              <span className="chats-message-channel">
                {channel === 'sms' ? '💬 SMS' : '🟢 WhatsApp'}
              </span>
              <span>{formatTimelineTimestamp(item.timestamp)}</span>
              {isOutgoing && (
                <span className="chats-message-checks" aria-label={deliveryStatus === 'delivered' ? 'Delivered' : 'Sent'}>
                  {deliveryStatus === 'delivered' ? '✓✓' : '✓'}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="chats-timeline-row activity" key={`${item.type}-${item.id}`}>
        <div className="chats-activity-entry">
          <strong>{item.label || 'Activity'}</strong>
          <span>{formatTimelineTimestamp(item.timestamp)}</span>
          {item.is_reconstructed && (
            <small>Reconstructed from existing records</small>
          )}
        </div>
      </div>
    );
  }

  function renderConversationBody() {
    if (timelineLoading && timelineItems.length === 0) {
      return <p className="chats-state-message">Loading conversation...</p>;
    }

    if (timelineError && timelineItems.length === 0) {
      return (
        <p className="chats-state-message error-message" role="alert">
          {timelineError}
        </p>
      );
    }

    if (timelineItems.length === 0) {
      return (
        <p className="chats-state-message">
          No conversation history for this contact.
        </p>
      );
    }

    return (
      <div className="chats-timeline" aria-live="polite">
        {[...timelineItems].reverse().map(renderTimelineItem)}
        <div ref={timelineEndRef} aria-hidden="true" />
      </div>
    );
  }

  function renderComposer() {
    const consentMissing = selectedContact.consent_given !== true;
    const sendDisabled = consentMissing ||
      !messageText.trim() ||
      messageSending ||
      timelineLoading;

    return (
      <form className="chats-composer" onSubmit={handleSendMessage}>
        <div className="chats-composer-topline">
          <div className="chats-channel-switch" role="group" aria-label="Message channel">
            <button
              type="button"
              className={selectedChannel === 'whatsapp' ? 'active' : ''}
              onClick={() => setSelectedChannel('whatsapp')}
            >
              🟢 WhatsApp
            </button>
            <button
              type="button"
              className={selectedChannel === 'sms' ? 'active' : ''}
              onClick={() => setSelectedChannel('sms')}
            >
              💬 Normal SMS
            </button>
          </div>
          <span className="chats-simulated-note">
          Sender: simulated. This does not deliver real WhatsApp messages.
          </span>
        </div>
        {consentMissing && (
          <p className="chats-consent-note" role="status">
            Sending is disabled because this customer has not given consent to
            receive messages.
          </p>
        )}
        {messageError && (
          <p className="chats-composer-error" role="alert">
            {messageError}
          </p>
        )}
        <div className="chats-composer-controls">
          <textarea
            value={messageText}
            disabled={consentMissing || messageSending}
            onChange={(event) => {
              setMessageText(event.target.value);
              setMessageError('');
            }}
            placeholder={
              consentMissing
                ? 'Messaging requires customer consent'
                : selectedChannel === 'whatsapp'
                  ? 'Type a WhatsApp message...'
                  : 'Type an SMS message...'
            }
            rows={2}
            aria-label="Message text"
          />
          <button type="submit" disabled={sendDisabled}>
            {messageSending ? 'Sending...' : <><span aria-hidden="true">↗</span> Send</>}
          </button>
        </div>
      </form>
    );
  }

  function renderConversation() {
    if (!selectedContact) {
      return (
        <div className="chats-conversation-empty">
          <div className="chats-empty-icon" aria-hidden="true">◌</div>
          <h2>Select a contact</h2>
          <p>Choose a contact from the list to open a conversation.</p>
        </div>
      );
    }

    return (
      <>
        <div className="chats-conversation-header">
          <div>
            <strong>{selectedContact.name || 'Unnamed customer'}</strong>
            <span>{selectedContact.phone || 'No phone number available'}</span>
          </div>
          <div className="chats-header-channel-row">
            <span className="chats-header-channel-status">{selectedChannel === 'whatsapp' ? 'WhatsApp ready' : 'SMS ready'}</span>
            <div className="chats-channel-switch" role="group" aria-label="Message channel">
              <button
                type="button"
                className={selectedChannel === 'whatsapp' ? 'active' : ''}
                onClick={() => setSelectedChannel('whatsapp')}
              >
                🟢 WhatsApp
              </button>
              <button
                type="button"
                className={selectedChannel === 'sms' ? 'active' : ''}
                onClick={() => setSelectedChannel('sms')}
              >
                💬 Normal SMS
              </button>
            </div>
          </div>
        </div>
        <div className="chats-conversation-feed">
          {timelineHasMore && (
            <button
              className="chats-load-older"
              type="button"
              disabled={timelineLoading}
              onClick={loadOlderTimeline}
            >
              {timelineLoading ? 'Loading older history...' : 'Load older history'}
            </button>
          )}
          {renderConversationBody()}
          {timelineError && (
            <p className="chats-state-message error-message" role="alert">
              {timelineError}
            </p>
          )}
        </div>
        {renderComposer()}
      </>
    );
  }

  return (
    <section className="chats-page" aria-label="Chats">
      <div className="chats-sidebar-panel">
        <div className="chats-panel-heading">
          <div>
            <h2>Chats</h2>
            <p>Keep up with your customer conversations.</p>
          </div>
        </div>

        <div className="chats-search-row">
          <label className="chats-search" htmlFor="chat-contact-search">
            <span className="sr-only">Search contacts</span>
            <input
              id="chat-contact-search"
              type="search"
              value={searchTerm}
              placeholder="Search contacts..."
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <button
            className="chats-add-contact-button"
            type="button"
            onClick={() => {
              setContactCreateError('');
              setShowAddContact(true);
            }}
          >
            Add contact
          </button>
        </div>
        <div className="chats-contact-filters" role="group" aria-label="Filter contacts by channel">
          {[
            ['all', 'All'],
            ['whatsapp', '🟢 WhatsApp'],
            ['sms', '💬 SMS'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={contactChannelFilter === value ? 'active' : ''}
              onClick={() => setContactChannelFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {renderAddContactForm()}

        <div className="chats-contact-list" aria-live="polite">
          {renderContactState()}
        </div>
      </div>

      <div className="chats-conversation-panel">
        {renderConversation()}
      </div>
    </section>
  );
}

export default Chats;
