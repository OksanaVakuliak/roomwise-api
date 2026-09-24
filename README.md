# Roomwise API

Backend for Roomwise — a step-by-step renovation cost configurator: catalog,
styles, pricing formulas and coefficients stored in the database, saved
calculations, and an admin panel.

## Stack

- NestJS 11 (Express adapter), TypeScript 5
- PostgreSQL 17 via Prisma
- pnpm workspaces (`apps/api`, `packages/*`)
- Biome 2 for linting and formatting
- Vitest 4 for testing
- lefthook + commitlint for git hooks and Conventional Commits

## Getting started

```bash
pnpm install
docker compose up -d
```

Copy `apps/api/.env.example` to `apps/api/.env` and set
`DATABASE_URL=postgresql://roomwise:roomwise@localhost:5432/roomwise` to match
`docker-compose.yml`.

```bash
pnpm --filter api exec prisma migrate deploy --config prisma.config.ts
pnpm --filter api admin:create --login owner
pnpm --filter api start:dev
```

`admin:create` reads the password from stdin. Administrators are created only
this way; the API has no registration.

End-to-end tests run against a separate database whose name must end with
`_test`:

```bash
docker compose exec postgres createdb -U roomwise roomwise_test
pnpm --filter api test:e2e
```

## Scripts

- `pnpm lint` — lint the whole workspace
- `pnpm format` — format the whole workspace
- `pnpm typecheck` — typecheck `apps/api`
- `pnpm test` — run unit tests
- `pnpm --filter api test:e2e` — run end-to-end tests
- `pnpm build` — build `apps/api`
