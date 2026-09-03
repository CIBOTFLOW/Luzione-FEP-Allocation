import test from 'node:test'
import assert from 'node:assert/strict'

import { createDemoAllocationService } from '../src/bootstrap.js'

function image(fileName, digestCharacter = 'a') {
  return {
    fileName,
    mimeType: 'image/jpeg',
    byteSize: 120000,
    sha256: digestCharacter.repeat(64),
    altText: 'A public-safe movement update image',
  }
}

function postInput(demo, overrides = {}) {
  return {
    actor: demo.actor,
    sponsorCode: 'LUZIONE',
    displayName: 'Luzione Member',
    handle: 'luzione.member',
    location: 'San Mateo County, California',
    caption: 'A useful community update with no private recipient details.',
    mediaItems: [image('update.jpg')],
    publicCaseCode: null,
    publicationConsentVerified: true,
    idempotencyKey: 'movement-test-' + Math.random(),
    ...overrides,
  }
}

test('movement feed clearly separates verified proof from voluntary community updates', () => {
  const demo = createDemoAllocationService()
  const feed = demo.service.listMovementFeed({ actor: demo.actor, sponsorCode: 'LUZIONE' })
  assert.equal(feed.length, 2)
  const verified = feed.find((post) => post.kind === 'VERIFIED_SUPPORT')
  const voluntary = feed.find((post) => post.kind === 'VOLUNTARY_UPDATE')
  assert.equal(verified.verification.status, 'VERIFIED_OUTCOME')
  assert.equal(verified.publicCaseCode, 'LZN-WORK-001')
  assert.equal(verified.verification.requirements.includes('Masked identity'), true)
  assert.equal(voluntary.verification.status, 'LINKED_VOLUNTARY_UPDATE')
  assert.equal(voluntary.publicCaseCode, 'LZN-WORK-002')
  assert.equal(voluntary.mediaPresentation, 'PHOTO')
})

test('photo slideshows and one-video posts publish with consent and strict media metadata', () => {
  const demo = createDemoAllocationService()
  const slideshow = demo.service.createMovementPost(postInput(demo, {
    mediaItems: [image('first.jpg', 'b'), image('second.jpg', 'c')],
  }))
  assert.equal(slideshow.mediaPresentation, 'SLIDESHOW')
  assert.equal(slideshow.mediaItems.length, 2)
  assert.equal(slideshow.mediaItems.every((item) => item.storageState === 'LOCAL_PREVIEW_ONLY'), true)

  const video = demo.service.createMovementPost(postInput(demo, {
    idempotencyKey: 'movement-video-test',
    mediaItems: [{
      fileName: 'moment.mp4',
      mimeType: 'video/mp4',
      byteSize: 450000,
      sha256: 'd'.repeat(64),
      altText: 'A short public-safe happy moment video',
    }],
  }))
  assert.equal(video.mediaPresentation, 'VIDEO')
})

test('movement posting rejects missing consent, private contact details, and mixed video slideshows', () => {
  const demo = createDemoAllocationService()
  assert.throws(
    () => demo.service.createMovementPost(postInput(demo, { publicationConsentVerified: false })),
    { code: 'PUBLICATION_CONSENT_REQUIRED' },
  )
  assert.throws(
    () => demo.service.createMovementPost(postInput(demo, { caption: 'Contact me at person@example.com' })),
    { code: 'PRIVATE_FIELD_PROHIBITED' },
  )
  assert.throws(
    () => demo.service.createMovementPost(postInput(demo, {
      mediaItems: [image('first.jpg'), {
        fileName: 'moment.mp4', mimeType: 'video/mp4', byteSize: 20, sha256: 'e'.repeat(64), altText: 'Video',
      }],
    })),
    { code: 'MOVEMENT_MEDIA_MIX_INVALID' },
  )
})

test('movement engagement supports follow, like, send, save, and threaded photo comments without repost', () => {
  const demo = createDemoAllocationService()
  const post = demo.service.listMovementFeed({ actor: demo.actor, sponsorCode: 'LUZIONE' })[0]
  for (const action of ['LIKE', 'SEND', 'SAVE', 'FOLLOW']) {
    const result = demo.service.toggleMovementInteraction({
      actor: demo.actor,
      sponsorCode: 'LUZIONE',
      postId: post.postId,
      accountId: action === 'FOLLOW' ? post.account.accountId : undefined,
      action,
    })
    assert.equal(result.active, true)
  }
  assert.throws(
    () => demo.service.toggleMovementInteraction({ actor: demo.actor, sponsorCode: 'LUZIONE', postId: post.postId, action: 'REPOST' }),
    { code: 'MOVEMENT_INTERACTION_INVALID' },
  )
  const root = demo.service.createMovementComment({
    actor: demo.actor,
    sponsorCode: 'LUZIONE',
    postId: post.postId,
    parentCommentId: null,
    displayName: 'Luzione Member',
    handle: 'luzione.member',
    text: 'A respectful public thread.',
    attachment: image('comment.jpg', 'f'),
  })
  const reply = demo.service.createMovementComment({
    actor: demo.actor,
    sponsorCode: 'LUZIONE',
    postId: post.postId,
    parentCommentId: root.commentId,
    displayName: 'Luzione Member',
    handle: 'luzione.member',
    text: 'A reply in the same thread.',
    attachment: null,
  })
  assert.equal(reply.parentCommentId, root.commentId)
  assert.equal(demo.service.listMovementFeed({ actor: demo.actor, sponsorCode: 'LUZIONE' }).find((item) => item.postId === post.postId).comments.some((comment) => comment.attachment), true)
})

test('internal FEP OS exposes support acknowledgement, validation, health, and living program knowledge', () => {
  const demo = createDemoAllocationService()
  const queue = demo.service.getPriorityQueue({ actor: demo.actor, sponsorCode: 'LUZIONE', programId: demo.programId })
  assert.equal(queue.length, 2)
  assert.equal(queue.every((item) => item.identityExposure === 'MASKED'), true)
  assert.equal(queue.every((item) => item.sponsorCanSelectPerson === false), true)
  assert.equal(queue.every((item) => item.sultanRole === 'DECISION_SUPPORT_ONLY'), true)

  const ledger = demo.service.getSupportLedger({ actor: demo.actor, sponsorCode: 'LUZIONE' })
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].effectMode, 'DISABLED')
  assert.equal(ledger[0].optionalPublicPosting, 'PUBLISHED_WITH_SEPARATE_CONSENT')
  assert.equal(ledger[0].validationRequirements.every((requirement) => requirement.status === 'PASS'), true)

  const status = demo.service.getPlatformStatus({ actor: demo.actor, sponsorCode: 'LUZIONE' })
  assert.equal(status.visibility, 'INTERNAL_FEP_OS')
  assert.equal(status.governance.namedRecipientSelection, false)
  assert.equal(status.systemHealth.some((item) => item.system === 'Durable post media' && item.status === 'NOT_CONNECTED'), true)
  assert.equal(status.evaluations.some((item) => item.name === 'B07 deterministic allocation' && item.status === 'PASS'), true)
  assert.equal(status.knowledge.some((item) => item.title === 'Program operating model'), true)
})
