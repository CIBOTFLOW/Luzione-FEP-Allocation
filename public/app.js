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
  movementFeed: [],
  supportLedger: [],
  priorityQueue: [],
  platformStatus: null,
  settings: null,
  movementSort: 'TRENDING',
  localMedia: new Map(),
  pendingMediaUrls: [],
  carouselIndex: new Map(),
  openThreads: new Set(),
  replyTargetByPost: new Map(),
}

function node(tag, options = {}) {
  const element = document.createElement(tag)
  if (options.className) element.className = options.className
  if (options.text != null) element.textContent = String(options.text)
  if (options.title) element.title = options.title
  if (options.ariaLabel) element.setAttribute('aria-label', options.ariaLabel)
  return element
}

function replaceChildren(target, children) {
  target.replaceChildren(...children)
}

function money(minor, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 })
    .format(Number(minor ?? 0) / 100)
}

function friendly(value) {
  return String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/^./, (character) => character.toUpperCase())
}

function readableDate(value) {
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
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
  article.append(node('span', { text: label }), node('strong', { text: value }), node('small', { text: hint }))
  return article
}

function statusPill(status) {
  const normalized = String(status)
  const tone = /CONFIRMED|DELIVERED|ACTIVE|APPROVED|RECONCILED|ACCEPTED|PASS|VERIFIED_IN_CI/.test(normalized)
    ? 'positive'
    : /REJECTED|EXPIRED|WITHDRAWN|UNAVAILABLE|DISABLED|NOT_CONNECTED/.test(normalized) ? 'negative' : 'pending'
  return node('span', { className: 'status ' + tone, text: friendly(normalized) })
}

function postDomId(postId) {
  return 'movement-post-' + String(postId).replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

function demoMediaSource(post, item, index) {
  const local = state.localMedia.get(post.postId)?.[index]
  if (local) return local.url
  if (post.publicCaseCode === 'LZN-WORK-001') return '/demo-safety-kit.svg'
  if (/transit/i.test(item.fileName) || post.publicCaseCode === 'LZN-WORK-002') return '/demo-transit.svg'
  return null
}

function renderMoments() {
  const moments = state.movementFeed.slice(0, 8).map((post) => {
    const button = node('button', { className: 'moment', ariaLabel: 'Open ' + (post.headline ?? post.caption) })
    button.type = 'button'
    const ring = node('span', { className: 'moment-ring' })
    const source = demoMediaSource(post, post.mediaItems[0], 0)
    if (source) {
      const image = node('img')
      image.src = source
      image.alt = ''
      ring.append(image)
    } else ring.append(node('span', { className: 'moment-fallback', text: post.account.avatarText }))
    button.append(ring, node('strong', { text: post.account.handle }), node('small', { text: post.verification.label }))
    button.addEventListener('click', () => document.getElementById(postDomId(post.postId))?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return button
  })
  replaceChildren(document.querySelector('#happy-moments'), moments.length ? moments : [node('p', { className: 'empty small-empty', text: 'Happy Moments will appear as updates are published.' })])
}

function mediaStage(post) {
  const stage = node('div', { className: 'post-media-wrap' })
  const index = Math.min(state.carouselIndex.get(post.postId) ?? 0, post.mediaItems.length - 1)
  const item = post.mediaItems[index]
  const source = demoMediaSource(post, item, index)
  const frame = node('div', { className: 'post-media ' + post.mediaPresentation.toLowerCase() })
  if (source && item.mimeType.startsWith('video/')) {
    const video = node('video')
    video.src = source
    video.controls = true
    video.playsInline = true
    video.preload = 'metadata'
    video.setAttribute('aria-label', item.altText)
    frame.append(video)
  } else if (source) {
    const image = node('img')
    image.src = source
    image.alt = item.altText
    image.loading = 'lazy'
    frame.append(image)
  } else {
    frame.append(node('div', { className: 'media-fallback', text: item.mimeType.startsWith('video/') ? 'Video selected' : 'Photo preview unavailable after refresh' }))
  }
  if (post.mediaItems.length > 1) {
    const counter = node('span', { className: 'media-counter', text: (index + 1) + ' / ' + post.mediaItems.length })
    const previous = node('button', { className: 'carousel-control previous', text: '‹', ariaLabel: 'Previous image' })
    const next = node('button', { className: 'carousel-control next', text: '›', ariaLabel: 'Next image' })
    previous.type = 'button'
    next.type = 'button'
    previous.addEventListener('click', () => {
      state.carouselIndex.set(post.postId, (index - 1 + post.mediaItems.length) % post.mediaItems.length)
      renderMovementFeed()
    })
    next.addEventListener('click', () => {
      state.carouselIndex.set(post.postId, (index + 1) % post.mediaItems.length)
      renderMovementFeed()
    })
    frame.append(counter, previous, next)
  }
  stage.append(frame)
  return stage
}

function actionButton(symbol, label, count, active, handler) {
  const button = node('button', { className: 'post-action' + (active ? ' active' : ''), ariaLabel: label })
  button.type = 'button'
  button.setAttribute('aria-pressed', String(Boolean(active)))
  button.append(node('span', { className: 'action-symbol', text: symbol, title: label }))
  if (count != null) button.append(node('small', { text: count }))
  button.addEventListener('click', handler)
  return button
}

function renderComment(comment, replies, postId) {
  const item = node('article', { className: 'comment' + (comment.parentCommentId ? ' reply' : '') })
  const avatar = node('span', { className: 'comment-avatar', text: comment.account.avatarText })
  const body = node('div', { className: 'comment-body' })
  const top = node('div', { className: 'comment-topline' })
  top.append(node('strong', { text: comment.account.displayName }), node('span', { text: '@' + comment.account.handle + ' · ' + readableDate(comment.createdAt) }))
  body.append(top, node('p', { text: comment.text }))
  if (comment.attachment) body.append(node('span', { className: 'attachment-chip', text: '▧ Photo attached' }))
  if (!comment.parentCommentId) {
    const reply = node('button', { className: 'comment-reply', text: 'Reply' })
    reply.type = 'button'
    reply.addEventListener('click', () => {
      state.replyTargetByPost.set(postId, comment.commentId)
      state.openThreads.add(postId)
      renderMovementFeed()
      document.querySelector(`[data-comment-form="${CSS.escape(postId)}"] textarea`)?.focus()
    })
    body.append(reply)
  }
  item.append(avatar, body)
  if (replies.length) {
    const thread = node('div', { className: 'reply-thread' })
    replies.forEach((reply) => thread.append(renderComment(reply, [], postId)))
    body.append(thread)
  }
  return item
}

function renderCommentThread(post) {
  const section = node('section', { className: 'comment-thread' })
  const roots = post.comments.filter((comment) => !comment.parentCommentId)
  roots.forEach((comment) => section.append(renderComment(comment, post.comments.filter((candidate) => candidate.parentCommentId === comment.commentId), post.postId)))
  if (!roots.length) section.append(node('p', { className: 'empty-comment', text: 'Start a respectful thread.' }))
  const form = node('form', { className: 'comment-form' })
  form.dataset.commentForm = post.postId
  const replyTarget = state.replyTargetByPost.get(post.postId)
  if (replyTarget) {
    const context = node('div', { className: 'reply-context' })
    context.append(node('span', { text: 'Replying in thread' }))
    const cancel = node('button', { text: 'Cancel' })
    cancel.type = 'button'
    cancel.addEventListener('click', () => {
      state.replyTargetByPost.delete(post.postId)
      renderMovementFeed()
    })
    context.append(cancel)
    form.append(context)
  }
  const row = node('div', { className: 'comment-compose-row' })
  const textarea = node('textarea')
  textarea.name = 'text'
  textarea.rows = 2
  textarea.maxLength = 400
  textarea.placeholder = replyTarget ? 'Write a reply…' : 'Add an X-style comment…'
  textarea.required = true
  const submit = node('button', { className: 'secondary', text: 'Post' })
  submit.type = 'submit'
  row.append(textarea, submit)
  const photoLabel = node('label', { className: 'comment-photo', text: 'Optional photo' })
  const photo = node('input')
  photo.name = 'attachment'
  photo.type = 'file'
  photo.accept = 'image/png,image/jpeg,image/webp'
  photoLabel.append(photo)
  const status = node('p', { className: 'form-status' })
  form.append(row, photoLabel, status)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const attachment = data.get('attachment')
    status.textContent = 'Posting comment…'
    try {
      const payload = {
        parentCommentId: state.replyTargetByPost.get(post.postId) ?? null,
        displayName: 'Luzione Member',
        handle: 'luzione.member',
        text: data.get('text'),
        attachment: attachment instanceof File && attachment.size ? {
          fileName: attachment.name,
          mimeType: attachment.type,
          byteSize: attachment.size,
          sha256: await sha256(attachment),
          altText: 'Photo attached to a movement comment',
        } : null,
      }
      await api('/v1/movement-posts/' + encodeURIComponent(post.postId) + '/comments', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      })
      state.replyTargetByPost.delete(post.postId)
      await loadMovement()
    } catch (error) {
      status.textContent = error.message
    }
  })
  section.append(form)
  return section
}

async function interact(post, action) {
  const globalStatus = document.querySelector('#global-status')
  try {
    await api('/v1/movement-posts/' + encodeURIComponent(post.postId) + '/interactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, accountId: action === 'FOLLOW' ? post.account.accountId : undefined }),
    })
    globalStatus.textContent = action === 'SEND' ? 'Share action recorded. No private recipient information was included.' : ''
    await loadMovement()
  } catch (error) {
    globalStatus.classList.add('error')
    globalStatus.textContent = error.message
  }
}

function renderPost(post) {
  const card = node('article', { className: 'movement-post ' + post.kind.toLowerCase() })
  card.id = postDomId(post.postId)
  const header = node('header', { className: 'post-header' })
  const avatar = node('span', { className: 'avatar', text: post.account.avatarText })
  const account = node('div', { className: 'post-account' })
  const accountLine = node('div')
  accountLine.append(node('strong', { text: post.account.displayName }))
  if (post.account.verifiedSponsor) accountLine.append(node('span', { className: 'verified-dot', text: '✓', title: 'Approved sponsor identity' }))
  account.append(accountLine, node('span', { text: '@' + post.account.handle + ' · ' + readableDate(post.createdAt) }), node('small', { text: post.location }))
  const follow = node('button', { className: 'follow-button' + (post.engagement.viewer.following ? ' following' : ''), text: post.engagement.viewer.following ? 'Following' : 'Follow' })
  follow.type = 'button'
  follow.setAttribute('aria-pressed', String(post.engagement.viewer.following))
  follow.addEventListener('click', () => interact(post, 'FOLLOW'))
  header.append(avatar, account, follow)
  card.append(header, mediaStage(post))

  const actions = node('div', { className: 'post-actions' })
  actions.append(
    actionButton(post.engagement.viewer.liked ? '♥' : '♡', 'Like', post.engagement.likeCount, post.engagement.viewer.liked, () => interact(post, 'LIKE')),
    actionButton('○', 'Comment', post.engagement.commentCount, state.openThreads.has(post.postId), () => {
      if (state.openThreads.has(post.postId)) state.openThreads.delete(post.postId)
      else state.openThreads.add(post.postId)
      renderMovementFeed()
    }),
    actionButton('↗', 'Send', post.engagement.sendCount, post.engagement.viewer.sent, () => interact(post, 'SEND')),
  )
  const spacer = node('span', { className: 'action-spacer' })
  actions.append(spacer, actionButton(post.engagement.viewer.saved ? '▣' : '□', 'Bookmark', null, post.engagement.viewer.saved, () => interact(post, 'SAVE')))
  card.append(actions)

  const content = node('div', { className: 'post-content' })
  const validation = node('div', { className: 'validation-line' })
  validation.append(statusPill(post.verification.status), node('span', { text: post.verification.acknowledgement }))
  content.append(validation)
  if (post.headline) content.append(node('h2', { text: post.headline }))
  const caption = node('p', { className: 'caption' })
  caption.append(node('strong', { text: '@' + post.account.handle + ' ' }), document.createTextNode(post.caption))
  content.append(caption)
  const metadata = node('div', { className: 'post-metadata' })
  if (post.funding) metadata.append(node('span', { text: money(post.funding.amountMinor, post.funding.currency) + ' support' }))
  if (post.publicCaseCode) metadata.append(node('span', { text: post.publicCaseCode }))
  metadata.append(node('span', { text: post.mediaPresentation === 'SLIDESHOW' ? post.mediaItems.length + ' photos' : friendly(post.mediaPresentation) }))
  content.append(metadata)
  const requirements = node('details', { className: 'validation-details' })
  requirements.append(node('summary', { text: 'Validation requirements' }))
  const list = node('ul')
  post.verification.requirements.forEach((requirement) => list.append(node('li', { text: requirement })))
  requirements.append(list)
  content.append(requirements)
  card.append(content)
  if (state.openThreads.has(post.postId)) card.append(renderCommentThread(post))
  return card
}

function renderMovementFeed() {
  replaceChildren(document.querySelector('#movement-feed'), state.movementFeed.length
    ? state.movementFeed.map(renderPost)
    : [node('p', { className: 'empty', text: 'No consented movement posts are available.' })])
  renderMoments()
  const confirmed = state.movementFeed.filter((post) => post.verification.status === 'VERIFIED_OUTCOME').length
  const voluntary = state.movementFeed.filter((post) => post.kind === 'VOLUNTARY_UPDATE').length
  const visibleAmount = state.movementFeed.reduce((total, post) => total + Number(post.funding?.amountMinor ?? 0), 0)
  const snapshot = [
    ['Verified outcomes', confirmed],
    ['Voluntary updates', voluntary],
    ['Visible support', money(visibleAmount)],
  ]
  replaceChildren(document.querySelector('#feed-snapshot'), snapshot.map(([label, value]) => {
    const row = node('div')
    row.append(node('span', { text: label }), node('strong', { text: value }))
    return row
  }))
}

function renderOverview() {
  if (!state.overview || !state.platformStatus) return
  const impact = state.platformStatus.overallImpact
  const governance = state.platformStatus.governance
  replaceChildren(document.querySelector('#overview-metrics'), [
    metric('FEP-reported available', money(state.overview.fepReportedAvailableAllocationMinor, state.overview.currency), 'Governed projection'),
    metric('Accepted overall', money(impact.acceptedAllocationMinor, impact.currency), 'Aggregate impact readback'),
    metric('Verified outcomes', impact.verifiedOutcomeCount, 'Privacy-thresholded total'),
    metric('Verified receipts', governance.verifiedReceiptCount, 'Receipt-bound system events'),
  ])
  const target = document.querySelector('#overview-proof')
  const latest = state.proofFeed[0]
  if (!latest) return replaceChildren(target, [node('p', { className: 'empty small-empty', text: 'No consented proof event yet.' })])
  const wrapper = node('div', { className: 'mini-proof' })
  wrapper.append(statusPill(latest.lifecycleState), node('strong', { text: latest.headline }), node('p', { text: latest.summary }), node('small', { text: money(latest.amountMinor, latest.currency) + ' · ' + latest.generalizedRegion }))
  replaceChildren(target, [wrapper])
}

function renderPrograms() {
  const cards = state.programs.map((program) => {
    const card = node('article', { className: 'card program-card' })
    card.append(statusPill(program.status), node('h2', { text: program.name }), node('p', { text: 'Categories: ' + program.allowedCategories.join(', ') }))
    const footer = node('footer')
    footer.append(node('span', { text: program.allowedRegions.length ? program.allowedRegions.join(', ') : 'All approved regions' }), node('span', { text: program.currency }))
    card.append(footer)
    return card
  })
  replaceChildren(document.querySelector('#program-list'), cards.length ? cards : [node('p', { className: 'empty', text: 'No governed programs are visible.' })])
}

function renderCampaigns() {
  const cards = state.campaigns.map((campaign) => {
    const card = node('article', { className: 'card campaign-card' })
    const top = node('div', { className: 'card-topline' })
    top.append(statusPill(campaign.status), node('span', { className: 'rail', text: friendly(campaign.fundingRail) }))
    card.append(top, node('h2', { text: campaign.name }), node('p', { text: campaign.publicSummary }))
    const progress = node('div', { className: 'progress' })
    const bar = node('span')
    bar.style.width = (campaign.budgetMinor ? Math.min(100, (campaign.committedMinor / campaign.budgetMinor) * 100) : 0) + '%'
    progress.append(bar)
    card.append(progress)
    const footer = node('footer')
    footer.append(node('span', { text: money(campaign.committedMinor, campaign.currency) + ' committed' }), node('span', { text: money(campaign.availableMinor, campaign.currency) + ' available' }))
    card.append(footer)
    return card
  })
  replaceChildren(document.querySelector('#campaign-list'), cards.length ? cards : [node('p', { className: 'empty', text: 'No sponsor campaigns yet.' })])

  const brandRows = state.brandVersions.map((brand) => {
    const row = node('div', { className: 'stack-item brand-row' })
    const detail = node('div')
    detail.append(node('strong', { text: brand.displayName + ' · v' + brand.version }), node('span', { text: brand.tagline }), node('small', { text: brand.logoAsset.fileName + ' · ' + Math.ceil(brand.logoAsset.byteSize / 1024) + ' KB' }))
    row.append(node('span', { className: 'brand-thumb', text: brand.displayName.slice(0, 1).toUpperCase() }), detail, statusPill(brand.status))
    return row
  })
  replaceChildren(document.querySelector('#brand-list'), brandRows.length ? brandRows : [node('p', { className: 'empty small-empty', text: 'No brand versions registered.' })])
  replaceChildren(document.querySelector('#campaign-brand'), state.brandVersions.filter((brand) => brand.status === 'APPROVED').map((brand) => {
    const option = node('option', { text: brand.displayName + ' · approved v' + brand.version })
    option.value = brand.brandVersionId
    return option
  }))
}

function directCampaignFor(opportunity) {
  return state.campaigns.find((campaign) => campaign.status === 'ACTIVE' && campaign.fundingRail === 'SPONSORED_DIRECT_GIFT' && campaign.allowedCategories.includes(opportunity.category) && (!campaign.allowedRegions.length || campaign.allowedRegions.includes(opportunity.generalizedRegion)) && campaign.availableMinor >= opportunity.requestedAmountMinor && campaign.perOutcomeCapMinor >= opportunity.requestedAmountMinor)
}

function renderOpportunities() {
  const cards = state.opportunities.map((opportunity) => {
    const card = node('article', { className: 'card opportunity-card' })
    const request = state.sponsoredOutcomes.find((item) => item.publicCaseCode === opportunity.publicCode && ['SUBMITTED_FOR_FEP_REVIEW', 'ACCEPTED_BY_FEP_NO_EFFECT'].includes(item.status))
    const campaign = directCampaignFor(opportunity)
    card.append(node('span', { className: 'tag', text: friendly(opportunity.category) }), node('h2', { text: opportunity.headline }), node('p', { text: opportunity.summary }))
    const facts = node('div', { className: 'opportunity-facts' })
    facts.append(node('span', { text: opportunity.generalizedRegion }), node('strong', { text: money(opportunity.requestedAmountMinor, opportunity.currency) }))
    card.append(facts)
    const button = node('button', { className: request ? 'secondary card-action done' : 'primary card-action', text: request ? friendly(request.status) : campaign ? 'Sponsor this outcome' : 'No eligible campaign' })
    button.type = 'button'
    button.disabled = Boolean(request || !campaign)
    button.addEventListener('click', () => sponsorOutcome(opportunity, campaign))
    card.append(button, node('small', { className: 'privacy-line', text: 'Public case code ' + opportunity.publicCode + ' · identity remains private' }))
    return card
  })
  replaceChildren(document.querySelector('#opportunity-list'), cards.length ? cards : [node('p', { className: 'empty', text: 'No consented, fundable public case codes are visible.' })])
}

function renderSponsoredOutcomes() {
  const rows = state.sponsoredOutcomes.map((request) => {
    const row = node('div', { className: 'stack-item sponsorship-row' })
    const detail = node('div')
    detail.append(node('strong', { text: money(request.amountMinor, request.currency) + ' · ' + request.publicCaseCode }), node('span', { text: 'Campaign ' + request.campaignId }), node('small', { text: 'Private identity withheld · no publicity condition · ' + new Date(request.createdAt).toLocaleString() }))
    row.append(detail, statusPill(request.status))
    return row
  })
  replaceChildren(document.querySelector('#sponsored-list'), rows.length ? rows : [node('p', { className: 'empty', text: 'No specific-outcome requests yet.' })])
}

function renderLedger() {
  const cards = state.supportLedger.map((entry) => {
    const card = node('article', { className: 'ledger-card' })
    const head = node('div', { className: 'ledger-head' })
    const identity = node('div')
    identity.append(node('span', { className: 'notice-kicker', text: entry.publicCaseCode }), node('h2', { text: entry.campaignName }), node('small', { text: new Date(entry.recordedAt).toLocaleString() }))
    head.append(identity, node('strong', { className: 'ledger-amount', text: money(entry.amountMinor, entry.currency) }))
    card.append(head)
    const stateLine = node('div', { className: 'ledger-state' })
    stateLine.append(statusPill(entry.currentState), node('p', { text: entry.receiptAcknowledgement }))
    card.append(stateLine)
    const checks = node('div', { className: 'ledger-checks' })
    entry.validationRequirements.forEach((check) => {
      const row = node('div')
      row.append(node('span', { text: check.label }), statusPill(check.status))
      checks.append(row)
    })
    card.append(checks)
    const footer = node('footer')
    footer.append(node('span', { text: 'Public post: ' + friendly(entry.optionalPublicPosting) }), node('strong', { text: 'Effect mode: ' + friendly(entry.effectMode) }))
    card.append(footer)
    return card
  })
  replaceChildren(document.querySelector('#support-ledger'), cards.length ? cards : [node('p', { className: 'empty', text: 'No support ledger entries yet.' })])
}

function renderPriorityQueue() {
  const cards = state.priorityQueue.map((item) => {
    const card = node('article', { className: 'priority-card' })
    const position = node('span', { className: 'queue-position', text: String(item.queuePosition).padStart(2, '0') })
    const content = node('div', { className: 'priority-content' })
    const top = node('div', { className: 'priority-topline' })
    top.append(statusPill(item.necessityBand), node('span', { text: item.maskedCaseId }), node('span', { text: friendly(item.needCategory) }))
    content.append(top, node('h2', { text: item.needSummary }))
    const facts = node('div', { className: 'priority-facts' })
    facts.append(node('span', { text: item.generalizedRegion }), node('strong', { text: money(item.requestedAmountMinor, item.currency) }), node('span', { text: friendly(item.prioritizationState) }))
    content.append(facts)
    const factors = node('div', { className: 'priority-factors' })
    item.priorityFactors.forEach((factor) => factors.append(node('span', { text: friendly(factor) })))
    content.append(factors)
    const authority = node('footer')
    authority.append(node('span', { text: 'Identity: ' + friendly(item.identityExposure) }), node('span', { text: 'Sultan: ' + friendly(item.sultanRole) }), node('strong', { text: 'Authority: ' + friendly(item.selectionAuthority) }))
    content.append(authority)
    card.append(position, content)
    return card
  })
  replaceChildren(document.querySelector('#priority-queue'), cards.length ? cards : [node('p', { className: 'empty', text: 'No masked cases are available for internal priority review.' })])
}

function renderIntentControls() {
  replaceChildren(document.querySelector('#intent-program'), state.programs.filter((program) => program.status === 'ACTIVE').map((program) => {
    const option = node('option', { text: program.name })
    option.value = program.programId
    return option
  }))
  replaceChildren(document.querySelector('#intent-cohort'), state.cohorts.map((cohort) => {
    const option = node('option', { text: cohort.name + ' (' + cohort.eligibleCount + '+ reviewed)' })
    option.value = cohort.cohortId
    return option
  }))
  replaceChildren(document.querySelector('#intent-list'), state.intents.length ? state.intents.map((intent) => {
    const row = node('div', { className: 'stack-item' })
    const detail = node('div')
    detail.append(node('strong', { text: money(intent.amountMinor, intent.currency) + ' · ' + friendly(intent.targetType) }), node('span', { text: intent.targetRef }), node('small', { text: new Date(intent.createdAt).toLocaleString() }))
    row.append(detail, statusPill(intent.status))
    return row
  }) : [node('p', { className: 'empty small-empty', text: 'No program allocation intents yet.' })])
}

function renderPlatformStatus() {
  if (!state.platformStatus) return
  replaceChildren(document.querySelector('#system-health'), state.platformStatus.systemHealth.map((item) => {
    const card = node('article', { className: 'health-card' })
    card.append(statusPill(item.status), node('h2', { text: item.system }), node('p', { text: item.detail }))
    return card
  }))
  replaceChildren(document.querySelector('#evaluation-list'), state.platformStatus.evaluations.map((item) => {
    const row = node('div', { className: 'evaluation-row' })
    const detail = node('div')
    detail.append(node('strong', { text: item.name }), node('span', { text: item.evidence }))
    row.append(detail, statusPill(item.status))
    return row
  }))
  replaceChildren(document.querySelector('#knowledge-list'), state.platformStatus.knowledge.map((item, index) => {
    const card = node('article', { className: 'knowledge-card' })
    card.append(node('span', { className: 'knowledge-index', text: String(index + 1).padStart(2, '0') }), statusPill(item.state), node('h2', { text: item.title }), node('p', { text: item.summary }))
    return card
  }))
}

function renderSettings() {
  if (!state.settings) return
  const boundary = state.settings.valueBoundary
  const recognition = node('article', { className: 'value-card' })
  recognition.append(node('span', { className: 'notice-kicker', text: 'Recognition only' }), node('h2', { text: boundary.recognition.publicName }), node('p', { text: boundary.recognition.purpose }))
  const recognitionList = node('ul', { className: 'clean-list' })
  ;['No monetary value', 'Not transferable or redeemable', 'Never affects essentials eligibility', 'No right to any future conversion'].forEach((text) => recognitionList.append(node('li', { text })))
  recognition.append(recognitionList)
  const credits = node('article', { className: 'value-card accent-card' })
  credits.append(node('span', { className: 'notice-kicker', text: 'Funded access only' }), node('h2', { text: boundary.essentialsCredits.publicName }), node('p', { text: boundary.essentialsCredits.purpose }))
  const creditList = node('ul', { className: 'clean-list' })
  ;['Issued only against cleared funds or committed fulfillment', 'Used only for approved essentials', 'No P2P transfer, cash-out, or exchange listing', 'Refunds, reversals, and error recovery remain available'].forEach((text) => creditList.append(node('li', { text })))
  credits.append(creditList)
  replaceChildren(document.querySelector('#value-boundary'), [recognition, credits])
  const entries = [
    ['Public app', state.settings.surfaces.publicApp],
    ['Internal operating system', state.settings.surfaces.internalOperatingSystem],
    ['Sponsor workspace', state.settings.surfaces.sponsorWorkspace],
    ['Authority source', state.settings.authoritySource],
    ['Named recipient selection', String(state.settings.namedRecipientSelection)],
    ['Raw evidence access', String(state.settings.rawEvidenceAccess)],
    ['Direct money movement', String(state.settings.directMoneyMovement)],
    ['Production authentication configured', String(state.settings.productionAuthenticationConfigured)],
  ]
  replaceChildren(document.querySelector('#settings-list'), entries.map(([label, value]) => {
    const group = node('div')
    group.append(node('dt', { text: label }), node('dd', { text: value }))
    return group
  }))
}

function render() {
  renderMovementFeed()
  renderOverview()
  renderCampaigns()
  renderPrograms()
  renderOpportunities()
  renderSponsoredOutcomes()
  renderPriorityQueue()
  renderLedger()
  renderIntentControls()
  renderPlatformStatus()
  renderSettings()
}

async function loadMovement() {
  state.movementFeed = await api('/v1/movement-feed?sort=' + encodeURIComponent(state.movementSort))
  renderMovementFeed()
}

async function loadAll() {
  const workspace = document.querySelector('.workspace')
  const globalStatus = document.querySelector('#global-status')
  workspace.setAttribute('aria-busy', 'true')
  globalStatus.classList.remove('error')
  globalStatus.textContent = 'Refreshing Luzione app and FEP projections…'
  try {
    await loadMovement()
    state.programs = await api('/v1/programs')
    const programId = state.programs.find((program) => program.status === 'ACTIVE')?.programId
    const query = programId ? '?programId=' + encodeURIComponent(programId) : ''
    const [overview, cohorts, opportunities, intents, brandVersions, campaigns, sponsoredOutcomes, proofFeed, priorityQueue, supportLedger, platformStatus, settings] = await Promise.all([
      api('/v1/overview'),
      programId ? api('/v1/cohorts' + query) : Promise.resolve([]),
      programId ? api('/v1/opportunities' + query) : Promise.resolve([]),
      api('/v1/allocation-intents'),
      api('/v1/brand-versions'),
      api('/v1/campaigns'),
      api('/v1/sponsored-outcomes'),
      api('/v1/proof-feed'),
      api('/v1/priority-queue' + query),
      api('/v1/support-ledger'),
      api('/v1/platform-status'),
      api('/v1/settings'),
    ])
    Object.assign(state, { overview, cohorts, opportunities, intents, brandVersions, campaigns, sponsoredOutcomes, proofFeed, priorityQueue, supportLedger, platformStatus, settings })
    render()
    globalStatus.textContent = ''
  } catch (error) {
    globalStatus.classList.add('error')
    globalStatus.textContent = 'The public feed may remain available, but internal FEP readback could not load: ' + error.message
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
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        campaignId: campaign.campaignId,
        publicCaseCode: opportunity.publicCode,
        amountMinor: opportunity.requestedAmountMinor,
        rationale: 'Complete this bounded verified outcome.',
        idempotencyKey: 'portal-specific-' + crypto.randomUUID(),
        correlationId: 'portal-specific-' + crypto.randomUUID(),
        acknowledgements: { nonCharitableAcknowledged: true, noRecipientContact: true, noPublicityCondition: true, noCashOutOrExchange: true },
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
      if (selected) candidate.setAttribute('aria-current', 'page')
      else candidate.removeAttribute('aria-current')
    })
    document.querySelectorAll('.view').forEach((view) => {
      const selected = view.id === button.dataset.view
      view.classList.toggle('active', selected)
      view.hidden = !selected
    })
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  })
})

document.querySelectorAll('[data-feed-sort]').forEach((button) => {
  button.addEventListener('click', async () => {
    state.movementSort = button.dataset.feedSort
    document.querySelectorAll('[data-feed-sort]').forEach((candidate) => {
      const selected = candidate === button
      candidate.classList.toggle('active', selected)
      candidate.setAttribute('aria-pressed', String(selected))
    })
    await loadMovement()
  })
})

const composerToggle = document.querySelector('#composer-toggle')
const composerFields = document.querySelector('#composer-fields')
composerToggle.addEventListener('click', () => {
  const open = composerFields.hidden
  composerFields.hidden = !open
  composerToggle.setAttribute('aria-expanded', String(open))
  composerToggle.textContent = open ? 'Close' : 'Create post'
})

document.querySelector('#post-form [name="media"]').addEventListener('change', (event) => {
  state.pendingMediaUrls.forEach((item) => URL.revokeObjectURL(item.url))
  state.pendingMediaUrls = [...event.currentTarget.files].map((file) => ({ file, url: URL.createObjectURL(file) }))
  replaceChildren(document.querySelector('#media-preview'), state.pendingMediaUrls.map(({ file, url }) => {
    const preview = node('div', { className: 'preview-tile' })
    if (file.type.startsWith('video/')) {
      const video = node('video')
      video.src = url
      video.muted = true
      preview.append(video)
    } else {
      const image = node('img')
      image.src = url
      image.alt = ''
      preview.append(image)
    }
    preview.append(node('small', { text: file.name }))
    return preview
  }))
})

document.querySelector('#post-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const status = document.querySelector('#post-status')
  const data = new FormData(form)
  const files = [...form.elements.media.files]
  status.textContent = 'Checking media and publishing the update…'
  try {
    if (!files.length) throw new Error('Choose at least one photo or one video.')
    if (files.length > 10) throw new Error('A slideshow can contain up to 10 photos.')
    const videoFiles = files.filter((file) => file.type.startsWith('video/'))
    if (videoFiles.length && (videoFiles.length !== 1 || files.length !== 1)) throw new Error('Choose either one video or a slideshow of photos.')
    const mediaItems = await Promise.all(files.map(async (file) => ({
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
      sha256: await sha256(file),
      altText: 'Media shared with a Luzione movement update',
    })))
    const post = await api('/v1/movement-posts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        displayName: data.get('displayName'),
        handle: data.get('handle'),
        location: data.get('location'),
        caption: data.get('caption'),
        mediaItems,
        publicCaseCode: String(data.get('publicCaseCode') ?? '').trim() || null,
        publicationConsentVerified: data.get('publicationConsent') === 'on',
        idempotencyKey: 'movement-post-' + crypto.randomUUID(),
      }),
    })
    state.localMedia.set(post.postId, state.pendingMediaUrls)
    state.pendingMediaUrls = []
    form.reset()
    replaceChildren(document.querySelector('#media-preview'), [])
    status.textContent = 'Update published. Media remains a local preview until durable storage is connected.'
    await loadMovement()
  } catch (error) {
    status.textContent = error.message
  }
})

const targetType = document.querySelector('#intent-target-type')
const cohortField = document.querySelector('#cohort-field')
function updateTargetFields() { cohortField.hidden = targetType.value !== 'COHORT' }
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
    await api('/v1/brand-versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      displayName: data.get('displayName'), tagline: data.get('tagline'), logoAsset: { assetId: 'asset-browser-' + crypto.randomUUID(), fileName: file.name, mimeType: file.type, byteSize: file.size, sha256: await sha256(file), altText: data.get('altText') },
    }) })
    form.reset()
    status.textContent = 'Immutable metadata registered for review. The file itself was not uploaded in G0.'
    await loadAll()
  } catch (error) { status.textContent = error.message }
})

document.querySelector('#campaign-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const status = document.querySelector('#campaign-status')
  const data = new FormData(form)
  status.textContent = 'Creating a capped, no-effect campaign draft…'
  try {
    const campaign = await api('/v1/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      brandVersionId: data.get('brandVersionId'), fundingRail: 'SPONSORED_DIRECT_GIFT', name: data.get('name'), publicSummary: data.get('publicSummary'), budgetMinor: Math.round(Number(data.get('budget')) * 100), perOutcomeCapMinor: Math.round(Number(data.get('cap')) * 100), currency: 'USD', allowedCategories: String(data.get('categories')).split(',').map((value) => value.trim()).filter(Boolean), allowedRegions: String(data.get('regions')).split(',').map((value) => value.trim()).filter(Boolean), startsAt: new Date(data.get('startsAt')).toISOString(), endsAt: new Date(data.get('endsAt')).toISOString(), attributionMode: 'SPONSOR_NAME_AND_TAGLINE', acknowledgements: { nonCharitableAcknowledged: data.get('nonCharitable') === 'on', noRecipientContact: data.get('noContact') === 'on', noPublicityCondition: data.get('noPublicity') === 'on', noCashOutOrExchange: data.get('closedLoop') === 'on' },
    }) })
    await api('/v1/campaigns/' + encodeURIComponent(campaign.campaignId) + '/submit', { method: 'POST' })
    form.reset()
    setCampaignDates()
    status.textContent = 'Campaign submitted to FEP review. It cannot fund or publish anything until accepted.'
    await loadAll()
  } catch (error) { status.textContent = error.message }
})

document.querySelector('#intent-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const status = document.querySelector('#form-status')
  const data = new FormData(form)
  const target = data.get('targetType')
  status.textContent = 'Submitting a governed allocation preference…'
  try {
    await api('/v1/allocation-intents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: data.get('programId'), targetType: target, cohortId: target === 'COHORT' ? data.get('cohortId') : undefined, amountMinor: Math.round(Number(data.get('amount')) * 100), rationale: String(data.get('rationale') ?? '').trim() || null, idempotencyKey: 'portal-program-' + crypto.randomUUID(), correlationId: 'portal-program-' + crypto.randomUUID() }) })
    form.reset()
    updateTargetFields()
    status.textContent = 'Intent recorded for FEP review. No money moved.'
    await loadAll()
  } catch (error) { status.textContent = error.message }
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
