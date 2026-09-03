# Sponsor Outcome Studio v0.1

## Product decision

The first sellable Luzione/FEM product remains a **verified-outcome sponsorship workflow**, not a cryptocurrency. It now feeds a distinct public Luzione movement-media surface: a sponsor configures a campaign, requests an eligible public outcome, and receives FEP-verified completion media if separate consent exists; the public app may distribute that proof only under the separate publication rules.

This repository previews three separated surfaces: the public Luzione app, the sponsor-facing workspace, and the internal FEP operating system. FEP Platform remains the policy, identity, priority, case, appeal, fulfillment, ledger, and final-readback authority.

## Movement-media experience

- The default tab is a continuously growing feed combining verified support projections and clearly labeled voluntary updates.
- Trending is the main feed order; latest and followed-account ordering are available.
- Happy Moments presents a horizontal reel-style strip without copying Instagram naming.
- Posts are tied to public accounts and generalized locations, with captions below an image, slideshow, or video.
- Heart, X-style threaded comments with optional pictures, send, bookmark, and follow are supported. Repost is intentionally absent.
- A voluntary author cannot mark their own update as an FEP-verified outcome.
- Local media selection works in G0, but durable upload, scanning, moderation, and deletion are production gates.

## Internal FEP OS experience

- The platform is visibly labeled internal and not a public-facing website.
- The control room tallies overall impact, daily impact, governance enforcement, and verified receipt counts.
- A masked priority queue shows generalized needs, necessity bands, and policy-safe factors. Sultan is decision support only; FEP-controlled human review retains selection authority.
- The support ledger distinguishes request receipt, validation requirements, current lifecycle state, and optional public posting.
- System health is shown system by system, including simulated passes, disabled effects, and missing durable media.
- Evaluation evidence and a living program-knowledge panel document the current operating model and open gates.

## User journey

1. An organization member registers versioned public brand metadata.
2. FEP approves or rejects that immutable brand version.
3. A planner creates a capped campaign with category, geography, dates, per-outcome cap, attribution choice, and required acknowledgements.
4. FEP approves or rejects the campaign hash.
5. The sponsor may either allocate at program/cohort level or request one direct outcome by opaque public case code.
6. FEP independently checks current availability, policy, funding, conflicts, and fulfillment capacity.
7. FEP projects lifecycle evidence; the portal shows only consented public-safe fields.
8. A confirmed outcome becomes a reusable proof artifact for the sponsor dashboard and future FEM media surfaces.

## Campaign invariants

- Currency must match the organization.
- Campaign duration is positive and at most 366 days.
- Per-outcome cap cannot exceed total budget.
- Categories are required; regions may be bounded or open.
- Direct-gift campaigns require acknowledgement that the transaction is not represented as a charitable contribution, grants no recipient contact, cannot condition help on publicity, and creates no cash-out or exchange right.
- Sponsor-facing financial claims are rejected before the draft is stored.
- All current campaigns use `effectMode: DISABLED`.

## Direct-outcome invariants

- Only an `ACTIVE` `SPONSORED_DIRECT_GIFT` campaign can create the request.
- The case reference is an opaque public code from an FEP projection.
- Category and region must fall within campaign scope.
- Requested value must equal the public amount and remain under the per-outcome cap and uncommitted campaign budget.
- One held request per public code is allowed in the local projection.
- An idempotency key may replay only the exact same request hash.
- FEP disposition is receipt-bound and cannot produce a local money effect.

## Outcome media invariants

- Lifecycle order is exact and cannot jump.
- Amount and currency cannot drift from the public case projection.
- Campaign, public code, and approved brand version are immutable across versions.
- Delivered and confirmed claims require reconciliation.
- Publication requires separate recipient and sponsor consent versions.
- FEP may withdraw an item; historical evidence is retained but the item leaves the current feed.

## Pilot wedge

Use **The First 25 Useful Outcomes** as the operating constraint:

- one category and one launch region;
- one pre-funded, tightly capped sponsor budget;
- one merchant/fulfillment path;
- one outcome definition with evidence requirements;
- one proof template and consent script;
- manual human review at every authoritative step;
- explicit pause triggers for funding, fulfillment, privacy, complaint, or reconciliation failure.

Success is not user registration. It is a small number of outcomes that are funded, fulfilled, reconciled, confirmed, and explainable end to end.

## Not implemented

- live FEP ingestion;
- real asset upload or scanning;
- bank, card, gift-card, merchant, or fulfillment-provider integration;
- production identity or durable organization membership;
- transactional reserve, refund, reversal, settlement, or reconciliation ledger;
- public livestream or podcast publishing;
- durable movement media, moderation, or cross-device post persistence;
- any points or credit issuance;
- blockchain, token, wallet, exchange, or treasury behavior.
