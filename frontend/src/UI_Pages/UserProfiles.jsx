import { useMemo, useState } from 'react';
import { apiFetch } from '../api';

function UserProfiles({
  userProfiles,
  userProfileLoading,
  userProfileError,
  businesses = [],
}) {
  const [assignedBusinessOverrides, setAssignedBusinessOverrides] =
    useState({});
  const [membershipRoleOverrides, setMembershipRoleOverrides] =
    useState({});

  const assignedBusinesses = useMemo(() => {
    const assignments = {};

    userProfiles.forEach((profile) => {
      assignments[profile.id] =
        assignedBusinessOverrides[profile.id] ??
        profile.business_id ??
        '';
    });

    return assignments;
  }, [assignedBusinessOverrides, userProfiles]);

  const membershipRoles = useMemo(() => {
    const roles = {};

    userProfiles.forEach((profile) => {
      roles[profile.id] =
        membershipRoleOverrides[profile.id] ??
        profile.membership_role ??
        'receptionist';
    });

    return roles;
  }, [membershipRoleOverrides, userProfiles]);

  async function handleAssignmentChange(
    userId,
    businessId,
    membershipRole
  ) {
    if (!businessId || !membershipRole) {
      return;
    }

    try {
      const response = await apiFetch(
        `http://localhost:3000/user-profiles/${userId}/business`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            business_id: businessId,
            membership_role: membershipRole,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Unable to update business assignment.'
        );
      }

      // Update the UI only after the backend confirms success.
      setAssignedBusinessOverrides((previous) => ({
        ...previous,
        [userId]: businessId,
      }));

      setMembershipRoleOverrides((previous) => ({
        ...previous,
        [userId]: membershipRole,
      }));
    } catch (error) {
      alert(error.message || 'Unable to update business assignment.');
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>User Profiles</h2>
          <p>Manage client users and their business assignments.</p>
        </div>
      </div>

      {userProfileLoading && <p>Loading user profiles...</p>}

      {userProfileError && <p>{userProfileError}</p>}

      {!userProfileLoading &&
        !userProfileError &&
        userProfiles.length === 0 && (
          <p>No user profiles found.</p>
        )}

      {!userProfileLoading &&
        !userProfileError &&
        userProfiles.length > 0 && (
          <div className="table-container">
            <table className="user-profiles-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Business</th>
                  <th>Membership Role</th>
                  <th>Created</th>
                </tr>
              </thead>

              <tbody>
                {userProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.email}</td>

                    <td>{profile.role}</td>

                    <td>
                      {profile.role === 'client' ? (
                        <select
                          value={assignedBusinesses[profile.id] || ''}
                          onChange={(event) =>
                            handleAssignmentChange(
                              profile.id,
                              event.target.value,
                              membershipRoles[profile.id]
                            )
                          }
                        >
                          <option value="">Select business</option>

                          {businesses.map((business) => (
                            <option
                              key={business.id}
                              value={business.id}
                            >
                              {business.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        'Not applicable'
                      )}
                    </td>

                    <td>
                      {profile.role === 'client' ? (
                        <select
                          value={membershipRoles[profile.id]}
                          onChange={(event) =>
                            handleAssignmentChange(
                              profile.id,
                              assignedBusinesses[profile.id],
                              event.target.value
                            )
                          }
                          disabled={!assignedBusinesses[profile.id]}
                        >
                          <option value="receptionist">
                            Receptionist
                          </option>
                          <option value="owner">Owner</option>
                        </select>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td>
                      {profile.created_at
                        ? new Date(
                            profile.created_at
                          ).toLocaleDateString()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

export default UserProfiles;