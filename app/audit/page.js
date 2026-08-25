import { PageHeader } from '../_components.js'
import { defaultSponsorCode } from '../../src/portal/auth.js'
import { getAudit } from '../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default function AuditPage() {
  const audit = getAudit({ sponsorCode: defaultSponsorCode() })

  return (
    <>
      <PageHeader title="Audit And Exports" eyebrow="Sponsor-visible ledger">
        <p className="muted">Exports are constrained to public-safe sponsor activity and aggregate reporting.</p>
      </PageHeader>
      <div className="section actions">
        <a className="button" href="/api/audit?export=1">Download JSON Export</a>
      </div>
      <section className="section tableWrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Occurred</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((event) => (
              <tr key={event.eventId}>
                <td>{event.eventId}</td>
                <td>{event.action}</td>
                <td>{event.resourceId ?? event.programId ?? '-'}</td>
                <td>{event.occurredAt}</td>
              </tr>
            ))}
            {!audit.length ? (
              <tr><td colSpan="4" className="muted">No sponsor audit events yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
