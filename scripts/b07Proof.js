import { readFileSync } from 'node:fs'

import { A02B03AllocationAdapter } from '../src/a02B03AllocationAdapter.js'
import { CONTRACT_PINS } from '../src/contractPins.js'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url), 'utf8'))
const adapter = new A02B03AllocationAdapter()
const result = adapter.simulate(fixture.input, fixture.now)

const proof = {
  schemaVersion: 'luzione-fep-allocation-b07-proof/v0.1-draft',
  gate: 'G0',
  status: 'ISOLATED_SYNTHETIC_NO_EFFECT',
  controllerRelease: CONTRACT_PINS.controllerRelease,
  producerPins: result.receipt.producerPins,
  artifactSha256: CONTRACT_PINS.apiArtifactSha256,
  fixtureVectors: fixture.expected,
  observed: {
    adapterReceiptHash: result.receipt.receiptHash,
    allocationReceiptHash: result.receipt.allocation.receiptHash,
    innerSnapshotHash: result.receipt.allocation.snapshotHash,
    allocations: result.receipt.allocation.allocations.map(({ eligibilityRef, amountMinor, currency }) => ({ eligibilityRef, amountMinor, currency })),
    balance: result.receipt.balance,
  },
  authority: result.receipt.authority,
  diagnostics: adapter.diagnostics(),
  blockers: [
    'A02_G1_NOT_ACCEPTED',
    'B03_G1_NOT_ACCEPTED',
    'DURABLE_REPLAY_NOT_IMPLEMENTED',
    'LIVE_FEP_INTEGRATION_NOT_RUN',
    'PRODUCTION_G2_NOT_GRANTED',
  ],
}

process.stdout.write(JSON.stringify(proof, null, 2) + '\n')
