import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = [
  'luzione-sponsor-brand-version-v0.1-draft.schema.json',
  'luzione-sponsor-campaign-v0.1-draft.schema.json',
  'luzione-sponsored-outcome-request-v0.1-draft.schema.json',
  'fep-media-event-v1.schema.json',
]

async function artifact(name) {
  return JSON.parse(await readFile(new URL('../contracts/' + name, import.meta.url), 'utf8'))
}

test('sponsor outcome contract artifacts are strict JSON Schema drafts', async () => {
  for (const file of files) {
    const schema = await artifact(file)
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.match(schema.$id, /^https:\/\/contracts\.luzione\.example\//)
    assert.equal(schema.type, 'object')
    assert.equal(schema.additionalProperties, false)
    assert.ok(schema.required.length > 0)
  }
})

test('direct outcome contract requires all four closed-loop and dignity acknowledgements', async () => {
  const schema = await artifact('luzione-sponsored-outcome-request-v0.1-draft.schema.json')
  const acknowledgements = schema.properties.acknowledgements
  assert.deepEqual(acknowledgements.required.sort(), [
    'noCashOutOrExchange',
    'noPublicityCondition',
    'noRecipientContact',
    'nonCharitableAcknowledged',
  ])
  assert.ok(Object.values(acknowledgements.properties).every((property) => property.const === true))
})

test('proof contract exposes only the exact ordered lifecycle vocabulary', async () => {
  const schema = await artifact('fep-media-event-v1.schema.json')
  assert.deepEqual(schema.properties.lifecycleState.enum, [
    'FUNDED',
    'RESERVED',
    'SENT_OR_ORDERED',
    'DELIVERED',
    'OUTCOME_CONFIRMED',
  ])
  assert.equal(schema.properties.publicationConsentVerified.const, true)
})
