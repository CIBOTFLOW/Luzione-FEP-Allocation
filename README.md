# Luzione FEP Allocation v0.5.0

Company-facing allocation experience for `fep.luzione.com`.

Companies can:

- configure approved funding programs;
- select reviewed broad cohorts;
- browse consented public-safe case cards;
- create allocation intents from their available FEP allocation;
- receive aggregate impact reporting.

Companies cannot:

- inspect raw applications, medical records, evidence, addresses, or contact details;
- approve or deny support cases;
- move FEP funds directly;
- condition support on publicity or positive statements.

This branch now contains a production-shaped Next.js sponsor portal backed by a no-effect mock FEP adapter. FEP Platform remains authoritative.

## Run

```bash
npm install
npm test
npm run check
npm run build
npm start
```

The portal is intentionally `NO_EFFECT` until live legal, accounting, privacy, access-policy, and FEP authorization is complete.

## Routes

- `/dashboard` sponsor overview, allocation balance, active programs, and recent workspace posture.
- `/programs` and `/programs/[programId]` approved program restrictions and detail.
- `/opportunities` consented public-safe case cards.
- `/cohorts` reviewed broad cohort selector.
- `/intents/new` allocation-intent creation flow.
- `/intents/[intentId]` intent status and FEP disposition timeline.
- `/reports` minimum-cohort aggregate impact reporting.
- `/audit` sponsor-visible audit and JSON export.

## API Facade

- `GET /api/sponsor/me`
- `GET /api/programs`
- `GET /api/programs/:programId/allocation`
- `GET /api/cohorts?programId=...`
- `GET /api/opportunities?programId=...&cohortId=...`
- `POST /api/allocation-intents`
- `GET /api/allocation-intents`
- `GET /api/allocation-intents/:intentId`
- `GET /api/reports?programId=...`
- `GET /api/audit`

Compatibility endpoints remain covered:

- `GET /health`
- `GET /v1/opportunities`
- `POST /v1/allocation-intents`
