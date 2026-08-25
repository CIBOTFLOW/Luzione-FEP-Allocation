import { PageHeader, Metric, StatusBadge, money } from '../_components.js'
import { defaultSponsorCode } from '../../src/portal/auth.js'
import { getPortalSnapshot } from '../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  const snapshot = getPortalSnapshot(defaultSponsorCode())
  const { sponsor, programs, opportunities, intents, reports, audit, posture } = snapshot

  return (
    <>
      <PageHeader title="Sponsor Dashboard" eyebrow={`${sponsor.name} workspace`}>
        <p className="muted">Programs, allocation availability, submitted intents, and public-safe reporting in one sponsor-scoped view.</p>
      </PageHeader>

      <section className="grid">
        <Metric label="Available allocation" value={money(sponsor.availableAllocationMinor, sponsor.currency)} />
        <Metric label="Active programs" value={programs.length} />
        <Metric label="Effect posture" value={posture.effectPosture} tone="warn" />
      </section>

      <section className="section grid two">
        <div className="card">
          <h2>Operating Boundary</h2>
          <div className="stack">
            <StatusBadge tone="warn">Live allocation blocked pending authorization</StatusBadge>
            <p className="muted">FEP Platform remains authoritative for eligibility, private review, final disposition, and funds movement.</p>
          </div>
        </div>
        <div className="card">
          <h2>Workspace Activity</h2>
          <p><strong>{opportunities.length}</strong> public-safe opportunities visible</p>
          <p><strong>{intents.length}</strong> allocation intents submitted</p>
          <p><strong>{reports.filter((report) => !report.suppressed).length}</strong> aggregate reports available</p>
          <p><strong>{audit.length}</strong> audit events recorded</p>
        </div>
      </section>

      <section className="section tableWrap">
        <table>
          <thead>
            <tr>
              <th>Program</th>
              <th>Categories</th>
              <th>Regions</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => (
              <tr key={program.programId}>
                <td><strong>{program.name}</strong><br /><span className="muted">{program.description}</span></td>
                <td>{program.allowedCategories.join(', ')}</td>
                <td>{program.allowedRegions.join(', ')}</td>
                <td><StatusBadge>{program.status}</StatusBadge></td>
                <td><a className="button secondary" href={`/programs/${program.programId}`}>Open</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
