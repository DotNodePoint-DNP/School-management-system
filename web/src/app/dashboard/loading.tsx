export default function DashboardLoading() {
  return (
    <main className="app-frame dashboard-loading" aria-live="polite">
      <aside className="sidebar" />
      <section className="content-area">
        <header className="topbar" />
        <div className="page-content">
          <div className="loading-block loading-heading" />
          <div className="loading-metrics">
            <span className="loading-block" />
            <span className="loading-block" />
            <span className="loading-block" />
            <span className="loading-block" />
          </div>
          <div className="loading-block loading-panel" />
        </div>
      </section>
    </main>
  );
}
