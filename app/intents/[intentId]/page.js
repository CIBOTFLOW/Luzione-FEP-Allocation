import { PageHeader, Metric, money } from '../../_components.js'
import { defaultSponsorCode } from '../../../src/portal/auth.js'
import { getIntent } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export default async function IntentDetailPage({ params }) {
  const { intentId } = await params
  const intent = getIntent({ sponsorCode: defaultSponsorCode(), intentId })

  return (
    <>
      <PageHeader title="Allocation Intent" eyebrow={intent.allocationIntentId}>
        <p className="muted">Status timeline reflects FEP review disposition. The sponsor cannot finalize the result.</p>
      </PageHeader>
      <section className="grid">
        <Metric label="Amount" value={money(intent.amountMinor, intent.currency)} />
        <Metric label="Status" value={intent.status} />
        <Metric label="Target" value={intent.targetType} />
      </section>
      <section className="section card">
        <h2>Timeline</h2>
        <p><strong>Created:</strong> {intent.createdAt}</p>
        <p><strong>Current:</strong> {intent.status}</p>
        {intent.reviewedAt ? <p><strong>Reviewed:</strong> {intent.reviewedAt}</p> : <p className="muted">Awaiting FEP disposition.</p>}
      </section>
    </>
  )
}
