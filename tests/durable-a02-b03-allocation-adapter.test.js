import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { hash } from '../src/canonical.js'
import {
  DurableA02B03AllocationAdapter,
  FileAllocationCommandStore,
} from '../src/durableA02B03AllocationAdapter.js'

const fixturePath = new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url)

function fixture() {
  return structuredClone(JSON.parse(readFileSync(fixturePath, 'utf8')))
}

function rehash(data) {
  data.input.command.payloadHash = hash(data.input.command.payload)
  data.input.receipt.idempotency.payloadHash = data.input.command.payloadHash
}

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'luzione-b07-durable-'))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('concurrent exact deliveries durably commit once and replay one immutable receipt', async () => {
  await withStore(async (directory) => {
    const data = fixture()
    const runs = await Promise.all(Array.from({ length: 24 }, async () => {
      const adapter = new DurableA02B03AllocationAdapter({
        store: new FileAllocationCommandStore({ directory }),
      })
      return adapter.simulate(data.input, data.now)
    }))
    assert.equal(runs.filter((run) => run.disposition === 'SIMULATED').length, 1)
    assert.equal(runs.filter((run) => run.disposition === 'REPLAYED').length, 23)
    assert.equal(new Set(runs.map((run) => run.receipt.receiptHash)).size, 1)
    assert.equal(new Set(runs.map((run) => run.durability.commandKeyHash)).size, 1)
    assert.ok(runs.every((run) => run.durability.effectMode === 'DISABLED'))
  })
})

test('a fresh adapter instance replays the durable receipt after process-local state is gone', async () => {
  await withStore(async (directory) => {
    const data = fixture()
    const first = await new DurableA02B03AllocationAdapter({
      store: new FileAllocationCommandStore({ directory }),
    }).simulate(data.input, data.now)
    const replay = await new DurableA02B03AllocationAdapter({
      store: new FileAllocationCommandStore({ directory }),
    }).simulate(data.input, data.now)
    assert.equal(first.disposition, 'SIMULATED')
    assert.equal(replay.disposition, 'REPLAYED')
    assert.equal(replay.receipt.receiptHash, first.receipt.receiptHash)
  })
})

test('changed evidence under an already claimed command id is denied without overwriting the record', async () => {
  await withStore(async (directory) => {
    const adapter = new DurableA02B03AllocationAdapter({
      store: new FileAllocationCommandStore({ directory }),
    })
    const first = fixture()
    const committed = await adapter.simulate(first.input, first.now)
    const { recordPath } = adapter.store.paths({ tenantId: 'tenant-acme', commandId: 'cmd-b07-synthetic-1' })
    const before = await readFile(recordPath, 'utf8')

    const changed = fixture()
    changed.input.command.payload.allocationSnapshot.request.requestedAmountMinor = 500
    rehash(changed)
    await assert.rejects(
      () => adapter.simulate(changed.input, changed.now),
      (error) => error.code === 'COMMAND_REPLAY_CONFLICT',
    )
    assert.equal(await readFile(recordPath, 'utf8'), before)
    assert.match(before, new RegExp(committed.receipt.receiptHash))
  })
})

test('failed simulations leave no durable claim and a corrected retry can commit', async () => {
  await withStore(async (directory) => {
    const store = new FileAllocationCommandStore({ directory })
    const adapter = new DurableA02B03AllocationAdapter({ store })
    const failed = fixture()
    failed.input.command.payload.allocationSnapshot.candidates.forEach((candidate) => {
      candidate.maximumAllocationMinor = 100
    })
    rehash(failed)
    await assert.rejects(
      () => adapter.simulate(failed.input, failed.now),
      (error) => error.code === 'CANDIDATE_CAPACITY_INSUFFICIENT',
    )
    const { recordPath } = store.paths({ tenantId: 'tenant-acme', commandId: 'cmd-b07-synthetic-1' })
    await assert.rejects(() => readFile(recordPath, 'utf8'), (error) => error.code === 'ENOENT')
    assert.equal((await adapter.simulate(fixture().input, fixture().now)).disposition, 'SIMULATED')
  })
})

test('tampered durable data fails closed instead of being accepted as a replay', async () => {
  await withStore(async (directory) => {
    const data = fixture()
    const store = new FileAllocationCommandStore({ directory })
    const adapter = new DurableA02B03AllocationAdapter({ store })
    await adapter.simulate(data.input, data.now)
    const { recordPath } = store.paths({ tenantId: 'tenant-acme', commandId: 'cmd-b07-synthetic-1' })
    const record = JSON.parse(await readFile(recordPath, 'utf8'))
    record.receipt.balance.allocatedMinor = 1
    await writeFile(recordPath, JSON.stringify(record), 'utf8')
    await assert.rejects(
      () => new DurableA02B03AllocationAdapter({ store }).simulate(data.input, data.now),
      (error) => error.code === 'DURABLE_RECORD_HASH_MISMATCH',
    )
  })
})
