import { createHash, randomUUID } from 'node:crypto'

export const uid = (prefix) => `${prefix}_${randomUUID()}`
export const hash = (value) => createHash('sha256').update(JSON.stringify(value, Object.keys(value).sort())).digest('hex')

export class AllocationError extends Error {
  constructor(code, message, status = 422) {
    super(message)
    this.code = code
    this.status = status
  }
}
