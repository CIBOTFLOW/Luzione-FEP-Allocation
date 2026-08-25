import { PageHeader, StatusBadge } from '../_components.js'
import { defaultSponsorCode } from '../../src/portal/auth.js'
import { getPrograms } from '../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default function ProgramsPage() {
  const programs = getPrograms({ sponsorCode: defaultSponsorCode() })

  return (
    <>
      <PageHeader title="Programs" eyebrow="Approved funding programs">
        <p className="muted">Program restrictions determine which public-safe opportunities and cohorts a sponsor can see.</p>
      </PageHeader>
      <section className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Allowed Categories</th>
              <th>Allowed Regions</th>
              <th>Status</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => (
              <tr key={program.programId}>
                <td><strong>{program.name}</strong><br /><span className="muted">{program.programId}</span></td>
                <td>{program.allowedCategories.join(', ')}</td>
                <td>{program.allowedRegions.join(', ')}</td>
                <td><StatusBadge>{program.status}</StatusBadge></td>
                <td><a className="button secondary" href={`/programs/${program.programId}`}>Review</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
