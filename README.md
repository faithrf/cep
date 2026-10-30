# CEP (M2)

In-app experiences + A/B testing. Local only, SQLite, no external services.

## Run

    npm install
    npm test        # hash vectors, bucketing split, results query
    npm run dev     # builds the SDK, serves http://localhost:4000

Open http://localhost:4000 (demo "TaskFlow"). "Switch user" re-buckets with a new id.
Clear localStorage to see the modal again (shown once per user).

## API

- `GET /v1/config/:envKey` running experiments + variants + flows
- `POST /v1/events` `{ "events": [...] }` (JSON, up to 100)
- `GET /v1/results/:experimentKey` counts + Bayesian stats (P(beat control), P(best), lift CI, expected loss), SRM check, verdict
- `GET /v1/experiments` list
- `GET /dashboard` results page (auto-refresh 5s)

## Layout

- `packages/sdk` snippet (esbuild -> dist/cep.js, `window.cep`); `src/bucketing.ts` is the pure hash/bucket module
- `apps/server` Hono + node:sqlite (`apps/server/data/cep.db`, seeded on start)
- `packages/stats` pure TS (seeded PRNG, beta sampler, Bayesian analysis, SRM chi-square, verdict); no deps

Variants bucket in `position` order (control=0). DB schema version via `PRAGMA user_version`; v0 (M1) DBs are migrated with ALTER TABLE + backfill.
- `apps/demo` static fake SaaS page
