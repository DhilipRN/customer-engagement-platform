function Dashboard({
  stats,
  backendStatus,
  setActivePage,
}) {
  return (
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
  );
}

export default Dashboard;