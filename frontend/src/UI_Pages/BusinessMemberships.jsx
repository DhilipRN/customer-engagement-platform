import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';

const PERMISSION_GROUPS = [
  ['Customers', [
    ['manage_customers', 'Manage Customers'],
  ]],
  ['Chats and messages', [
    ['view_chats', 'View Chats'],
    ['view_customer_activity', 'View Customer Activity'],
    ['send_messages', 'Send Messages'],
  ]],
  ['Appointments', [
    ['view_appointments', 'View Appointments'],
    ['manage_appointments', 'Manage Appointments'],
  ]],
  ['Purchases', [
    ['view_purchases', 'View Purchases'],
    ['manage_purchases', 'Manage Purchases'],
  ]],
  ['Campaigns', [
    ['view_campaigns', 'View Campaigns'],
    ['manage_campaigns', 'Manage Campaigns'],
  ]],
  ['Message templates', [
    ['view_message_templates', 'View Message Templates'],
    ['manage_message_templates', 'Manage Message Templates'],
  ]],
  ['Automations', [
    ['view_automations', 'View Automations'],
    ['manage_automations', 'Manage Automations'],
  ]],
];

const PERMISSIONS = PERMISSION_GROUPS.flatMap(([, permissions]) => permissions);

const EMPTY_PERMISSIONS = Object.fromEntries(
  PERMISSIONS.map(([permission]) => [permission, false])
);

function getError(result, fallback) {
  if (result?.error) return result.error;
  if (Array.isArray(result?.errors)) return result.errors.join(' ');
  return fallback;
}

function normalizeMember(member) {
  return {
    ...member,
    permissions: {
      ...EMPTY_PERMISSIONS,
      ...(member.permissions ?? {}),
    },
  };
}

function BusinessMemberships({
  businesses = [],
  businessLoading,
  businessError,
  userRole,
  userBusiness,
  selectedBusinessId,
  userProfiles = [],
  authorizedBusinessIds = [],
  membershipAuthorizationLoading = false,
  membershipAuthorizationError = '',
  canManageMemberships = false,
}) {
  const [clientBusinessId, setClientBusinessId] = useState('');
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [candidateUsers, setCandidateUsers] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({ role: 'receptionist', permissions: EMPTY_PERMISSIONS });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ user_id: '', role: 'receptionist' });
  const [actionLoading, setActionLoading] = useState(false);

  const managedBusinesses = useMemo(
    () => businesses.filter((business) => authorizedBusinessIds.includes(business.id)),
    [authorizedBusinessIds, businesses]
  );
  const requestedBusinessId = userRole === 'admin'
    ? selectedBusinessId
    : (clientBusinessId || userBusiness?.id || '');
  const managedBusinessId = requestedBusinessId && authorizedBusinessIds.includes(requestedBusinessId)
    ? requestedBusinessId
    : (userRole === 'admin' ? '' : (managedBusinesses[0]?.id || ''));
  const managedBusiness = businesses.find((business) => business.id === managedBusinessId)
    ?? (userBusiness?.id === managedBusinessId ? userBusiness : null);
  const managedBusinessRef = useRef(managedBusinessId);

  const eligibleClients = useMemo(() => candidateUsers, [candidateUsers]);

  useEffect(() => {
    managedBusinessRef.current = managedBusinessId;
  }, [managedBusinessId]);

  useEffect(() => {
    let active = true;

    async function loadMembers() {
      if (!managedBusinessId) {
        setMembers([]);
        setCandidateUsers([]);
        setMembersError('');
        setCandidateError('');
        return;
      }

      setMembersLoading(true);
      setMembersError('');
      setCandidateError('');
      setActionError('');
      setSuccessMessage('');
      let membersLoaded = false;

      try {
        const response = await apiFetch(
          `http://localhost:3000/businesses/${encodeURIComponent(managedBusinessId)}/members`
        );
        const result = await response.json();
        if (!response.ok) throw new Error(getError(result, 'Unable to load business members.'));
        membersLoaded = true;
        if (active) setMembers((result.data ?? []).map(normalizeMember));

        setCandidateLoading(true);
        const candidatesResponse = await apiFetch(
          `http://localhost:3000/businesses/${encodeURIComponent(managedBusinessId)}/member-candidates`
        );
        const candidatesResult = await candidatesResponse.json();
        if (!candidatesResponse.ok) {
          throw new Error(getError(candidatesResult, 'Unable to load eligible client users.'));
        }
        if (active) setCandidateUsers(candidatesResult.data ?? []);
      } catch (error) {
        if (active) {
          if (!membersLoaded) {
            setMembers([]);
            setMembersError(error.message);
          } else {
            setCandidateUsers([]);
            setCandidateError(error.message);
          }
        }
      } finally {
        if (active) {
          setMembersLoading(false);
          setCandidateLoading(false);
        }
      }
    }

    loadMembers();
    return () => { active = false; };
  }, [managedBusinessId]);

  function startEditing(member) {
    setEditingId(member.id);
    setEditForm({
      role: member.role,
      permissions: { ...EMPTY_PERMISSIONS, ...member.permissions },
    });
    setActionError('');
    setSuccessMessage('');
  }

  function cancelEditing() {
    if (!actionLoading) setEditingId('');
  }

  async function refreshMembers(businessId) {
    const response = await apiFetch(
      `http://localhost:3000/businesses/${encodeURIComponent(businessId)}/members`
    );
    const result = await response.json();
    if (!response.ok) throw new Error(getError(result, 'Unable to refresh business members.'));
    if (managedBusinessRef.current === businessId) {
      setMembers((result.data ?? []).map(normalizeMember));
    }
  }

  async function saveMember(memberId) {
    if (!managedBusinessId || actionLoading) return;
    const businessId = managedBusinessId;
    setActionLoading(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await apiFetch(
        `http://localhost:3000/businesses/${encodeURIComponent(businessId)}/members/${encodeURIComponent(memberId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(getError(result, 'Unable to update member.'));
      if (managedBusinessRef.current !== businessId) return;
      setMembers((current) => current.map((member) => (
        member.id === memberId ? normalizeMember(result.data) : member
      )));
      setEditingId('');
      setSuccessMessage('Member permissions saved.');
    } catch (error) {
      if (managedBusinessRef.current === businessId) setActionError(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function removeMember(member) {
    if (!managedBusinessId || actionLoading) return;
    const businessId = managedBusinessId;
    if (!window.confirm(`Remove ${member.user_id} from this business?`)) return;

    setActionLoading(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await apiFetch(
        `http://localhost:3000/businesses/${encodeURIComponent(businessId)}/members/${encodeURIComponent(member.id)}`,
        { method: 'DELETE' }
      );
      const result = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(getError(result, 'Unable to remove member.'));
      if (managedBusinessRef.current !== businessId) return;
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setSuccessMessage('Member removed.');
    } catch (error) {
      if (managedBusinessRef.current === businessId) setActionError(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function addMember(event) {
    event.preventDefault();
    if (!managedBusinessId || actionLoading || !addForm.user_id) return;
    const businessId = managedBusinessId;

    setActionLoading(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await apiFetch(
        `http://localhost:3000/businesses/${encodeURIComponent(businessId)}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(addForm),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(getError(result, 'Unable to add member.'));
      await refreshMembers(businessId);
      if (managedBusinessRef.current !== businessId) return;
      setAddForm({ user_id: '', role: 'receptionist' });
      setAdding(false);
      setSuccessMessage('Member added.');
    } catch (error) {
      if (managedBusinessRef.current === businessId) setActionError(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  function renderPermissionEditor() {
    return PERMISSION_GROUPS.map(([heading, permissions]) => (
      <div className="membership-permission-group" key={heading}>
        <strong>{heading}</strong>
        {permissions.map(([permission, label]) => (
          <label className="membership-permission" key={permission}>
            <input
              type="checkbox"
              checked={editForm.permissions[permission] === true}
              onChange={(event) => setEditForm((current) => ({
                ...current,
                permissions: {
                  ...current.permissions,
                  [permission]: event.target.checked,
                },
              }))}
              disabled={actionLoading}
            />
            {label}
          </label>
        ))}
      </div>
    ));
  }

  return (
    <section className="membership-page">
      <div className="page-header">
        <div>
          <h2>Business Members</h2>
          <p>Manage owners, receptionists, and their business permissions.</p>
        </div>
        {userRole !== 'admin' && managedBusinesses.length > 1 && (
          <label className="membership-business-select">
            Business
            <select value={managedBusinessId} onChange={(event) => setClientBusinessId(event.target.value)}>
              {managedBusinesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {membershipAuthorizationLoading && <p>Verifying membership management access...</p>}
      {membershipAuthorizationError && <p className="error-message" role="alert">{membershipAuthorizationError}</p>}
      {!membershipAuthorizationLoading && !membershipAuthorizationError && !canManageMemberships && (
        <div className="membership-notice">You are not authorized to manage members for an accessible business.</div>
      )}
      {businessLoading && <p>Loading businesses...</p>}
      {businessError && <p className="error-message" role="alert">{businessError}</p>}
      {canManageMemberships && !managedBusinessId && !businessLoading && (
        <div className="membership-notice">Select one business to manage its members.</div>
      )}

      {canManageMemberships && managedBusinessId && (
        <div className="membership-card">
          <div className="membership-card-heading">
            <div>
              <h3>{managedBusiness?.name || 'Selected business'}</h3>
              <p>Membership changes are enforced by the backend.</p>
            </div>
            {canManageMemberships && (
              <button type="button" className="primary-button" onClick={() => setAdding((current) => !current)} disabled={actionLoading}>
                {adding ? 'Cancel add' : 'Add member'}
              </button>
            )}
          </div>

          {adding && (
            <form className="membership-add-form" onSubmit={addMember}>
              <label>
                Client user
                <select value={addForm.user_id} onChange={(event) => setAddForm({ ...addForm, user_id: event.target.value })} required disabled={actionLoading || candidateLoading}>
                  <option value="">Select an eligible client</option>
                  {eligibleClients.map((profile) => <option key={profile.id} value={profile.id}>{profile.email || profile.id}</option>)}
                </select>
              </label>
              <label>
                Role
                <select value={addForm.role} onChange={(event) => setAddForm({ ...addForm, role: event.target.value })} disabled={actionLoading}>
                  <option value="receptionist">Receptionist</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              {candidateError && <p className="error-message" role="alert">{candidateError}</p>}
              {!candidateLoading && !candidateError && eligibleClients.length === 0 && <p className="membership-notice">No eligible client users are available for this business.</p>}
              <button type="submit" className="primary-button" disabled={actionLoading || candidateLoading || eligibleClients.length === 0}>Add member</button>
            </form>
          )}

          {actionError && <p className="error-message" role="alert">{actionError}</p>}
          {successMessage && <p className="success-message" role="status">{successMessage}</p>}
          {membersLoading && <p>Loading members...</p>}
          {membersError && <p className="error-message" role="alert">{membersError}</p>}
          {!membersLoading && !membersError && members.length === 0 && <p>No members found for this business.</p>}

          {!membersLoading && members.length > 0 && (
            <div className="membership-list">
              {members.map((member) => (
                <article className="membership-row" key={member.id}>
                  <div className="membership-identity">
                    <strong>{userProfiles.find((profile) => profile.id === member.user_id)?.email || member.user_id}</strong>
                    <span>{member.role}</span>
                  </div>
                  {editingId === member.id && canManageMemberships ? (
                    <div className="membership-editor">
                      <label>
                        Role
                        <select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })} disabled={actionLoading}>
                          <option value="receptionist">Receptionist</option>
                          <option value="owner">Owner</option>
                        </select>
                      </label>
                      <div className="membership-permissions">{renderPermissionEditor()}</div>
                      <div className="membership-actions">
                        <button type="button" className="primary-button" onClick={() => saveMember(member.id)} disabled={actionLoading}>{actionLoading ? 'Saving...' : 'Save'}</button>
                        <button type="button" className="secondary-button" onClick={cancelEditing} disabled={actionLoading}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="membership-permission-summary">
                        {PERMISSIONS.map(([permission, label]) => <span key={permission} className={member.permissions[permission] ? 'allowed' : ''}>{label}: {member.permissions[permission] ? 'On' : 'Off'}</span>)}
                      </div>
                      {canManageMemberships && <div className="membership-actions">
                        <button type="button" className="secondary-button" onClick={() => startEditing(member)} disabled={actionLoading}>Edit</button>
                        <button type="button" className="danger-button" onClick={() => removeMember(member)} disabled={actionLoading}>Remove</button>
                      </div>}
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default BusinessMemberships;
