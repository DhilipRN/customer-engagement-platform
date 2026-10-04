import { useState } from 'react';

function Messages({
  messages,
  messageLoading,
  messageError,
}) {
   const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 15;

  const filteredMessages = messages.filter((message) => {
    const search = searchTerm.trim().toLowerCase();

    const scheduledAt = message.scheduled_at
      ? new Date(message.scheduled_at).toLocaleString()
      : '';

    const sentAt = message.sent_at
      ? new Date(message.sent_at).toLocaleString()
      : '';

    return (
      String(message.businessName || '').toLowerCase().includes(search) ||
      String(message.customerName || '').toLowerCase().includes(search) ||
      String(message.customerPhone || '').toLowerCase().includes(search) ||
      String(message.message_text || '').toLowerCase().includes(search) ||
      String(message.status || '').toLowerCase().includes(search) ||
      String(message.scheduled_at || '').toLowerCase().includes(search) ||
      scheduledAt.toLowerCase().includes(search) ||
      String(message.sent_at || '').toLowerCase().includes(search) ||
      sentAt.toLowerCase().includes(search)
    );
  });

  const totalMessages = filteredMessages.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalMessages / pageSize)
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;

  const paginatedMessages = filteredMessages.slice(
    startIndex,
    startIndex + pageSize
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Messages</h2>
          <p>
            View messages sent through your
            campaigns.
          </p>
        </div>
      </div>

           {/* ======================================================
          MESSAGE LIST: SEARCH AND PAGINATION
      ====================================================== */}

      {messageLoading ? (
        <p>Loading messages...</p>
      ) : messageError ? (
        <p className="error-message">
          {messageError}
        </p>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="message-search">
              Search Messages
            </label>

            <input
              id="message-search"
              type="search"
              value={searchTerm}
              placeholder="Search business, customer, phone, message, status or date..."
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {messages.length === 0 ? (
            <p>No messages found.</p>
          ) : filteredMessages.length === 0 ? (
            <p>No messages match your search.</p>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Business</th>
                      <th>Customer</th>
                      <th>Message</th>
                      <th>Status</th>
                      <th>Scheduled At</th>
                      <th>Sent At</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedMessages.map((message, index) => (
                      <tr key={message.id}>
                        <td>{startIndex + index + 1}</td>

                        <td>{message.businessName || '—'}</td>

                        <td>{message.customerName || '—'}</td>

                        <td>{message.message_text || '—'}</td>

                        <td>{message.status || '—'}</td>

                        <td>
                          {message.scheduled_at
                            ? new Date(
                                message.scheduled_at
                              ).toLocaleString()
                            : '—'}
                        </td>

                        <td>
                          {message.sent_at
                            ? new Date(
                                message.sent_at
                              ).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                className="pagination-controls"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  marginTop: '16px',
                }}
              >
                <p>
                  Showing {startIndex + 1}–
                  {Math.min(
                    startIndex + pageSize,
                    totalMessages
                  )}{' '}
                  of {totalMessages} messages
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    disabled={safeCurrentPage === 1}
                    onClick={() =>
                      setCurrentPage((page) => page - 1)
                    }
                  >
                    Previous
                  </button>

                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1
                  ).map((page) => (
                    <button
                      type="button"
                      key={page}
                      disabled={page === safeCurrentPage}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() =>
                      setCurrentPage((page) => page + 1)
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default Messages;