const state = {
  overview: null,
  programs: [],
  cohorts: [],
  opportunities: [],
  intents: [],
  brandVersions: [],
  campaigns: [],
  sponsoredOutcomes: [],
  proofFeed: [],
  settings: null,
}

function node(tag, options = {}) {
  const element = document.createElement(tag)
  if (options.className) element.className = options.className
  if (options.text != null) element.textContent = String(options.text)
  if (options.title) element.title = options.title
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

function friendly(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase())
}

async function api(path, options) {
  const response = await fetch(path, options)
  const body = await response.json()
  if (!response.ok) {
    const error = new Error(body.message ?? body.error ?? 'Request failed')
    error.code = body.error
    throw error
  }
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

function statusPill(status) {
  const normalized = String(status)
  const tone = /CONFIRMED|DELIVERED|ACTIVE|APPROVED|RECONCILED|ACCEPTED/.test(normalized)
    ? 'positive'
    : /REJECTED|EXPIRED|WITHDRAWN|UNAVAILABLE/.test(normalized)
      ? 'negative'
      : 'pending'
  return node('span', { className: 'status ' + tone, text: friendly(normalized) })
}

function renderOverview() {
  const campaign = state.campaigns.find((item) => item.status === 'ACTIVE')
  const directCommitted = state.campaigns.reduce((sum, item) => sum + Number(item.committedMinor ?? 0), 0)
  const verified = state.proofFeed.filter((item) => item.verifiedOutcome).length
  replaceChildren(document.querySelector('#overview-metrics'), [
    metric('FEP-reported available', money(state.overview.fepReportedAvailableAllocationMinor, state.overview.currency), 'Governed program projection'),
    metric('Direct campaign capacity', money(campaign?.budgetMinor ?? 0, campaign?.currency), campaign ? campaign.name : 'No active campaign'),
    metric('Specific outcomes held', money(directCommitted, campaign?.currency), 'Request or FEP-accepted; no effect'),
    metric('Verified proof events', verified, 'Confirmed after reconciliation'),
  ])

  const target = document.querySelector('#overview-proof')
  const latest = state.proofFeed[0]
  if (!latest) {
    replaceChildren(target, [node('p', { className: 'empty small-empty', text: 'No consented proof event yet.' })])
    return
  }
  const wrapper = node('div', { className: 'mini-proof' })
  wrapper.append(statusPill(latest.lifecycleState))
  wrapper.append(node('strong', { text: latest.headline }))
  wrapper.append(node('p', { text: latest.summary }))
  wrapper.append(node('small', {
    text: money(latest.amountMinor, latest.currency) + ' · ' + latest.generalizedRegion,
  }))
  replaceChildren(target, [wrapper])
}

function renderPrograms() {
  const cards = state.programs.map((program) => {
    const card = node('article', { className: 'card program-card' })
    card.append(statusPill(program.status))
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
  replaceChildren(document.querySelector('#program-list'), cards.length
    ? cards
    : [node('p', { className: 'empty', text: 'No governed programs are visible.' })])
}

function renderCampaigns() {
  const cards = state.campaigns.map((campaign) => {
    const card = node('article', { className: 'card campaign-card' })
    const top = node('div', { className: 'card-topline' })
    top.append(statusPill(campaign.status), node('span', { className: 'rail', text: friendly(campaign.fundingRail) }))
    card.append(top)
    card.append(node('h2', { text: campaign.name }))
    card.append(node('p', { text: campaign.publicSummary }))
    const progress = node('div', { className: 'progress' })
    const used = campaign.budgetMinor ? Math.min(100, (campaign.committedMinor / campaign.budgetMinor) * 100) : 0
    const bar = node('span')
    bar.style.width = used + '%'
    progress.append(bar)
    card.append(progress)
    const footer = node('footer')
    footer.append(
      node('span', { text: money(campaign.committedMinor, campaign.currency) + ' committed' }),
      node('span', { text: money(campaign.availableMinor, campaign.currency) + ' available' }),
    )
    card.append(footer)
    return card
  })
  replaceChildren(document.querySelector('#campaign-list'), cards.length
    ? cards
    : [node('p', { className: 'empty', text: 'No sponsor campaigns yet.' })])

  const brandRows = state.brandVersions.map((brand) => {
    const row = node('div', { className: 'stack-item brand-row' })
    const mark = node('span', { className: 'brand-thumb', text: brand.displayName.slice(0, 1).toUpperCase() })
    const detail = node('div')
    detail.append(
      node('strong', { text: brand.displayName + ' · v' + brand.version }),
      node('span', { text: brand.tagline }),
      node('small', { text: brand.logoAsset.fileName + ' · ' + Math.ceil(brand.logoAsset.byteSize / 1024) + ' KB' }),
    )
    row.append(mark, detail, statusPill(brand.status))
    return row
  })
  replaceChildren(document.querySelector('#brand-list'), brandRows.length
    ? brandRows
    : [node('p', { className: 'empty small-empty', text: 'No brand versions registered.' })])

  const select = document.querySelector('#campaign-brand')
  replaceChildren(select, state.brandVersions
    .filter((brand) => brand.status === 'APPROVED')
    .map((brand) => {
      const option = node('option', { text: brand.displayName + ' · approved v' + brand.version })
      option.value = brand.brandVersionId
      return option
    }))
}

function directCampaignFor(opportunity) {
  return state.campaigns.find((campaign) =>
    campaign.status === 'ACTIVE' &&
    campaign.fundingRail === 'SPONSORED_DIRECT_GIFT' &&
    campaign.allowedCategories.includes(opportunity.category) &&
    (!campaign.allowedRegions.length || campaign.allowedRegions.includes(opportunity.generalizedRegion)) &&
    campaign.availableMinor >= opportunity.requestedAmountMinor &&
    campaign.perOutcomeCapMinor >= opportunity.requestedAmountMinor
  )
}

function renderOpportunities() {
  const cards = state.opportunities.map((opportunity) => {
    const card = node('article', { className: 'card opportunity-card' })
    const request = state.sponsoredOutcomes.find((item) =>
      item.publicCaseCode === opportunity.publicCode &&
      ['SUBMITTED_FOR_FEP_REVIEW', 'ACCEPTED_BY_FEP_NO_EFFECT'].includes(item.status)
    )
    const campaign = directCampaignFor(opportunity)
    card.append(node('span', { className: 'tag', text: friendly(opportunity.category) }))
    card.append(node('h2', { text: opportunity.headline }))
    card.append(node('p', { text: opportunity.summary }))
    const facts = node('div', { className: 'opportunity-facts' })
    facts.append(
      node('span', { text: opportunity.generalizedRegion }),
      node('strong', { text: money(opportunity.requestedAmountMinor, opportunity.currency) }),
    )
    card.append(facts)
    const button = node('button', {
      className: request ? 'secondary card-action done' : 'primary card-action',
      text: request ? friendly(request.status) : campaign ? 'Sponsor this outcome' : 'No eligible campaign',
    })
    button.type = 'button'
    button.disabled = Boolean(request || !campaign)
    if (campaign) button.dataset.campaignId = campaign.campaignId
    button.dataset.publicCaseCode = opportunity.publicCode
    button.addEventListener('click', () => sponsorOutcome(opportunity, campaign))
    card.append(button)
    card.append(node('small', {
      className: 'privacy-line',
      text: 'Public case code ' + opportunity.publicCode + ' · identity remains private',
    }))
    return card
  })
  replaceChildren(document.querySelector('#opportunity-list'), cards.length
    ? cards
    : [node('p', { className: 'empty', text: 'No consented, fundable public case codes are visible.' })])
}

function renderSponsoredOutcomes() {
  const rows = state.sponsoredOutcomes.map((request) => {
    const row = node('div', { className: 'stack-item sponsorship-row' })
    const detail = node('div')
    detail.append(
      node('strong', { text: money(request.amountMinor, request.currency) + ' · ' + request.publicCaseCode }),
      node('span', { text: 'Campaign ' + request.campaignId }),
      node('small', { text: 'Private identity withheld · no publicity condition · ' + new Date(request.createdAt).toLocaleString() }),
    )
    row.append(detail, statusPill(request.status))
    return row
  })
  replaceChildren(document.querySelector('#sponsored-list'), rows.length
    ? rows
    : [node('p', { className: 'empty', text: 'No specific-outcome requests yet.' })])
}

function renderProofFeed() {
  const cards = state.proofFeed.map((event) => {
    const card = node('article', { className: 'proof-card' })
    const timeline = node('div', { className: 'proof-timeline' })
    timeline.setAttribute('role', 'list')
    timeline.setAttribute('aria-label', 'Verified outcome lifecycle')
    ;['FUNDED', 'RESERVED', 'SENT_OR_ORDERED', 'DELIVERED', 'OUTCOME_CONFIRMED'].forEach((stage) => {
      const dot = node('span', {
        className: stage === event.lifecycleState ? 'current' : '',
        title: friendly(stage),
      })
      dot.setAttribute('role', 'listitem')
      dot.setAttribute('aria-label', friendly(stage))
      if (stage === event.lifecycleState) dot.setAttribute('aria-current', 'step')
      timeline.append(dot)
    })
    const content = node('div', { className: 'proof-content' })
    const topline = node('div', { className: 'proof-topline' })
    topline.append(statusPill(event.lifecycleState))
    if (event.verifiedOutcome) topline.append(node('span', { className: 'verified-mark', text: 'Verified outcome' }))
    content.append(topline)
    content.append(node('h2', { text: event.headline }))
    content.append(node('p', { text: event.summary }))
    const meta = node('div', { className: 'proof-meta' })
    meta.append(
      node('span', { text: money(event.amountMinor, event.currency) }),
      node('span', { text: event.generalizedRegion }),
      node('span', { text: event.publicCaseCode }),
      node('span', { text: new Date(event.occurredAt).toLocaleString() }),
    )
    content.append(meta)
    const sponsor = node('div', { className: 'proof-sponsor' })
    if (event.sponsor.attributionMode === 'ANONYMOUS') {
      sponsor.append(node('span', { className: 'sponsor-mark', text: '·' }), node('small', { text: 'Privately funded' }))
    } else {
      sponsor.append(
        node('span', { className: 'sponsor-mark', text: event.sponsor.displayName.slice(0, 1).toUpperCase() }),
        node('strong', { text: 'Outcome funded by ' + event.sponsor.displayName }),
      )
      if (event.sponsor.tagline) sponsor.append(node('small', { text: event.sponsor.tagline }))
    }
    card.append(timeline, content, sponsor)
    return card
  })
  replaceChildren(document.querySelector('#proof-feed'), cards.length
    ? cards
    : [node('p', { className: 'empty', text: 'No separately consented proof events are available.' })])
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
      node('strong', { text: money(intent.amountMinor, intent.currency) + ' · ' + friendly(intent.targetType) }),
      node('span', { text: intent.targetRef }),
      node('small', { text: new Date(intent.createdAt).toLocaleString() }),
    )
    row.append(detail, statusPill(intent.status))
    return row
  })
  replaceChildren(document.querySelector('#intent-list'), rows.length
    ? rows
    : [node('p', { className: 'empty small-empty', text: 'No program allocation intents yet.' })])
}

function renderSettings() {
  const boundary = state.settings.valueBoundary
  const recognition = node('article', { className: 'value-card' })
  recognition.append(
    node('span', { className: 'notice-kicker', text: 'Recognition only' }),
    node('h2', { text: boundary.recognition.publicName }),
    node('p', { text: boundary.recognition.purpose }),
  )
  const recognitionList = node('ul', { className: 'clean-list' })
  ;[
    'No monetary value',
    'Not transferable or redeemable',
    'Never affects essentials eligibility',
    'No right to any future conversion',
  ].forEach((text) => recognitionList.append(node('li', { text })))
  recognition.append(recognitionList)

  const credits = node('article', { className: 'value-card accent-card' })
  credits.append(
    node('span', { className: 'notice-kicker', text: 'Funded access only' }),
    node('h2', { text: boundary.essentialsCredits.publicName }),
    node('p', { text: boundary.essentialsCredits.purpose }),
  )
  const creditList = node('ul', { className: 'clean-list' })
  ;[
    'Issued only against cleared funds or committed fulfillment',
    'Used only for approved essentials',
    'No P2P transfer, cash-out, or exchange listing',
    'Refunds, reversals, and error recovery remain available',
  ].forEach((text) => creditList.append(node('li', { text })))
  credits.append(creditList)
  replaceChildren(document.querySelector('#value-boundary'), [recognition, credits])

  const entries = [
    ['Authority source', state.settings.authoritySource ?? 'FEP Platform'],
    ['Specific outcome rail', friendly(state.settings.specificOutcomeRail)],
    ['Named recipient selection', String(state.settings.namedRecipientSelection)],
    ['Raw evidence access', String(state.settings.rawEvidenceAccess)],
    ['Direct money movement', String(state.settings.directMoneyMovement)],
    ['Funding rails', state.settings.fundingRails.map(friendly).join(' · ')],
    ['Minimum cohort size', state.settings.minimumCohortSize],
    ['Production authentication configured', String(state.settings.productionAuthenticationConfigured)],
  ]
  const target = document.querySelector('#settings-list')
  target.replaceChildren(...entries.map(([label, value]) => {
    const group = node('div')
    group.append(node('dt', { text: label }), node('dd', { text: value }))
    return group
  }))
}

function render() {
  renderOverview()
  renderCampaigns()
  renderPrograms()
  renderOpportunities()
  renderSponsoredOutcomes()
  renderProofFeed()
  renderIntentControls()
  renderSettings()
}

async function loadAll() {
  const workspace = document.querySelector('.workspace')
  const globalStatus = document.querySelector('#global-status')
  workspace.setAttribute('aria-busy', 'true')
  globalStatus.classList.remove('error')
  globalStatus.textContent = 'Refreshing FEP projections…'
  try {
    state.programs = await api('/v1/programs')
    const programId = state.programs.find((program) => program.status === 'ACTIVE')?.programId
    const query = programId ? '?programId=' + encodeURIComponent(programId) : ''
    const [overview, cohorts, opportunities, intents, brandVersions, campaigns, sponsoredOutcomes, proofFeed, settings] = await Promise.all([
      api('/v1/overview'),
      programId ? api('/v1/cohorts' + query) : Promise.resolve([]),
      programId ? api('/v1/opportunities' + query) : Promise.resolve([]),
      api('/v1/allocation-intents'),
      api('/v1/brand-versions'),
      api('/v1/campaigns'),
      api('/v1/sponsored-outcomes'),
      api('/v1/proof-feed'),
      api('/v1/settings'),
    ])
    Object.assign(state, {
      overview,
      cohorts,
      opportunities,
      intents,
      brandVersions,
      campaigns,
      sponsoredOutcomes,
      proofFeed,
      settings,
    })
    render()
    globalStatus.textContent = ''
  } catch (error) {
    globalStatus.classList.add('error')
    globalStatus.textContent = 'FEP readback could not be loaded: ' + error.message
  } finally {
    workspace.setAttribute('aria-busy', 'false')
  }
}

async function sponsorOutcome(opportunity, campaign) {
  const status = document.querySelector('#opportunity-status')
  if (!campaign) return
  status.textContent = 'Submitting the public case code to FEP review…'
  try {
    await api('/v1/sponsored-outcomes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaign.campaignId,
        publicCaseCode: opportunity.publicCode,
        amountMinor: opportunity.requestedAmountMinor,
        rationale: 'Complete this bounded verified outcome.',
        idempotencyKey: 'portal-specific-' + crypto.randomUUID(),
        correlationId: 'portal-specific-' + crypto.randomUUID(),
        acknowledgements: {
          nonCharitableAcknowledged: true,
          noRecipientContact: true,
          noPublicityCondition: true,
          noCashOutOrExchange: true,
        },
      }),
    })
    status.textContent = 'Request recorded for FEP review. No money moved and no identity was disclosed.'
    await loadAll()
  } catch (error) {
    status.textContent = error.message
  }
}

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((candidate) => {
      const selected = candidate === button
      candidate.classList.toggle('active', selected)
      candidate.toggleAttribute('aria-current', selected)
      if (selected) candidate.setAttribute('aria-current', 'page')
    })
    document.querySelectorAll('.view').forEach((view) => {
      const selected = view.id === button.dataset.view
      view.classList.toggle('active', selected)
      view.hidden = !selected
    })
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
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

document.querySelector('#brand-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const status = document.querySelector('#brand-status')
  const data = new FormData(form)
  const file = data.get('logo')
  status.textContent = 'Hashing and registering the asset metadata…'
  try {
    if (!(file instanceof File) || !file.size) throw new Error('Choose a logo file.')
    await api('/v1/brand-versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: data.get('displayName'),
        tagline: data.get('tagline'),
        logoAsset: {
          assetId: 'asset-browser-' + crypto.randomUUID(),
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          sha256: await sha256(file),
          altText: data.get('altText'),
        },
      }),
    })
    form.reset()
    status.textContent = 'Immutable metadata registered for review. The file itself was not uploaded in this G0 preview.'
    await loadAll()
  } catch (error) {
    status.textContent = error.message
  }
})

document.querySelector('#campaign-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const status = document.querySelector('#campaign-status')
  const data = new FormData(form)
  status.textContent = 'Creating a capped, no-effect campaign draft…'
  try {
    const campaign = await api('/v1/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brandVersionId: data.get('brandVersionId'),
        fundingRail: 'SPONSORED_DIRECT_GIFT',
        name: data.get('name'),
        publicSummary: data.get('publicSummary'),
        budgetMinor: Math.round(Number(data.get('budget')) * 100),
        perOutcomeCapMinor: Math.round(Number(data.get('cap')) * 100),
        currency: 'USD',
        allowedCategories: String(data.get('categories')).split(',').map((value) => value.trim()).filter(Boolean),
        allowedRegions: String(data.get('regions')).split(',').map((value) => value.trim()).filter(Boolean),
        startsAt: new Date(data.get('startsAt')).toISOString(),
        endsAt: new Date(data.get('endsAt')).toISOString(),
        attributionMode: 'SPONSOR_NAME_AND_TAGLINE',
        acknowledgements: {
          nonCharitableAcknowledged: data.get('nonCharitable') === 'on',
          noRecipientContact: data.get('noContact') === 'on',
          noPublicityCondition: data.get('noPublicity') === 'on',
          noCashOutOrExchange: data.get('closedLoop') === 'on',
        },
      }),
    })
    await api('/v1/campaigns/' + encodeURIComponent(campaign.campaignId) + '/submit', { method: 'POST' })
    form.reset()
    setCampaignDates()
    status.textContent = 'Campaign submitted to FEP review. It cannot fund or publish anything until accepted.'
    await loadAll()
  } catch (error) {
    status.textContent = error.message
  }
})

document.querySelector('#intent-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const status = document.querySelector('#form-status')
  const data = new FormData(form)
  const target = data.get('targetType')
  status.textContent = 'Submitting a governed allocation preference…'
  try {
    await api('/v1/allocation-intents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        programId: data.get('programId'),
        targetType: target,
        cohortId: target === 'COHORT' ? data.get('cohortId') : undefined,
        amountMinor: Math.round(Number(data.get('amount')) * 100),
        rationale: String(data.get('rationale') ?? '').trim() || null,
        idempotencyKey: 'portal-program-' + crypto.randomUUID(),
        correlationId: 'portal-program-' + crypto.randomUUID(),
      }),
    })
    form.reset()
    updateTargetFields()
    status.textContent = 'Intent recorded for FEP review. No money moved.'
    await loadAll()
  } catch (error) {
    status.textContent = error.message
  }
})

function localInputValue(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return adjusted.toISOString().slice(0, 16)
}

function setCampaignDates() {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 30)
  document.querySelector('[name="startsAt"]').value = localInputValue(start)
  document.querySelector('[name="endsAt"]').value = localInputValue(end)
}

setCampaignDates()
loadAll()
