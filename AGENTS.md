# AGENTS.md — Mahakam

Sistem Informasi Keuangan multi-tenant (SaaS akuntansi + invoice) untuk bisnis Indonesia.
Repo: `github.com/dedysutanto/mahakam`. Deploy: `https://app.ptosb.com` (web) / `https://m.app.ptosb.com` (mobile).

## Tech stack

| Layer | Tech |
|-------|------|
| Backend | Fastify 5, Prisma 6, PostgreSQL 16 (`backend/`) |
| Frontend | React 19, Vite 6, TailwindCSS 3 (`frontend/`) |
| Auth | JWT (`@fastify/jwt`), API key (`Bearer mk_live_…`), bcryptjs |
| Deploy | Docker Compose + Swarm (`docker-compose.yml`, `deploy/swarm-stack.yml`), GitHub Container Registry |
| Docs | `SPEC.md` at repo root (SDD spec: §G/§C/§I/§V/§T/§B) |

## Layout

- `backend/src/` — Fastify app: `server.ts` (version constant, OpenAPI, error handler), `middleware/auth.ts` (authHook, validateTenantHook, requireScope, assertAdminUser), `modules/<module>/<module>.routes.ts` per domain (invoice, expense, ledger, tenant, superadmin, …), `utils/` (numbering, pdf, tax).
- `backend/prisma/schema.prisma` — DB models; `scopes String[]` on `TenantUser` and `ApiKey`.
- `frontend/src/` — `lib/AuthContext.tsx` (roles/scopes), `pages/` (Expenses.tsx, Invoices.tsx, …), `components/`, `config.ts` (`APP_VERSION`).
- `docker-compose.yml` + `deploy/swarm-stack.yml` — image tags `ghcr.io/dedysutanto/mahakam-{backend,frontend}:${APP_VERSION:-vX.Y.Z}`.

## Auth & scopes (critical)

- Roles: `owner`, `admin`, `member` (staff). Super Admin = `isSuperAdmin` on User.
- Per-menu scopes on `TenantUser.scopes`/`ApiKey.scopes`: `buku-besar, faktur, penawaran, pembelian, pengeluaran, produk, pelanggan, pajak, laporan, pengaturan`. Owner/admin = implicit ALL scopes; staff/API keys need explicit scopes. **API keys never get the admin bypass** (`requireScope` checks `userId === 'api-key'` before role).
- Backend enforces scope per route (`requireScope`); never trust the client (V8). Financial-read endpoints and all writes are scope-gated; reference-data reads (products, customers, taxes, settings GET) need only auth — cross-module forms depend on them (V31).
- **Datalist endpoints must be reachable under the form's own write scope** — e.g. expense form reads accounts from `GET /api/expenses/ledgers` (scope `pengeluaran`), never `GET /api/ledgers` (scope `buku-besar`) (V47, B40).

## Workflow

- SDD: bugs → backprop to `SPEC.md` (§B entry + §V invariant when the class can recur + §T task when user-visible) before/with the code fix.
- UI/text: Bahasa Indonesia primary (match forms/messages).
- Money: formatted Rp Indonesian grouping (V7); amounts stored numeric.
- `OPTIONAL` default pattern for scope arrays: `scopes String[] @default([])`.

## Build & run

```bash
# backend (Docker uses esbuild — `npm run build` (tsc) has pre-existing errors unrelated to Docker)
cd backend && npm run dev          # tsx watch src/server.ts
npm run prisma:generate && npm run prisma:migrate

# frontend
cd frontend && npm run dev         # vite
npm run build                      # vite build → dist/
```

## Deploy

```bash
# version bump FIRST (match everywhere): backend/src/server.ts, frontend/src/config.ts,
# docker-compose.yml, deploy/swarm-stack.yml — then:
docker build -t ghcr.io/dedysutanto/mahakam-backend:vX.Y.Z backend/
docker build -t ghcr.io/dedysutanto/mahakam-frontend:vX.Y.Z frontend/
docker tag ghcr.io/dedysutanto/mahakam-{backend,frontend}:vX.Y.Z ghcr.io/dedysutanto/mahakam-{backend,frontend}:latest
docker push ghcr.io/dedysutanto/mahakam-backend:vX.Y.Z && docker push ghcr.io/dedysutanto/mahakam-backend:latest
docker push ghcr.io/dedysutanto/mahakam-frontend:vX.Y.Z && docker push ghcr.io/dedysutanto/mahakam-frontend:latest
# server: update APP_VERSION in stack .env, `docker stack deploy` (swarm) or `docker compose pull && up -d`
```

Release cadence: patch versions only (`v1.3.x`). Each release bumps `APP_VERSION` in the four files above plus a SPEC §T row.