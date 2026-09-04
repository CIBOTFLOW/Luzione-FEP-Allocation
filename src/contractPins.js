const apiContractVersions = Object.freeze([
  'luzione-shared-contracts/v0.2-draft.1',
  'luzione-identity-tenant/v0.2-draft.1',
  'luzione-command-envelope/v0.2-draft.1',
  'luzione-receipt-envelope/v0.2-draft.1',
  'luzione-readback-envelope/v0.2-draft.1',
])

const apiArtifactSha256 = Object.freeze({
  'contracts/drafts/luzione-shared-contracts-v0.2-draft.1.manifest.json': '2d7479019d04d24344b1d4bf4d953abee2d3382ed56b8201ebb49289253e00b7',
  'contracts/drafts/identity-tenant-v0.2-draft.1.schema.json': '38a6f9b89c87df3491cbddbc7bb73e964e86a1afe1917a1751fe67814ed0506e',
  'contracts/drafts/command-envelope-v0.2-draft.1.schema.json': 'aaed7baa30a4fc904f15bd8ac7076138442e9a33d8f57a49332a3a68e22cc205',
  'contracts/drafts/receipt-envelope-v0.2-draft.1.schema.json': 'ca358428fa144fa10da10d26d67649c76bb6a271171f55501f15cc9cd63123bf',
  'contracts/drafts/readback-envelope-v0.2-draft.1.schema.json': 'f40f42640b4c7c8c2149b9845b10e74e59911bc3c610ccaa7195a33c6b014b0c',
})

export const CONTRACT_PINS = Object.freeze({
  controllerRelease: 'b43e5a65c0ae8c8bcef7e015e4a3484877f736b0',
  controllerEvidence: 'evidence/SYNC_REVIEW_20260903T234455Z.md',
  adapterContract: 'luzione-fep-allocation-simulation/v0.2-draft',
  receiptContract: 'luzione-fep-allocation-receipt/v0.2-draft',
  allocationGenesisObjectVersion: 'luzione-fep-allocation-simulation/genesis',
  apiRepository: 'CIBOTFLOW/Luzione-API',
  apiProducerSha: '12685f46a60edea23aaa0a5403e300bf8858066b',
  apiFinalEvidenceSha: 'bc43d5db8fe58230d6c3d35e32a73e1e8618b71e',
  apiContractVersions,
  apiArtifactSha256,
  apiManifestDigests: Object.freeze({
    rawFile: Object.freeze({
      algorithm: 'sha256-raw-file-v1',
      sha256: '2d7479019d04d24344b1d4bf4d953abee2d3382ed56b8201ebb49289253e00b7',
    }),
    canonicalJson: Object.freeze({
      algorithm: 'sha256-canonical-json-recursive-key-sort-v1',
      sha256: 'eaf983e1496187a22688ddfed45b541fe88a3e2b70a2fbc60863fae1a9484208',
    }),
  }),
  sharedContract: apiContractVersions[0],
  identityContract: apiContractVersions[1],
  commandContract: apiContractVersions[2],
  receiptEnvelopeContract: apiContractVersions[3],
  readbackContract: apiContractVersions[4],
  fepRepository: 'CIBOTFLOW/FEP-Platform',
  fepJournalContract: 'fep-balanced-journal/v0.1-draft',
  fepJournalProducerSha: '5db6cc8772c40a7127b7514c57787299ddad57a5',
  fepJournalPinSha256: '931dc8d0e78547eadfcc123675df86f63e024615083352c43961ebeaa28387b5',
  fepJournalSchemaSha256: '5023cebce38e4bb43a7372aad85bc457c48d9adf62b8ab9ab3d02a26ac0a54c4',
  fepJournalFixtureSha256: '57f17445caaa13efe9aeb9a3316bae83adade99d800d81159bdb78556cddd016',
  fepJournalMigrationSha256: 'e13ea51c501bcc56825af0e7583ec0929d9f3d816acb232b6e2e234b7a299c0f',
  fepJournalRollbackSha256: '3b926e7c8602207d551d05efd03ee308af695e34aa09eeb034735f77d3bff583',
  fepPolicyContract: 'fep-policy-rules-v1',
  effectMode: 'DISABLED',
  requestedEffect: 'NO_EFFECT',
})
