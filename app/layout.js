import './styles.css'

export const metadata = {
  title: 'Luzione FEP Allocation',
  description: 'Sponsor allocation portal for FEP public-safe opportunities.',
}

const navItems = [
  ['Dashboard', '/dashboard'],
  ['Programs', '/programs'],
  ['Opportunities', '/opportunities'],
  ['Cohorts', '/cohorts'],
  ['New Intent', '/intents/new'],
  ['Reports', '/reports'],
  ['Audit', '/audit'],
]

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">
          <aside className="sidebar">
            <a className="brand" href="/dashboard">
              <span className="brandMark">L</span>
              <span>
                <strong>Luzione</strong>
                <small>FEP Allocation</small>
              </span>
            </a>
            <nav aria-label="Primary">
              {navItems.map(([label, href]) => (
                <a key={href} href={href}>{label}</a>
              ))}
            </nav>
            <div className="posture">
              <strong>NO_EFFECT</strong>
              <span>FEP remains authoritative for review, eligibility, and funds.</span>
            </div>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  )
}
