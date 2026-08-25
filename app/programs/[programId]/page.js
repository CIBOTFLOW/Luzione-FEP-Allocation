import { PageHeader, Metric, StatusBadge, money } from '../../_components.js'
import { defaultSponsorCode } from '../../../src/portal/auth.js'
import { getAllocation, getCohorts, getOpportunities, getPrograms, getReport } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default async function ProgramDetailPage({ params }) {
  const { programId } = await params
  const sponsorCode = defaultSponsorCode()
  const program = getPrograms({ sponsorCode }).find((item) => item.programId === programId)
  const allocation = getAllocation({ sponsorCode, programId })
  const cohorts = getCohorts({ sponsorCode, programId })
  const opportunities = getOpportunities({ sponsorCode, programId })
  const report = getReport({ sponsorCode, programId })

  return (
    <>
      <PageHeader title={program.name} eyebrow="Program detail">
        <p className="muted">{program.description}</p>
      </PageHeader>
      <section className="grid">
        <Metric label="Available allocation" value={money(allocation.availableAllocationMinor, allocation.currency)} />
        <Metric label="Reviewed cohorts" value={cohorts.length} />
        <Metric label="Visible opportunities" value={opportunities.length} />
      </section>
      <section className="section grid two">
        <div className="card">
          <h2>Restrictions</h2>
          <p><strong>Categories:</strong> {program.allowedCategories.join(', ')}</p>
          <p><strong>Regions:</strong> {program.allowedRegions.join(', ')}</p>
          <StatusBadge>{program.status}</StatusBadge>
        </div>
        <div className="card">
          <h2>Aggregate Report</h2>
          {report.suppressed ? (
            <p className="muted">Suppressed until cohort size reaches {report.minimumCohortSize}.</p>
          ) : (
            <p className="muted">{report.cohortCount} reviewed cases included. {report.metrics.publicCardsAvailable} public-safe cards available.</p>
          )}
        </div>
      </section>
    </>
  )
}
