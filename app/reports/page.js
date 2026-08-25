import { PageHeader, StatusBadge } from '../_components.js'
import { defaultSponsorCode } from '../../src/portal/auth.js'
import { getReports } from '../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default function ReportsPage() {
  const reports = getReports({ sponsorCode: defaultSponsorCode() })

  return (
    <>
      <PageHeader title="Aggregate Reports" eyebrow="Minimum cohort protected">
        <p className="muted">Reports are available only above minimum cohort thresholds and contain no raw applications or private review data.</p>
      </PageHeader>
      <section className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Program</th>
              <th>Cohort Count</th>
              <th>Metrics</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.programId}>
                <td>{report.programId}</td>
                <td>{report.cohortCount ?? `below ${report.minimumCohortSize}`}</td>
                <td>{report.suppressed ? report.reason : Object.entries(report.metrics).map(([k, v]) => `${k}: ${v}`).join(', ')}</td>
                <td><StatusBadge tone={report.suppressed ? 'warn' : 'good'}>{report.suppressed ? 'Suppressed' : 'Available'}</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
