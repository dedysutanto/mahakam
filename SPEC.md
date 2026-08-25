# SPEC — accounting & invoice SASS

## §G — goal

Full accounting + invoicing SASS, Bahasa Indonesia primary, mobile-first **Flutter Web** frontend (replace React PWA, feature-parity on iPhone Safari + Android Chrome), FastAPI backend, SQLite start migrate to MySQL/PostgreSQL, Docker Swarm deploy. Multi-tenant: data isolated per company.

## §C — constraints

- Language: Bahasa Indonesia primary, English optional (i18n toggle).
- Mobile-first: Flutter Web, touch-friendly, opens in mobile browsers. Flutter Web only — no native iOS/Android store builds, no push.
- Backend: Python FastAPI (`backend/app`), unchanged by frontend migration. Frontend: Flutter (Dart), plain `http` package + `setState` (no state-mgmt lib).
- React `frontend/` fully replaced — no fallback kept. ? keep or delete React dir at end.
- DB: SQLite default, Alembic migrations to MySQL/PostgreSQL (verified on postgres:15).
- Auth: API Key header `X-API-Key`, bcrypt-hashed. Prefixes: `ak_live_` (system scope) / `ak_comp_` (company scope). Company Admin creates keys for company users.
- CORS enabled on backend, restricted to configured origins (Flutter web may serve separately from API).
- PDF: signed short-lived token endpoint for direct open in iPhone Safari (browser can't send `X-API-Key` on plain navigation). No key in URL.
- Multi-tenant: shared infra, `company_id` on all tenant tables. Roles: `administrator` (system), `company_admin`, `invoice_po_user`, `expense_report_user`. Admin adds/edits roles (`/api/roles`), built-ins protected.
- User username = email, `UNIQUE(email, company_id)`. Company Admin creates users for own company; cannot assign `administrator`.
- Products (`items`), clients (`clients`): standalone catalogs. Invoice/PO lines reference catalog; new names auto-created on save (frontend).
- Tax: PPN 11% default from CompanySettings; multi-tax per line `taxes[]`; tax-exempt flag per invoice.
- Invoice status: draft → sent_unpaid → paid; sent_unpaid → past_due auto when due passed; any → draft revert; 422 otherwise. PO: draft → sent → received → closed, cancel → draft.
- Auto invoice/PO number from Settings pattern (`{YYYY}{MM}{DD}-{SEQ}` etc.); per-company sequence counter in `company_settings`.
- Amounts: Rp, Indonesian grouping (frontend `formatIDR`); floats rounded 2dp server-side.
- Activity log: every mutating action logged (append-only), company-scoped; users see own via `/api/dashboard/my-activity`; admin all via `/api/activity-logs`.
- Invoice PDF via reportlab: company header (logo/name/address), client block, line table, subtotal/tax/total. Flutter web opens via signed URL in new tab, not blob.
- Telegram notifications on invoice status → sent/past-due/paid; settings-gated + test endpoint.
- Deploy: Docker Swarm, separate images backend/frontend/database (postgres:15). File-backed secrets (`*_FILE`), healthchecks, nginx serves Flutter web build + proxies `/api` → backend.
- Two-tier admin (approved 2026-08-24): `isSuperAdmin` flag on User → hidden "Admin Sistem" area. Super Admin creates Companies (reusing registration seeding: default ledgers + PPN 11%) and assigns each company's admin — a NEW user (nama/email/password) or an EXISTING user.
- Per-menu scopes on TenantUser (`scopes String[]`): buku-besar, faktur, penawaran, pembelian, pengeluaran, produk, pelanggan, pajak, laporan, pengaturan. Role owner/admin = implicit ALL scopes. Staff users get explicit scope picks; backend enforces per route module; frontend hides menus without scope.
- Company admin cannot edit/delete the company's last active admin. No impersonation in v1.
- Out of scope: complex tax engine (basic rates only), AP three-way matching/approvals/SLA, blockchain/crypto.

## §I — interfaces

REST API under `/api`, auth via `X-API-Key` (401 missing, 403 invalid/inactive/expired):
- `POST/GET/PUT/DELETE /api/invoices`, `GET /api/invoices/{id}`, `GET /api/invoices/{id}/pdf`, `POST /api/invoices/{id}/status`
  - create/edit body: `client_id`, `issue_date`, `due_date`, `tax_exempt`, `lines[]` (`item_id`, `name`, `quantity`, `unit_price`, `taxes[]`)
- `POST /api/invoices/{id}/pdf-token` → short-lived signed PDF URL (`/pdf?token=...`), for browser direct open (new)
- CORS middleware: allow configured `CORS_ORIGINS` env (new)
- `POST/GET/PUT/DELETE /api/items`, `/api/clients` (catalogs, company-scoped)
- `POST/GET/PUT/DELETE /api/purchase-orders`, `POST /api/purchase-orders/{id}/status`
- `POST/GET/PUT/DELETE /api/expenses`
- `GET /api/reports/invoices?client_id&month&year&export=csv`, `/aging`, `/expenses`, `/revenue`, `/tax`, `/po`
- `GET /api/dashboard/stats`, `GET /api/dashboard/my-activity?limit`
- `GET/PUT /api/settings/company`, `POST /api/settings/logo` (multipart), `GET/PUT /api/settings/taxes`
- `GET /api/activity-logs` (admin)
- `POST /api/admin/keys`, `GET/DELETE /api/admin/keys/{id}`, `POST/GET/DELETE /api/companies/{id}/keys[/{key_id}]`
- `POST/GET /api/admin/companies`, `POST /api/admin/users`, `POST /api/companies/{id}/users`
- SuperAdmin: `GET /api/superadmin/tenants`, `POST /api/superadmin/tenants` (create company + seed + assign admin new/existing)
- Members (company admin): `GET /api/tenants/{id}/members`, `POST /api/tenants/{id}/members` (staff + scopes), `PUT /api/tenants/{id}/members/{userId}` (scopes/isActive)
- `POST/GET /api/roles`, `PUT/DELETE /api/roles/{name}`
- `POST /api/telegram/test`
- `GET /health` (public)

Env vars: `DATABASE_URL`, `SECRET_KEY`/`SECRET_KEY_FILE`, `TAX_RATE_DEFAULT`, `TAX_NAME_DEFAULT`, `TELEGRAM_BOT_TOKEN(_FILE)`, `TELEGRAM_CHAT_ID(_FILE)`, `BCRYPT_ROUNDS`, `UPLOAD_DIR`.

Docker Swarm services: `backend` (:8000), `frontend` (nginx :80), `database` (postgres:15). Overlay net, secrets via swarm, healthchecks on all.

PWA: `vite-plugin-pwa` manifest (`lang: id`) + workbox SW; dev proxy `/api` → :8000.

Models (`backend/app/models`): companies, users, roles, api_keys, clients, items, invoices+invoice_items, purchase_orders+po_items, expenses, tax_rates, company_settings, activity_logs.

Frontend pages (`frontend/src/pages`): Login, Dashboard, Invoices, PurchaseOrders, Expenses, Items, Clients, Reports, Settings, Admin.

## §V — invariants

- V1: every `/api` request without valid `X-API-Key` → 401; invalid/inactive/expired → 403.
- V2: every tenant query filtered by `company_id` from key context; system admin bypass only with explicit company selection.
- V3: API Key plaintext returned once at creation, then stored bcrypt-hashed only.
- V4: invoice/PO number auto-generated from Settings pattern; placeholder required else default fallback; per-company seq counter never reused.
- V5: invoice status transitions Draft→Sent/Unpaid→Paid, auto Past Due on due date; any →Draft revert; else 422. Past Due→Paid allowed.
- V6: default PPN 11% from settings; per-line `taxes[]`; total = subtotal + Σ tax; tax-exempt sets taxes `[]`.
- V7: money rounded 2dp server-side; displayed `Rp` Indonesian grouping.
- V8: every mutating endpoint appends activity log (company_id, api_key_id, role-at-time, action, resource, details, timestamp); append-only.
- V9: role/permission enforced server-side per endpoint, never client-trusted.
- V10: Alembic-only migrations; SQLite↔PostgreSQL verified; seeds 4 default roles + PPN 11%.
- V11: Company Admin restricted to own `company_id`; cannot assign `administrator`; cannot manage other companies' users/keys.
- V12: Docker Swarm services reachable by service name; secrets via files, not committed.
- V13: PO status Draft→Sent→Received→Closed, cancel any stage; distinct from V5.
- V14: paid invoices not editable (422); edit allowed otherwise.
- V15: every `/api` call from Flutter web sends `X-API-Key` header; key stored in browser localStorage only, never in URL.
- V16: PDF token single-use, short-lived (≤5 min), scope-bound to invoice id + company; `GET /api/invoices/{id}/pdf` requires either valid API Key header OR valid token.
- V17: CORS allows only configured `CORS_ORIGINS`; never `*` with credentials.

## §T — tasks (all x, Flutter migration pending)

| id | status | task | cites |
|----|--------|------|-------|
| T1 | x | scaffold repo: backend/, frontend/, docker/, docker-compose, .env.example | V10,V12 |
| T2 | x | FastAPI skeleton + config (env, SQLAlchemy, Alembic) | V10 |
| T3 | x | DB models (14 tables) | V1,V2,V10 |
| T4 | x | API Key auth + role/permission deps | V1,V9 |
| T5 | x | company + user CRUD (email username, company admin creates users) | V2,V11 |
| T6 | x | API Key create/list/revoke (system any company, company admin own) | V1,V3,V11 |
| T7 | x | items catalog CRUD | V2,V7 |
| T8 | x | invoice CRUD + lines + auto number + status | V4,V5,V7,V14 |
| T9 | x | tax engine: PPN default, multi-tax, exempt | V6,V7 |
| T10 | x | purchase order CRUD + status | V13,V7 |
| T11 | x | expense CRUD | V7 |
| T12 | x | reports + CSV export | V7 |
| S1 | [ ] | schema: User.isSuperAdmin + TenantUser.scopes[] migration | C-two-tier |
| S2 | [ ] | requireScope hook + apply to 10 route modules; login/register carry scopes+isSuperAdmin | C-two-tier |
| S3 | [ ] | superadmin routes: list tenants, create tenant + seed + assign admin | C-two-tier |
| S4 | [ ] | member mgmt endpoints (list/create staff w/scopes, update) + last-admin guard | C-two-tier |
| S5 | [ ] | seed script: bootstrap first super admin via env | C-two-tier |
| S6 | [ ] | frontend: scope-aware nav hiding + /admin-sistem page + Pengaturan Pengguna section | C-two-tier |
| T13 | x | activity log + dashboard activity | V8 |
| T14 | x | Telegram notifications + test | V8,V9 |
| T15 | x | company settings + logo + tax config | V4,V6 |
| T16 | x | frontend PWA scaffold + i18n (legacy React — replaced by T24+) | V7 |
| T17 | x | dashboard (stats, recent invoices, quick actions, activity) | V7,V8 |
| T18 | x | invoice/PO/expense/product/client CRUD UI + tax + status + PDF view/download | V5,V6,V7 |
| T19 | x | reports UI | V7 |
| T20 | x | admin UI (roles, keys, companies) + roles router | V9,V11 |
| T21 | x | Dockerfiles + swarm stack + secrets + healthchecks | V12 |
| T22 | x | Alembic SQLite→PostgreSQL + seed roles/PPN | V10 |
| T23 | x | tests: auth, RBAC, isolation, status, tax, money, clients, PDF | V1,V2,V5,V6,V9,V7 |
| T24 | x | backend: PDF token endpoint + CORS middleware + CORS_ORIGINS env | V16,V17 |
| T25 | x | Flutter scaffold: project, http client w/ X-API-Key, i18n (id/en), theming | V15,V17 |
| T26 | x | Flutter login + dashboard (stats, recent, quick actions, activity) | V15,V7,V8 |
| T27 | x | Flutter invoice list/create/edit/delete + status + PDF open (signed URL) | V5,V15,V16 |
| T28 | x | Flutter PO + expense CRUD + status | V13,V7 |
| T29 | x | Flutter product + client catalogs (type, search, on-the-fly create) | V7 |
| T30 | x | Flutter reports + settings + admin UI | V7,V9,V11 |
| T31 | x | nginx serve Flutter web build + proxy /api; docker image | V12,V17 |
| T32 | x | remove legacy React frontend; final build + test on iPhone Safari + Android Chrome | V15,V16 |

## §B — bugs

| id | date | cause | fix |
|----|------|-------|-----|
| B1 | 2026-08-21 | import order: `routers.settings` module shadowed config `settings` in main → /health 500 | alias `from .config import settings as app_settings` (V10) |
| B2 | 2026-08-21 | bcrypt default cost → pytest suite slow (25s→1.5s) | `BCRYPT_ROUNDS` env, tests set 4 |