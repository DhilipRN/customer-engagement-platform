import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

function UserProfiles({
  userProfiles,
  userProfileLoading,
  userProfileError,
  businesses = [],
}) {
  const [assignedBusinesses, setAssignedBusinesses] = useState({});

  useEffect(() => {
    const assignments = {};

    userProfiles.forEach((profile) => {
      assignments[profile.id] = profile.business_id || '';
    });

    setAssignedBusinesses(assignments);
  }, [userProfiles]);

  async function handleBusinessChange(userId, businessId) {
    if (!businessId) {
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
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Unable to assign business'
        );
      }

      setAssignedBusinesses((previous) => ({
        ...previous,
        [userId]: businessId,
      }));
    } catch (error) {
      alert(error.message);
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

      {userProfileLoading && (
        <p>Loading user profiles...</p>
      )}

      {userProfileError && (
        <p>{userProfileError}</p>
      )}

      {!userProfileLoading &&
        !userProfileError &&
        userProfiles.length === 0 && (
          <p>No user profiles found.</p>
        )}

      {!userProfileLoading &&
        !userProfileError &&
        userProfiles.length > 0 && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Business</th>
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
                          value={
                            assignedBusinesses[profile.id] || ''
                          }
                          onChange={(event) =>
                            handleBusinessChange(
                              profile.id,
                              event.target.value
                            )
                          }
                        >
                          <option value="">
                            Select business
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
                      ) : (
                        'Not applicable'
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