import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [html, script, styles] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
])

function values(pattern, source) {
  return [...source.matchAll(pattern)].map((match) => match[1])
}

test('studio markup has unique IDs and closed navigation targets', () => {
  const ids = values(/\sid="([^"]+)"/g, html)
  assert.equal(new Set(ids).size, ids.length)

  const views = values(/\sdata-view="([^"]+)"/g, html)
  assert.deepEqual(views, ['overview', 'campaigns', 'opportunities', 'sponsorships', 'proof', 'allocations', 'settings'])
  for (const view of views) {
    assert.ok(ids.includes(view), `navigation target ${view} must exist`)
    assert.match(html, new RegExp(`data-view="${view}"[^>]+aria-controls="${view}"`))
  }

  for (const labelledBy of values(/\saria-labelledby="([^"]+)"/g, html)) {
    for (const labelId of labelledBy.split(/\s+/)) assert.ok(ids.includes(labelId), `label ${labelId} must exist`)
  }
})

test('static controls expose explicit button behavior and loading/error status', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0])
  assert.ok(buttons.length > 0)
  assert.ok(buttons.every((button) => /\stype="(?:button|submit)"/.test(button)))
  assert.match(html, /class="skip-link" href="#main-content"/)
  assert.match(html, /id="global-status"[^>]+role="status"[^>]+aria-live="polite"/)
  assert.match(html, /id="main-content"[^>]+aria-busy="true"/)
  assert.match(script, /workspace\.setAttribute\('aria-busy', 'false'\)/)
})

test('browser rendering uses text-safe DOM operations and all sponsor APIs', () => {
  assert.doesNotMatch(script, /\.innerHTML\s*=|document\.write\(|\beval\(/)
  for (const path of [
    '/v1/overview',
    '/v1/programs',
    '/v1/cohorts',
    '/v1/opportunities',
    '/v1/allocation-intents',
    '/v1/brand-versions',
    '/v1/campaigns',
    '/v1/sponsored-outcomes',
    '/v1/proof-feed',
    '/v1/settings',
  ]) assert.ok(script.includes(path), `${path} must be wired into the browser`)
  assert.doesNotMatch(html + script, /bravi|bravvi/i)
})

test('responsive and keyboard-motion boundaries are explicit', () => {
  assert.match(styles, /button:focus-visible/)
  assert.match(styles, /@media \(max-width: 1040px\)/)
  assert.match(styles, /@media \(max-width: 820px\)/)
  assert.match(styles, /@media \(max-width: 580px\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})
