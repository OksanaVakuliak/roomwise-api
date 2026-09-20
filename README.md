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
pnpm --filter api start:dev
```

## Scripts

- `pnpm lint` — lint the whole workspace
- `pnpm format` — format the whole workspace
- `pnpm typecheck` — typecheck `apps/api`
- `pnpm test` — run unit tests
- `pnpm build` — build `apps/api`
