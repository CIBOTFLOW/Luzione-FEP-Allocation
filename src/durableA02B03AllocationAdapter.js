import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import { A02B03AllocationAdapter } from './a02B03AllocationAdapter.js'
import { AllocationError, hash } from './canonical.js'

const STORE_CONTRACT = 'luzione-fep-allocation-command-store/v0.1-draft'

function fail(code, message, status = 409) {
  throw new AllocationError(code, message, status)
}

function immutableClone(value) {
  const cloned = structuredClone(value)
  const freeze = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate)) freeze(child)
    Object.freeze(candidate)
  }
  freeze(cloned)
  return cloned
}

function commandIdentity(input) {
  const tenantId = input?.command?.context?.tenant?.tenantId
  const commandId = input?.command?.commandId
  if (typeof tenantId !== 'string' || typeof commandId !== 'string') {
    fail('COMMAND_IDENTITY_REQUIRED', 'tenant and command identifiers are required')
  }
  return { tenantId, commandId }
}

function recordBody(inputHash, receipt) {
  return {
    storeContract: STORE_CONTRACT,
    inputHash,
    receipt,
  }
}

function validateRecord(record, inputHash, computedReceipt) {
  if (!record || typeof record !== 'object' || record.storeContract !== STORE_CONTRACT) {
    fail('DURABLE_RECORD_INVALID', 'durable command record is invalid')
  }
  const body = { ...record }
  delete body.recordHash
  if (record.recordHash !== hash(body)) {
    fail('DURABLE_RECORD_HASH_MISMATCH', 'durable command record failed its integrity check')
  }
  if (record.inputHash !== inputHash) {
    fail('COMMAND_REPLAY_CONFLICT', 'command id was durably claimed with different compatibility evidence')
  }
  if (record.receipt?.receiptHash !== computedReceipt.receiptHash) {
    fail('DURABLE_RECEIPT_DRIFT', 'deterministic receipt differs from the committed durable record')
  }
  return immutableClone(record.receipt)
}

export class FileAllocationCommandStore {
  constructor({ directory, lockTimeoutMs = 3000, retryDelayMs = 5 } = {}) {
    if (typeof directory !== 'string' || !directory.trim() || !isAbsolute(directory)) {
      throw new AllocationError('DURABLE_DIRECTORY_REQUIRED', 'an explicit absolute durable store directory is required')
    }
    if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 100 || lockTimeoutMs > 30000) {
      throw new AllocationError('LOCK_TIMEOUT_INVALID', 'lockTimeoutMs must be between 100 and 30000')
    }
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 1 || retryDelayMs > 100) {
      throw new AllocationError('LOCK_RETRY_INVALID', 'retryDelayMs must be between 1 and 100')
    }
    this.directory = resolve(directory)
    this.lockTimeoutMs = lockTimeoutMs
    this.retryDelayMs = retryDelayMs
  }

  paths(identity) {
    const keyHash = hash({ purpose: 'B07_DURABLE_COMMAND', ...identity })
    return {
      keyHash,
      recordPath: join(this.directory, keyHash + '.json'),
      lockPath: join(this.directory, keyHash + '.lock'),
    }
  }

  async acquire(lockPath) {
    const deadline = Date.now() + this.lockTimeoutMs
    while (Date.now() <= deadline) {
      try {
        return await open(lockPath, 'wx', 0o600)
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        await new Promise((resolveDelay) => setTimeout(resolveDelay, this.retryDelayMs))
      }
    }
    fail('DURABLE_COMMAND_BUSY', 'timed out waiting for the command serialization lock', 503)
  }

  async read(recordPath) {
    try {
      return JSON.parse(await readFile(recordPath, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      if (error instanceof SyntaxError) fail('DURABLE_RECORD_INVALID', 'durable command record is not valid JSON')
      throw error
    }
  }

  async write(recordPath, record) {
    const temporaryPath = recordPath + '.' + process.pid + '.' + randomUUID() + '.tmp'
    let renamed = false
    try {
      const handle = await open(temporaryPath, 'wx', 0o600)
      try {
        await handle.writeFile(JSON.stringify(record, null, 2) + '\n', 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temporaryPath, recordPath)
      renamed = true
      const directoryHandle = await open(this.directory, 'r')
      try {
        await directoryHandle.sync()
      } finally {
        await directoryHandle.close()
      }
    } finally {
      if (!renamed) await rm(temporaryPath, { force: true })
    }
  }

  async execute(identity, inputHash, computedReceipt) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const { keyHash, recordPath, lockPath } = this.paths(identity)
    const lock = await this.acquire(lockPath)
    try {
      const existing = await this.read(recordPath)
      if (existing) {
        return { disposition: 'REPLAYED', receipt: validateRecord(existing, inputHash, computedReceipt), keyHash }
      }
      const body = recordBody(inputHash, computedReceipt)
      const record = { ...body, recordHash: hash(body) }
      await this.write(recordPath, record)
      return { disposition: 'SIMULATED', receipt: immutableClone(computedReceipt), keyHash }
    } finally {
      await lock.close()
      await rm(lockPath, { force: true })
    }
  }
}

export class DurableA02B03AllocationAdapter {
  constructor({ store } = {}) {
    if (!store || typeof store.execute !== 'function') {
      throw new AllocationError('DURABLE_STORE_REQUIRED', 'a durable command store is required')
    }
    this.store = store
  }

  async simulate(input, now) {
    const computed = new A02B03AllocationAdapter().simulate(input, now)
    const identity = commandIdentity(input)
    const inputHash = hash(input)
    const committed = await this.store.execute(identity, inputHash, computed.receipt)
    return immutableClone({
      disposition: committed.disposition,
      receipt: committed.receipt,
      durability: {
        storeContract: STORE_CONTRACT,
        commandKeyHash: committed.keyHash,
        inputHash,
        effectMode: 'DISABLED',
      },
    })
  }
}

export { STORE_CONTRACT }
