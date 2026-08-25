export function money(minor, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format((minor ?? 0) / 100)
}

export function PageHeader({ title, eyebrow, children }) {
  return (
    <header className="pageHeader">
      <div>
        {eyebrow ? <p className="muted">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {children}
      </div>
    </header>
  )
}

export function Metric({ label, value, tone }) {
  return (
    <div className="metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {tone ? <span className={`badge ${tone}`}>{tone === 'warn' ? 'Blocked' : 'Ready'}</span> : null}
    </div>
  )
}

export function StatusBadge({ children, tone = 'good' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
