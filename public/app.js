const state = {
  overview: null,
  programs: [],
  cohorts: [],
  opportunities: [],
  intents: [],
  impact: null,
  settings: null,
}

function node(tag, options = {}) {
  const element = document.createElement(tag)
  if (options.className) element.className = options.className
  if (options.text != null) element.textContent = String(options.text)
  return element
}

function replaceChildren(target, children) {
  target.replaceChildren(...children)
}

function money(minor, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(minor ?? 0) / 100)
}

async function api(path, options) {
  const response = await fetch(path, options)
  const body = await response.json()
  if (!response.ok) throw new Error(body.message ?? body.error ?? 'Request failed')
  return body
}

function metric(label, value, hint) {
  const article = node('article', { className: 'metric' })
  article.append(
    node('span', { text: label }),
    node('strong', { text: value }),
    node('small', { text: hint }),
  )
  return article
}

function renderOverview() {
  const value = state.overview
  replaceChildren(document.querySelector('#overview-metrics'), [
    metric('FEP-reported available', money(value.fepReportedAvailableAllocationMinor, value.currency), 'Read-only FEP projection'),
    metric('Held by intents', money(value.heldIntentMinor, value.currency), 'Not yet a reservation or payment'),
    metric('Available to intent', money(value.intentableAllocationMinor, value.currency), 'Prevents local overcommitment'),
    metric('Projection version', 'v' + value.fepProjectionVersion, value.fepProjectionAsOf ?? 'Awaiting FEP readback'),
  ])
}

function renderPrograms() {
  const cards = state.programs.map((program) => {
    const card = node('article', { className: 'card' })
    card.append(node('span', { className: 'tag', text: program.status }))
    card.append(node('h2', { text: program.name }))
    card.append(node('p', { text: 'Categories: ' + program.allowedCategories.join(', ') }))
    const footer = node('footer')
    footer.append(
      node('span', { text: program.allowedRegions.length ? program.allowedRegions.join(', ') : 'All approved regions' }),
      node('span', { text: program.currency }),
    )
    card.append(footer)
    return card
  })
  replaceChildren(document.querySelector('#program-list'), cards.length ? cards : [node('p', { className: 'empty', text: 'No programs are visible.' })])
}

function renderOpportunities() {
  const cards = state.opportunities.map((opportunity) => {
    const card = node('article', { className: 'card' })
    card.append(node('span', { className: 'tag', text: opportunity.category }))
    card.append(node('h2', { text: opportunity.headline }))
    card.append(node('p', { text: opportunity.summary }))
    const footer = node('footer')
    footer.append(
      node('span', { text: opportunity.generalizedRegion }),
      node('span', { text: money(opportunity.requestedAmountMinor, opportunity.currency) + ' context only' }),
    )
    card.append(footer)
    return card
  })
  replaceChildren(document.querySelector('#opportunity-list'), cards.length ? cards : [node('p', { className: 'empty', text: 'No consented public-safe opportunities are visible.' })])
}

function renderIntentControls() {
  const programSelect = document.querySelector('#intent-program')
  replaceChildren(programSelect, state.programs
    .filter((program) => program.status === 'ACTIVE')
    .map((program) => {
      const option = node('option', { text: program.name })
      option.value = program.programId
      return option
    }))

  const cohortSelect = document.querySelector('#intent-cohort')
  replaceChildren(cohortSelect, state.cohorts.map((cohort) => {
    const option = node('option', { text: cohort.name + ' (' + cohort.eligibleCount + '+ reviewed)' })
    option.value = cohort.cohortId
    return option
  }))

  const rows = state.intents.map((intent) => {
    const row = node('div', { className: 'stack-item' })
    const detail = node('div')
    detail.append(
      node('strong', { text: money(intent.amountMinor, intent.currency) + ' · ' + intent.targetType }),
      node('span', { text: intent.targetRef }),
      node('small', { text: new Date(intent.createdAt).toLocaleString() }),
    )
    row.append(detail, node('span', { className: 'status', text: intent.status }))
    return row
  })
  replaceChildren(document.querySelector('#intent-list'), rows.length ? rows : [node('p', { className: 'empty', text: 'No allocation intents yet.' })])
}

function renderImpact() {
  const target = document.querySelector('#impact-content')
  if (!state.impact || state.impact.suppressed) {
    replaceChildren(target, [node('p', {
      className: 'empty',
      text: 'Impact is suppressed until FEP reports a sufficiently large aggregate cohort. Reason: ' + (state.impact?.reason ?? 'NO_PROJECTION'),
    })])
    return
  }
  const metrics = state.impact.metrics
  const grid = node('div', { className: 'metric-grid' })
  grid.append(
    metric('Accepted allocation', money(metrics.acceptedAllocationMinor), 'Aggregate FEP projection'),
    metric('Fulfilled cases', metrics.fulfilledCaseCount, 'No recipient identities'),
    metric('Verified outcomes', metrics.verifiedOutcomeCount, 'Human-validated outcomes only'),
    metric('Aggregate cohort', state.impact.cohortCount + '+', 'Minimum-size suppression applied'),
  )
  replaceChildren(target, [grid])
}

function label(value) {
  return String(value).replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase())
}

function renderSettings() {
  const entries = Object.entries(state.settings).map(([key, value]) => {
    const wrapper = node('div')
    wrapper.append(
      node('dt', { text: label(key) }),
      node('dd', { text: Array.isArray(value) ? value.join(', ') : String(value) }),
    )
    return wrapper
  })
  replaceChildren(document.querySelector('#settings-list'), entries)
}

function render() {
  renderOverview()
  renderPrograms()
  renderOpportunities()
  renderIntentControls()
  renderImpact()
  renderSettings()
}

async function loadAll() {
  const status = document.querySelector('#form-status')
  try {
    state.programs = await api('/v1/programs')
    const programId = state.programs.find((program) => program.status === 'ACTIVE')?.programId
    if (!programId) throw new Error('No active program is available')
    const query = '?programId=' + encodeURIComponent(programId)
    const [overview, cohorts, opportunities, intents, impact, settings] = await Promise.all([
      api('/v1/overview'),
      api('/v1/cohorts' + query),
      api('/v1/opportunities' + query),
      api('/v1/allocation-intents'),
      api('/v1/impact' + query),
      api('/v1/settings'),
    ])
    Object.assign(state, { overview, cohorts, opportunities, intents, impact, settings })
    render()
    status.textContent = ''
  } catch (error) {
    status.textContent = error.message
  }
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((candidate) => candidate.classList.toggle('active', candidate === button))
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === button.dataset.view))
  })
})

const targetType = document.querySelector('#intent-target-type')
const cohortField = document.querySelector('#cohort-field')
function updateTargetFields() {
  cohortField.hidden = targetType.value !== 'COHORT'
}
targetType.addEventListener('change', updateTargetFields)
updateTargetFields()

document.querySelector('#refresh').addEventListener('click', loadAll)

document.querySelector('#intent-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const status = document.querySelector('#form-status')
  const data = new FormData(form)
  const target = data.get('targetType')
  const amount = Number(data.get('amount'))
  const payload = {
    programId: data.get('programId'),
    targetType: target,
    cohortId: target === 'COHORT' ? data.get('cohortId') : undefined,
    amountMinor: Math.round(amount * 100),
    rationale: String(data.get('rationale') ?? '').trim() || null,
    idempotencyKey: 'portal-' + crypto.randomUUID(),
    correlationId: 'portal-' + crypto.randomUUID(),
  }
  status.textContent = 'Submitting preference to the no-effect FEP review boundary…'
  try {
    await api('/v1/allocation-intents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    form.reset()
    updateTargetFields()
    status.textContent = 'Intent recorded for FEP review. No money moved.'
    await loadAll()
  } catch (error) {
    status.textContent = error.message
  }
})

loadAll()

