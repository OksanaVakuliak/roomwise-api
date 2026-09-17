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
pnpm --filter api exec cp .env.example .env
pnpm --filter api start:dev
```

## Scripts

- `pnpm lint` — lint the whole workspace
- `pnpm format` — format the whole workspace
- `pnpm typecheck` — typecheck `apps/api`
- `pnpm test` — run unit tests
- `pnpm build` — build `apps/api`
