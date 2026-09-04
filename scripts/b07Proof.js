import { readFileSync } from 'node:fs'

import { A02B03AllocationAdapter } from '../src/a02B03AllocationAdapter.js'
import { CONTRACT_PINS } from '../src/contractPins.js'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url), 'utf8'))
fixture.input.fepPostCommit = JSON.parse(readFileSync(new URL('../fixtures/b07/fep-postcommit-a02-journal.json', import.meta.url), 'utf8'))
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

const proof = {
  schemaVersion: 'luzione-fep-allocation-b07-proof/v0.2-draft',
  gate: 'G0',
  status: 'ISOLATED_SYNTHETIC_NO_EFFECT',
  sourceSha: process.env.GITHUB_SHA ?? 'LOCAL_UNBOUND',
  controllerRelease: CONTRACT_PINS.controllerRelease,
  controllerAuthorization: CONTRACT_PINS.controllerAuthorization,
  producerPins: result.receipt.producerPins,
  apiArtifactSha256: CONTRACT_PINS.apiArtifactSha256,
  apiManifestDigests: CONTRACT_PINS.apiManifestDigests,
  upstreamB03VerifiedCi: CONTRACT_PINS.fepVerifiedCi,
  fixtureVectors: fixture.expected,
  observed: {
    adapterReceiptHash: result.receipt.receiptHash,
    allocationReceiptHash: result.receipt.allocation.receiptHash,
    innerSnapshotHash: result.receipt.allocation.snapshotHash,
    allocations: result.receipt.allocation.allocations.map(({ eligibilityRef, amountMinor, currency }) => ({ eligibilityRef, amountMinor, currency })),
    balance: result.receipt.balance,
    objectVersionTransition: result.receipt.objectVersionTransition,
    identityTenantBindingHash: result.receipt.evidence.identityTenantBindingHash,
    upstreamIdentityTenantBindingHash: result.receipt.evidence.upstreamIdentityTenantBindingHash,
    callerTenantAccepted: result.receipt.evidence.callerTenantAccepted,
  },
  authority: result.receipt.authority,
  fepOwnedPostCommitReceiptReadback: result.receipt.evidence,
  concurrencyReplay: {
    firstDisposition: result.disposition,
    duplicateDisposition: replay.disposition,
    sameReceiptHash: replay.receipt.receiptHash === result.receipt.receiptHash,
    diagnostics: adapter.diagnostics(),
  },
  injectedFailureRollback: {
    code: injectedFailureCode,
    diagnostics: rollbackAdapter.diagnostics(),
    zeroReplayClaim: rollbackAdapter.diagnostics().replayClaims === 0,
  },
  automatedNegativeCoverage: [
    'A02_EXACT_FIVE_PIN_DRIFT',
    'A02_IMPLEMENTATION_FINAL_AND_MANIFEST_DIGEST_DRIFT',
    'CALLER_PREMINTED_FINALITY_REJECTED',
    'STRICT_TYPES_AND_SERVER_DERIVED_SERVICE_IDENTITY',
    'VERIFIED_EXACT_TENANT_AND_LOGICAL_ACTOR_REJECTION',
    'TENANT_HEAD_AND_OBJECT_VERSION_CLOSURE',
    'B03_SCHEMA_AND_PRODUCER_DRIFT',
    'CONCURRENT_DUPLICATE_AND_IDEMPOTENCY_CONFLICT',
    'ORDERING_AND_TRANSACTION_HASH_REPLAY',
    'STALE_FUTURE_PENDING_NONFINAL',
    'BALANCE_RECEIPT_READBACK_MISMATCH',
    'FAIRNESS_PRIVACY_APPEAL',
    'EFFECT_AUTHORITY_INJECTION',
    'INJECTED_FAILURE_EXACT_ROLLBACK',
  ],
  blockers: [
    'A02_G1_NOT_ACCEPTED',
    'B03_G1_NOT_ACCEPTED',
    'ALLOCATION_REPLAY_CLAIMS_PROCESS_LOCAL',
    'LIVE_FEP_INTEGRATION_NOT_RUN',
    'PRODUCTION_G2_NOT_GRANTED',
  ],
}

process.stdout.write(JSON.stringify(proof, null, 2) + '\n')
