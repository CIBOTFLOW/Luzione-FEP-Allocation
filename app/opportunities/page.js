import { PageHeader, StatusBadge, money } from '../_components.js'
import { defaultSponsorCode } from '../../src/portal/auth.js'
import { getOpportunities, getPrograms } from '../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default function OpportunitiesPage() {
  const sponsorCode = defaultSponsorCode()
  const program = getPrograms({ sponsorCode })[0]
  const opportunities = getOpportunities({ sponsorCode, programId: program.programId })

  return (
    <>
      <PageHeader title="Public-Safe Opportunities" eyebrow={program.name}>
        <p className="muted">Cards include only consented, reviewed, sponsor-safe summaries and broad cohort tags.</p>
      </PageHeader>
      <section className="grid">
        {opportunities.map((card) => (
          <article className="card" key={card.publicCode}>
            <h2>{card.headline}</h2>
            <p className="muted">{card.summary}</p>
            <p><strong>{money(card.requestedAmountMinor, card.currency)}</strong></p>
            <p>{card.generalizedRegion}</p>
            <div className="actions">
              <StatusBadge>{card.category}</StatusBadge>
              <a className="button secondary" href={`/intents/new?publicCode=${card.publicCode}&programId=${program.programId}&amountMinor=${card.requestedAmountMinor}`}>Create Intent</a>
            </div>
          </article>
        ))}
      </section>
    </>
  )
}
