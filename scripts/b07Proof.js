import { readFileSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { A02B03AllocationAdapter } from '../src/a02B03AllocationAdapter.js'
import { CONTRACT_PINS } from '../src/contractPins.js'
import { DurableA02B03AllocationAdapter, FileAllocationCommandStore } from '../src/durableA02B03AllocationAdapter.js'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url), 'utf8'))
const adapter = new A02B03AllocationAdapter()
const result = await adapter.simulateAtomic(fixture.input, fixture.now)
const replay = await adapter.simulateAtomic(fixture.input, fixture.now)
const rollbackAdapter = new A02B03AllocationAdapter()
let injectedFailureCode = null
try {
  await rollbackAdapter.simulateAtomic(fixture.input, fixture.now, { injectFailureAfterReceipt: true })
} catch (error) {
  injectedFailureCode = error.code
}
const proofDirectory = await mkdtemp(join(tmpdir(), 'luzione-b07-proof-'))
let durableAllocationEvidence
try {
  const durable = new DurableA02B03AllocationAdapter({
    store: new FileAllocationCommandStore({ directory: proofDirectory }),
  })
  const attempts = await Promise.all(
    Array.from({ length: 24 }, () => durable.simulate(fixture.input, fixture.now)),
  )
  const records = (await readdir(proofDirectory)).filter((name) => name.endsWith('.json'))
  durableAllocationEvidence = {
    contractVersion: attempts[0].durability.storeContract,
    attempts: attempts.length,
    simulated: attempts.filter((attempt) => attempt.disposition === 'SIMULATED').length,
    replayed: attempts.filter((attempt) => attempt.disposition === 'REPLAYED').length,
    durableRecordCount: records.length,
    commandKeyHash: attempts[0].durability.commandKeyHash,
    receiptHash: attempts[0].receipt.receiptHash,
    effectMode: attempts[0].durability.effectMode,
  }
} finally {
  await rm(proofDirectory, { recursive: true, force: true })
}

const proof = {
  schemaVersion: 'luzione-fep-allocation-b07-proof/v0.1-draft',
  gate: 'G0',
  status: 'ISOLATED_SYNTHETIC_NO_EFFECT',
  sourceSha: process.env.GITHUB_SHA ?? 'LOCAL_UNBOUND',
  controllerRelease: CONTRACT_PINS.controllerRelease,
  controllerEvidenceDecision: CONTRACT_PINS.controllerEvidenceDecision,
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
  durableB03Readback: result.receipt.evidence,
  concurrencyReplay: {
    firstDisposition: result.disposition,
    duplicateDisposition: replay.disposition,
    sameReceiptHash: replay.receipt.receiptHash === result.receipt.receiptHash,
    diagnostics: adapter.diagnostics(),
  },
  durableAllocationReplay: durableAllocationEvidence,
  injectedFailureRollback: {
    code: injectedFailureCode,
    diagnostics: rollbackAdapter.diagnostics(),
    zeroReplayClaim: rollbackAdapter.diagnostics().replayClaims === 0,
  },
  automatedNegativeCoverage: [
    'A02_EXACT_FIVE_PIN_DRIFT',
    'TENANT_AND_SERVER_IDENTITY',
    'B03_SCHEMA_AND_PRODUCER_DRIFT',
    'CONCURRENT_DUPLICATE_AND_IDEMPOTENCY_CONFLICT',
    'ORDERING_AND_TRANSACTION_HASH_REPLAY',
    'STALE_FUTURE_PENDING_NONFINAL',
    'BALANCE_RECEIPT_READBACK_MISMATCH',
    'FAIRNESS_PRIVACY_APPEAL',
    'EFFECT_AUTHORITY_INJECTION',
    'INJECTED_FAILURE_EXACT_ROLLBACK',
    'FILE_BACKED_RESTART_AND_TAMPER_REPLAY',
  ],
  blockers: [
    'A02_G1_NOT_ACCEPTED',
    'B03_G1_NOT_ACCEPTED',
    'PRODUCTION_TRANSACTIONAL_STORE_NOT_IMPLEMENTED',
    'LIVE_FEP_INTEGRATION_NOT_RUN',
    'PRODUCTION_G2_NOT_GRANTED',
  ],
}

process.stdout.write(JSON.stringify(proof, null, 2) + '\n')
