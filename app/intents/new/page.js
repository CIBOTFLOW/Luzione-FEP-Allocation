import { PageHeader } from '../../_components.js'
import { defaultSponsorCode } from '../../../src/portal/auth.js'
import { getOpportunities, getPrograms } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default async function NewIntentPage({ searchParams }) {
  const query = await searchParams
  const sponsorCode = defaultSponsorCode()
  const programs = getPrograms({ sponsorCode })
  const selectedProgramId = query.programId ?? programs[0]?.programId
  const opportunities = selectedProgramId ? getOpportunities({ sponsorCode, programId: selectedProgramId }) : []

  return (
    <>
      <PageHeader title="Create Allocation Intent" eyebrow="Submitted for FEP review">
        <p className="muted">Intent submission never moves funds directly. FEP reviews and records the final disposition.</p>
      </PageHeader>
      <form className="formPanel" action="/api/allocation-intents" method="post">
        <div className="formGrid">
          <label>
            Program
            <select name="programId" defaultValue={selectedProgramId}>
              {programs.map((program) => <option key={program.programId} value={program.programId}>{program.name}</option>)}
            </select>
          </label>
          <label>
            Target type
            <select name="targetType" defaultValue="PUBLIC_CASE_CARD">
              <option value="PUBLIC_CASE_CARD">Public case card</option>
              <option value="COHORT">Reviewed cohort</option>
            </select>
          </label>
          <label>
            Public code
            <select name="publicCode" defaultValue={query.publicCode ?? opportunities[0]?.publicCode}>
              {opportunities.map((card) => <option key={card.publicCode} value={card.publicCode}>{card.publicCode} - {card.headline}</option>)}
            </select>
          </label>
          <label>
            Amount minor units
            <input name="amountMinor" type="number" min="1" defaultValue={query.amountMinor ?? opportunities[0]?.requestedAmountMinor ?? 10000} />
          </label>
          <label className="full">
            Rationale
            <textarea name="rationale" defaultValue="Sponsor allocation intent based on public-safe reviewed opportunity." />
          </label>
          <label>
            Idempotency key
            <input name="idempotencyKey" defaultValue={`portal-${Date.now()}`} />
          </label>
          <label>
            Correlation ID
            <input name="correlationId" defaultValue={`ui-${Date.now()}`} />
          </label>
        </div>
        <div className="section actions">
          <button type="submit">Submit Intent</button>
          <a className="button secondary" href="/opportunities">Back to Opportunities</a>
        </div>
      </form>
    </>
  )
}
