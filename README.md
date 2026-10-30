# CEP (M1)

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
- `GET /v1/results/:experimentKey` per-variant exposures, conversions, rate

## Layout

- `packages/sdk` snippet (esbuild -> dist/cep.js, `window.cep`); `src/bucketing.ts` is the pure hash/bucket module
- `apps/server` Hono + node:sqlite (`apps/server/data/cep.db`, seeded on start)
- `apps/demo` static fake SaaS page
