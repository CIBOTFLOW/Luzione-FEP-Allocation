import { PageHeader, StatusBadge } from '../_components.js'
import { defaultSponsorCode } from '../../src/portal/auth.js'
import { getCohorts } from '../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default function CohortsPage() {
  const cohorts = getCohorts({ sponsorCode: defaultSponsorCode() })

  return (
    <>
      <PageHeader title="Reviewed Cohorts" eyebrow="Broad approved dimensions">
        <p className="muted">Cohorts are approved by FEP using broad sponsor-safe dimensions only.</p>
      </PageHeader>
      <section className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Dimensions</th>
              <th>Criteria</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={cohort.cohortId}>
                <td><strong>{cohort.name}</strong><br /><span className="muted">v{cohort.version}</span></td>
                <td>{cohort.dimensions.join(', ')}</td>
                <td>{Object.entries(cohort.criteria).map(([key, value]) => `${key}: ${value}`).join(', ')}</td>
                <td><StatusBadge>{cohort.status}</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
