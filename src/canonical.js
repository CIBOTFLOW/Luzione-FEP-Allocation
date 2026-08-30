import { createHash, randomUUID } from 'node:crypto'

export const uid = (prefix) => `${prefix}_${randomUUID()}`

export const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

export const hash = (value) => createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')

export class AllocationError extends Error {
  constructor(code, message, status = 422) {
    super(message)
    this.code = code
    this.status = status
  }
}
