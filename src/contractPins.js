const apiContractVersions = Object.freeze([
  'luzione-shared-contracts/v0.2-draft.1',
  'luzione-identity-tenant/v0.2-draft.1',
  'luzione-command-envelope/v0.2-draft.1',
  'luzione-receipt-envelope/v0.2-draft.1',
  'luzione-readback-envelope/v0.2-draft.1',
])

const apiArtifactSha256 = Object.freeze({
  'contracts/drafts/luzione-shared-contracts-v0.2-draft.1.manifest.json': 'd0971d0cf9aaf3f1037ef0165de4960f16aa93e13db4e033e9602a4c7a265f41',
  'contracts/drafts/identity-tenant-v0.2-draft.1.schema.json': '38a6f9b89c87df3491cbddbc7bb73e964e86a1afe1917a1751fe67814ed0506e',
  'contracts/drafts/command-envelope-v0.2-draft.1.schema.json': 'aaed7baa30a4fc904f15bd8ac7076138442e9a33d8f57a49332a3a68e22cc205',
  'contracts/drafts/receipt-envelope-v0.2-draft.1.schema.json': 'ca358428fa144fa10da10d26d67649c76bb6a271171f55501f15cc9cd63123bf',
  'contracts/drafts/readback-envelope-v0.2-draft.1.schema.json': 'f40f42640b4c7c8c2149b9845b10e74e59911bc3c610ccaa7195a33c6b014b0c',
})

export const CONTRACT_PINS = Object.freeze({
  controllerRelease: 'b626c665d14a7baf419ec2fef42b1ee98b66a370',
  adapterContract: 'luzione-fep-allocation-simulation/v0.1-draft',
  receiptContract: 'luzione-fep-allocation-receipt/v0.1-draft',
  apiRepository: 'CIBOTFLOW/Luzione-API',
  apiProducerSha: 'f2d643a0913b888809c217adfd9bdcef0385b05a',
  apiContractVersions,
  apiArtifactSha256,
  sharedContract: apiContractVersions[0],
  identityContract: apiContractVersions[1],
  commandContract: apiContractVersions[2],
  receiptEnvelopeContract: apiContractVersions[3],
  readbackContract: apiContractVersions[4],
  fepRepository: 'CIBOTFLOW/FEP-Platform',
  fepJournalContract: 'fep-balanced-journal/v0.1-draft',
  fepJournalProducerSha: '526e513b0698c56fefbf5b5918bb025df73e8e9e',
  fepJournalPinSha256: '034f731158fbc77d1de46fcf18fb7d31dbca83cc28faec0ef8e3b6dcfa4aa726',
  fepJournalSchemaSha256: 'ddca46acc4501ed1a60a61c0eaaddd431efd02f9b945b2b1ffb3a7f3163192fb',
  fepJournalMigrationSha256: 'e13ea51c501bcc56825af0e7583ec0929d9f3d816acb232b6e2e234b7a299c0f',
  fepJournalRollbackSha256: '3b926e7c8602207d551d05efd03ee308af695e34aa09eeb034735f77d3bff583',
  fepPolicyContract: 'fep-policy-rules-v1',
  effectMode: 'DISABLED',
  requestedEffect: 'NO_EFFECT',
})
