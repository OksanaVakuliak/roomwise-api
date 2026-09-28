# Roomwise API

Backend for Roomwise — a step-by-step renovation cost configurator: catalog,
styles, pricing formulas and coefficients stored in the database, saved
calculations, and an admin panel.

## Stack

- NestJS 11 (Express adapter), TypeScript 5
- PostgreSQL 17 via Prisma 7 (`@prisma/adapter-pg`)
- zod 4 + `nestjs-zod` for validation, `@nestjs/swagger` for OpenAPI
- Cloudinary for image storage
- pnpm workspaces (`apps/api`, `packages/*`)
- Biome 2 for linting and formatting
- Vitest 4 for testing
- lefthook + commitlint for git hooks and Conventional Commits

## Architecture and modules

The application lives in `apps/api/src` as a single NestJS app with modules
kept behind clear boundaries — a module never reads another module's tables
directly, only through its exported service.

- **`config`** — `env.ts` validates all environment variables with zod at
  startup and fails fast with a list of what's missing or invalid.
- **`common/prisma`** — `PrismaService`, a lazily-connecting `PrismaClient`
  wired to `@prisma/adapter-pg`.
- **`common/http`** — the shared error envelope (`{ error: { code, params,
  fields } }`), the exception filter that maps validation and throttling
  errors onto it, and the machine error codes.
- **`common/i18n`** — the `{ en, uk }` localized text schema, language
  resolution from `?lang`, and the check that blocks publishing content
  missing a translation.
- **`common/concurrency`** — optimistic concurrency: every editable entity
  carries a `revision`, and a stale one is rejected with `409
  STALE_REVISION`.
- **`common/pagination`** — the shared `page` / `pageSize` query schema and
  response envelope.
- **`common/throttling`** — the demo-account write and upload limiters
  (`DemoWriteThrottlerGuard`), on top of the global `@nestjs/throttler` rate
  limit.
- **`common/maintenance`** — the maintenance task registry and the
  `POST /internal/maintenance/run` endpoint that the scheduled workflow
  calls (see below).
- **`modules/auth`** — admin login and session handling: bcrypt password
  checks, account lockout after repeated failures, a JWT session id in an
  httpOnly cookie, the global admin guard, and the `@Public` /
  `@DenyDemo` decorators.
- **`modules/catalog`** — the catalog domain, split into sub-modules that
  the `catalog.module.ts` wires together:
  - `public` — the public, read-only catalog API used by the configurator
    (styles, room types, categories, products, engineering, options),
    cached per language for 30 seconds.
  - `room-types`, `categories`, `material-types`, `products`, `styles`,
    `engineering`, `options` — the admin CRUD for each entity, with the
    publish-time checks (translations, images, prices) described in the
    spec.
  - `images` — multipart upload, file-signature validation, and the
    Cloudinary integration.
  - `dataset` — upsert/replace of the demo dataset, shared by the seed
    script and the sandbox reset.
- **`modules/sandbox`** — orchestrates the public demo account: computing
  the next reset time, the daily reset transaction across catalog (and
  later pricing) data, and catching up on a missed reset.
- **`modules/health`** — `GET /api/v1/health`, always `200`, used as the
  Render health check and to detect whether the database has woken up.

## Scripts

Run from the repository root unless noted.

| Command | Description |
| --- | --- |
| `pnpm lint` | Biome check across the workspace |
| `pnpm format` | Biome check with `--write` across the workspace |
| `pnpm typecheck` | Typecheck `apps/api` |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm build` | Build `apps/api` |
| `pnpm --filter api test:e2e` | Run end-to-end tests against Postgres |
| `pnpm --filter api start:dev` | Run the API with hot reload |
| `pnpm --filter api start:prod` | Run the built app (`dist/main.js`) |
| `pnpm --filter api prisma:generate` | Generate the Prisma client |
| `pnpm --filter api prisma:migrate` | Create/apply a dev migration |
| `pnpm --filter api exec prisma migrate deploy --config prisma.config.ts` | Apply pending migrations without creating new ones (used in CI and deploys) |
| `pnpm --filter api db:seed` | Upsert the demo dataset (idempotent) |
| `pnpm --filter api seed:images` | Upload demo dataset images to Cloudinary |
| `pnpm --filter api admin:create --login <login>` | Create an administrator (password read from stdin) |
| `pnpm --filter api sandbox:due` | Make the sandbox reset due now, for local verification |
| `pnpm --filter api openapi:generate` | Regenerate `apps/api/openapi.json` |
| `pnpm --filter api openapi:check` | Fail if `openapi.json` is out of date |

`sandbox:due` only runs against a local `DATABASE_URL` (it refuses anything
else) and won't be picked up by an already-running server until it's
restarted, since the sandbox schedule caches `nextResetAt` in memory.

## Environment variables

Validated by `apps/api/src/config/env.ts` at startup; the process exits with
a list of missing or invalid variables if validation fails. `.env.example`
lists every key without values.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `DATABASE_URL` | Yes | — | Pooled PostgreSQL connection string, used at runtime |
| `DIRECT_URL` | Yes | — | Direct (non-pooled) PostgreSQL connection string, used by Prisma CLI/migrations |
| `JWT_SECRET` | Yes | — | Secret for signing admin session JWTs, at least 32 characters |
| `CORS_ORIGIN` | Yes | — | Comma-separated list of allowed origins |
| `CLOUDINARY_URL` | Yes | — | Cloudinary URL (`cloudinary://key:secret@cloud_name`) for image storage |
| `SENTRY_DSN` | No | — (disabled) | Sentry DSN; error tracking is off when unset |
| `MAINTENANCE_TOKEN` | Yes | — | Shared secret for `POST /internal/maintenance/run`, at least 32 characters |
| `DEMO_ADMIN_LOGIN` | Yes | — | Login for the public sandbox demo admin account |
| `DEMO_ADMIN_PASSWORD` | Yes | — | Password for the demo admin account, at least 12 characters |
| `SANDBOX_RESET_TIME` | Yes | — | Daily sandbox reset time, `HH:mm` |
| `SANDBOX_TIMEZONE` | Yes | — | IANA timezone the reset time is interpreted in |
| `PORT` | No | `3000` | Port the HTTP server listens on |
| `TRUST_PROXY_HOPS` | No | `1` | Number of trusted reverse-proxy hops in front of the app (affects `X-Forwarded-For` parsing) |

## Local setup

```bash
pnpm install
docker compose up -d
```

Copy `apps/api/.env.example` to `apps/api/.env` and fill it in. To match
`docker-compose.yml`, use:

```
DATABASE_URL=postgresql://roomwise:roomwise@localhost:5432/roomwise
DIRECT_URL=postgresql://roomwise:roomwise@localhost:5432/roomwise
```

Then:

```bash
pnpm --filter api prisma:generate
pnpm --filter api exec prisma migrate deploy --config prisma.config.ts
pnpm --filter api db:seed
pnpm --filter api admin:create --login owner
pnpm --filter api start:dev
```

`admin:create` reads the password from stdin. Administrators are created
only this way; the API has no public registration.

The app runs at `http://localhost:3000` (or your `PORT`), under the
`/api/v1` prefix.

### Tests

Unit tests run against mocked dependencies:

```bash
pnpm test
```

End-to-end tests run against a real Postgres database whose name must end
with `_test` — this is enforced so a misconfigured `DATABASE_URL` can never
point end-to-end tests at real data:

```bash
docker compose exec postgres createdb -U roomwise roomwise_test
DATABASE_URL=postgresql://roomwise:roomwise@localhost:5432/roomwise_test \
DIRECT_URL=postgresql://roomwise:roomwise@localhost:5432/roomwise_test \
pnpm --filter api test:e2e
```

## OpenAPI

The OpenAPI document is generated from the same zod schemas used for
request/response validation and is committed at `apps/api/openapi.json`; CI
fails if it's out of date (`pnpm --filter api openapi:check`). Regenerate it
with `pnpm --filter api openapi:generate` after changing any DTO.

Interactive docs are served at `/api/docs` (Swagger UI) — outside of
`NODE_ENV=production`, where the docs route is not mounted at all.

## Deployment

### Render

`render.yaml` at the repository root defines a single free web service
(`runtime: node`). The build step installs dependencies, generates the
Prisma client, builds the app, and applies pending migrations before the
new version goes live:

```
pnpm install --frozen-lockfile --prod=false
pnpm --filter api prisma:generate
pnpm --filter api build
pnpm --filter api exec prisma migrate deploy --config prisma.config.ts
```

`--prod=false` is required: Render sets `NODE_ENV=production` for the build
too, and pnpm treats that as an implicit `--prod` unless overridden, which
would skip `devDependencies` — and `@nestjs/cli`, `prisma`, and `typescript`
(needed to build and migrate) are all devDependencies of `apps/api`.

The start command runs the built app (`pnpm --filter api run start:prod`,
i.e. `node dist/main.js`), and `healthCheckPath` is `/api/v1/health`. Auto
deploy watches the `main` branch — `develop` is where day-to-day work
happens; only what's merged into `main` (a release) gets deployed.

Render assigns its own `PORT` and the app already reads it from the
environment, so `PORT` isn't set in `render.yaml`. Secrets and
environment-specific values are declared with `sync: false` and filled in
once in the Render dashboard, never committed.

The pinned pnpm version (`packageManager` in the root `package.json`) is
expected to be picked up by Render automatically from that field together
with `pnpm-lock.yaml`, the same way it already resolves the Node version
from `.nvmrc`/`engines`. This should be confirmed on the first deploy build
log; if the wrong pnpm version is used, avoid reflexively adding `corepack
enable` to the build command — Render's Node image ships pnpm at a fixed,
read-only path, and `corepack enable` trying to replace it is a known
source of build failures on Render.

`TRUST_PROXY_HOPS` is set to `2` in `render.yaml` — the real proxy chain is
browser → Vercel rewrite → Render. Verify the hop count by inspecting the
`X-Forwarded-For` header after the first real deploy and adjust the value if
it doesn't match.

### Database: Neon

PostgreSQL runs on Neon, with separate branches for `dev` and `prod`.
`DATABASE_URL` is the pooled connection string (used at runtime),
`DIRECT_URL` is the direct one (used by Prisma CLI for migrations).

### First deploy

The Render build only runs migrations — it doesn't seed data, since
`tsx` (used to run the seed and admin-creation scripts) is a
devDependency, not something the running service needs. After the first
deploy, run once from a local checkout with the Neon `prod` branch's
`DATABASE_URL`/`DIRECT_URL` (plus `CLOUDINARY_URL`, `DEMO_ADMIN_LOGIN`,
`DEMO_ADMIN_PASSWORD`) set to the production values:

```bash
pnpm --filter api db:seed
pnpm --filter api seed:images
pnpm --filter api admin:create --login owner
```

### Scheduled maintenance

Render's free plan sleeps the service after 15 minutes of inactivity, so an
in-process scheduler wouldn't fire reliably. Instead,
`.github/workflows/maintenance.yml` runs on a daily schedule (and can be
triggered manually) and calls `POST /api/v1/internal/maintenance/run`,
which wakes the service and runs any due maintenance task (currently, the
sandbox reset). It needs:

- a repository secret `MAINTENANCE_TOKEN`, matching the value configured on
  the Render service;
- a repository variable `API_URL`, the deployed API's base URL.

## Sandbox demo access

The admin panel is browsable with a public demo account so portfolio
visitors can try it without asking for credentials. The login and password
come from `DEMO_ADMIN_LOGIN` / `DEMO_ADMIN_PASSWORD`.

The demo account has full write access to the catalog, but with limits:
**60 writes and 10 image uploads per hour**. Every day at `SANDBOX_RESET_TIME`
(in the `SANDBOX_TIMEZONE` timezone), the catalog is atomically reset back
to the seed dataset — any changes made by demo visitors are discarded.
Administrator accounts and sessions are never touched by a reset, and
neither are saved calculations or leads (spec `003`).

The demo account cannot change its own password or manage other
administrators — both are rejected with `403 DEMO_FORBIDDEN`.

Image credits for the seed dataset are listed in
[`apps/api/prisma/seed/ASSETS.md`](apps/api/prisma/seed/ASSETS.md).
