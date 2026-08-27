# SPEC — Mahakam Sistem Keuangan

## §G — goal

Multi-tenant accounting & invoice SaaS, Bahasa Indonesia primary, mobile-first React SPA frontend, Fastify 5 backend, PostgreSQL, Docker Swarm deploy. Data isolated per company.

## §C — constraints

- Language: Bahasa Indonesia primary.
- Mobile-first: React 19 + Vite 6 + TailwindCSS 3, touch-friendly, responsive.
- Backend: Fastify 5 (Node.js ESM), Prisma 6 ORM, PostgreSQL 16.
- Auth: JWT (`@fastify/jwt`) + API key (`Bearer mk_live_...`). Two-tier: Super Admin + Company Admin/Staff.
- API keys: bcrypt-hashed, format `mk_live_<20 hex>`, per-module scopes, optional expiry (30d/90d/180d/1y/never). Admin-only CRUD. Shown once on creation.
- PDF: PDFKit for invoices, quotations, recap billing statements. Direct download, no signed tokens.
- Multi-tenant: shared infra, `tenantId` on all business tables. Roles: `owner`, `admin`, `member`. Super Admin (`isSuperAdmin`) manages tenants.
- Per-menu scopes on TenantUser/ApiKey (`scopes String[]`): buku-besar, faktur, penawaran, pembelian, pengeluaran, produk, pelanggan, pajak, laporan, pengaturan. Owner/admin = implicit ALL scopes. Staff/API keys must have explicit scopes; backend enforces per route module; frontend hides menus without scope.
- Company admin cannot edit/delete the company's last active admin.
- Deploy: Docker (standalone compose + swarm stack), postgres:16-alpine, nginx for frontend.
- Out of scope: complex tax engine (basic rates only), AP three-way matching/approvals/SLA, blockchain/crypto.

## §I — interfaces

REST API under `/api`, auth via JWT Bearer token or API key Bearer token (401 missing, 403 invalid):
- `POST /api/auth/login` → `{ token, user }`, `GET /api/auth/me` → user profile, `GET /api/auth/api-key/info` → tenant/scope info
- `POST/GET/PUT/DELETE /api/invoices`, `GET /api/invoices/{id}`, `GET /api/invoices/{id}/pdf`, `PUT /api/invoices/{id}/status`, `POST /api/invoices/{id}/payments`, `POST /api/invoices/recap`
- `POST/GET/PUT/DELETE /api/quotations`, `POST /api/quotations/{id}/convert`
- `POST/GET/PUT/DELETE /api/purchases`, `PUT /api/purchases/{id}/status`
- `POST/GET/PUT/DELETE /api/expenses`
- `POST/GET/PUT/DELETE /api/products`
- `POST/GET/PUT/DELETE /api/customers` (dual-purpose: customer + vendor)
- `POST/GET/PUT/DELETE /api/taxes`
- `GET /api/reports/profit-loss`, `/balance-sheet`, `/cash-flow`, `/expenses`, `/receivables-payables`
- `GET /api/dashboard` → overview stats
- `GET/PUT /api/tenants/settings` (company settings, bank info, logo upload)
- `GET /api/tenants/members`, `POST /api/tenants/members`, `PUT /api/tenants/members/{userId}`, `DELETE /api/tenants/members/{userId}`
- `GET /api/tenants/{id}/api-keys`, `POST /api/tenants/{id}/api-keys`, `PUT /api/tenants/{id}/api-keys/{keyId}`, `DELETE /api/tenants/{id}/api-keys/{keyId}`
- `GET /api/ledgers`, `POST /api/ledgers`, `PUT /api/ledgers/{id}`, `DELETE /api/ledgers/{id}`
- Super Admin: `GET /api/superadmin/tenants`, `POST /api/superadmin/tenants`
- `GET /health` (public)
- Swagger UI: `GET /docs` (non-production only)

Env vars: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `APP_VERSION`, `NODE_ENV`, `PORT`.

Docker services: `api` (Fastify :3000), `frontend` (nginx :80), `db` (postgres:16). Standalone compose + swarm stack with replicas/healthchecks. Images: `ghcr.io/dedysutanto/mahakam-backend`, `ghcr.io/dedysutanto/mahakam-frontend`.

## §V — invariants

- V1: every `/api` request without valid JWT or API key → 401; invalid → 403.
- V2: every tenant query filtered by `tenantId` from JWT/API key context; superadmin bypass only with explicit tenant selection.
- V3: JWT token short-lived (24h), stored in localStorage, never in URL.
- V4: invoice/PO number auto-generated from settings pattern; per-tenant sequence counter never reused.
- V5: invoice status transitions draft→sent→paid, partial allowed; any non-paid→draft revert; else 422. Paid invoices not editable.
- V6: default PPN from settings; per-line tax; total = subtotal + tax.
- V7: money formatted as Rp Indonesian grouping.
- V8: role/permission enforced server-side per endpoint, never client-trusted.
- V9: Per-menu scopes enforced; owner/admin = ALL scopes; staff/API keys = explicit scopes only. API keys do NOT get admin bypass on requireScope.
- V10: Prisma migrations; PostgreSQL.
- V11: Company admin restricted to own `tenantId`; cannot assign superadmin; cannot manage other tenants' users.
- V12: Docker services reachable by service name; env vars for secrets, not committed. JWT_SECRET and POSTGRES_PASSWORD required (no defaults).
- V13: PO status draft→sent→received→ordered; cancel any stage.
- V14: paid invoices not editable (422); edit allowed otherwise.
- V15: PDF generation via PDFKit; invoice PDF includes company info, bank details, items, totals, notes/terms.
- V16: Recap billing statement aggregates non-draft invoices per customer into single PDF.
- V17: Company logo stored in `uploads/logos/{tenantId}.png`; sidebar + PDF header use it; favicon fallback to Mahakam logo. PNG/JPEG only (no SVG).
- V18: API keys bcrypt-hashed; full key shown once on creation; prefix used for lookup; expiry checked on each request; lastUsedAt updated.
- V19: CORS restricted to configured `CORS_ORIGIN` env var (comma-separated list).
- V20: Mass-assignment prevented — update routes use field whitelists.
- V21: Docker container runs as non-root user (node).
- V22: Rate limiting via `@fastify/rate-limit`: global 100 req/min per IP; login endpoint 5 req/min per IP (brute-force protection).
- V23: Item tables (PDF + frontend view mode): Diskon column rendered only when ≥1 line has discount > 0; product unit rendered after quantity (`10 pcs`); totals Diskon row only when discount > 0.
- V24: `/uploads/*` served by backend static root; nginx proxies `location ^~ /uploads/` → api (prefix match must beat regex asset block); `uploads` named volume persists logos; logos dir auto-created at entrypoint and upload route.
- V25: Product unit dropdown sourced from `product_units` tenant setting (JSON string array; built-in defaults when unset/invalid/empty; stored unit appended when editing legacy rows). `PUT /api/tenants/settings` requires `pengaturan` scope — staff need explicit scope, owner/admin implicit, API keys no bypass.
- V26: Detail/create/edit overlays push a browser history entry (`useFormHistory`); device/browser back closes the overlay to the module's list; programmatic close consumes the marker without leaving the page.
- V27: Expense PUT/DELETE keep the auto-posted journal entry in sync — PUT rebuilds JE lines/date/description from the final stored row (or posts a fresh JE for legacy rows without one); DELETE removes the linked JE in the same transaction. No orphaned or stale entries in Buku Besar.
- V28: Client-facing stats count `type='customer'` contacts only; vendors excluded.
- V29: Rekap wizard includes exactly the invoices matching its active filters (status ∧ periode ∧ search); no separate selection state exists — anything not matching is excluded.

## §T — tasks

| id | status | task | cites |
|----|--------|------|-------|
| T1 | x | scaffold repo: backend/, frontend/, docker/, docker-compose | V10,V12 |
| T2 | x | Fastify skeleton + Prisma + PostgreSQL | V10 |
| T3 | x | DB models (17 tables: Tenant, User, TenantUser, Ledger, JournalEntry, JournalLine, Invoice, InvoiceItem, Payment, Expense, Customer, Quotation, QuotationItem, Product, Purchase, PurchaseItem, Setting, Tax, ApiKey) | V1,V2,V10 |
| T4 | x | JWT auth + role/permission deps | V1,V8 |
| T5 | x | tenant + user CRUD (email username, admin creates users) | V2,V11 |
| T6 | x | two-tier admin: isSuperAdmin + TenantUser.scopes | V9,V11 |
| T7 | x | product catalog CRUD | V2,V7 |
| T8 | x | invoice CRUD + lines + auto number + status + payments | V4,V5,V7,V14 |
| T9 | x | tax engine: PPN default, per-line tax | V6,V7 |
| T10 | x | purchase order CRUD + status | V13,V7 |
| T11 | x | expense CRUD | V7 |
| T12 | x | reports (profit-loss, balance-sheet, cash-flow, expenses, receivables-payables) | V7 |
| T13 | x | customer/vendor dual-purpose CRUD | V2,V7 |
| T14 | x | quotation CRUD + convert to invoice | V5,V7 |
| T15 | x | ledger (chart of accounts) + journal entries | V2 |
| T16 | x | PDF generation: invoice + quotation (PDFKit, company info, bank details) | V15 |
| T17 | x | recap billing statement PDF | V16 |
| T18 | x | dashboard (overview stats, recent invoices/expenses) | V7,V8 |
| T19 | x | settings (company info, bank details, logo, tax config, PDF design, member management) | V4,V6,V9 |
| T20 | x | superadmin routes: list/create tenants | V11 |
| T21 | x | Dockerfiles (multi-stage, healthchecks, entrypoint) + compose + swarm stack | V12 |
| T22 | x | frontend: React SPA (Login, Dashboard, Faktur, Penawaran, Pembelian, Pengeluaran, Produk, Pelanggan, Pajak, Laporan, Buku Besar, Pengaturan, Profil, SuperAdmin) | V1-V17 |
| T23 | x | login: random background image, remember me, demo info hidden | — |
| T24 | x | logo: SVG with open design, favicon, sidebar fallback | V17 |
| T25 | x | superadmin credentials from env vars (auto-generated password) | — |
| T26 | x | API key management (admin-only CRUD, bcrypt hash, scopes, expiry) | V18,V9 |
| T27 | x | API key auth middleware (JWT fallback to Bearer mk_live_...) | V1,V18 |
| T28 | x | API key tenant ID discoverability (creation response, /api/auth/api-key/info, Settings UI) | V18 |
| T29 | x | red-team security audit + fixes (JWT_SECRET required, CORS restrict, mass-assignment whitelist, SVG upload, Docker non-root) | V12,V19,V20,V21 |
| T30 | x | AGPL v3 license | — |
| T31 | x | OpenAPI/Swagger route definitions | — |
| T32 | x | rate limiting: global 100 req/min, login 5 req/min | V22 |
| T33 | x | dashboard real % change vs previous period (previousPeriodFilter) | — |
| T34 | x | logo upload persistence: entrypoint mkdir, route mkdirSync, uploads volume | V24 |
| T35 | x | nginx `/uploads/` proxy to api, `^~` precedence over asset regex | V24 |
| T36 | x | settings: remove hardcoded bank placeholders, fields kept for PDF | — |
| T37 | x | PDF: hide Diskon column when no item discounted; Total column expands | V23 |
| T38 | x | unit after quantity: backend includes load product; PDF + views render it; mappers carry flat unit | V23 |
| T39 | x | Settings "Satuan Produk" chips editor → `product_units` setting; Products strict dropdown from list; clickable product rows | V25 |
| T40 | x | useFormHistory hook wired into 9 modules (Faktur, Penawaran, Pembelian, Pengeluaran, Produk, Pelanggan, Pajak, Buku Besar, Laporan) so back closes overlays | V26 |
| T41 | x | expense edit UI (Pencil + edit form) and accounting-safe PUT/DELETE with JE sync | V27 |
| T42 | x | inline "Produk Baru" panel gains Satuan dropdown from managed unit list (Faktur); full flow ported to Penawaran (was catalog-pick only) | V25 |
| T43 | x | labeled fields on all five inline creation panels (Produk Baru ×2, Pelanggan Baru, Vendor Baru ×2); Deskripsi captured on inline product creation | V25 |
| T44 | x | dashboard Total Pelanggan counts customers only (excludes vendors) | V28,B14 |
| T45 | x | recap table: Klien column dropped, Number column 190pt, wrap-aware row heights, summary shows "N faktur" | B15 |
| T46 | x | rekap wizard filter-driven: status + periode + search filters define content; checkboxes removed; footer totals from filtered set; button disabled at 0; filters reset on open/client change | V29,B16 |
| T47 | x | dashboard Faktur Terbaru shows invoice total (not outstanding), conditional "Sisa" hint, full status labels incl. Sebagian/Terlambat with distinct colors | B17 |
| T48 | x | laba-rugi revenue lines use `credit - debit` (credit-normal); expense lines use `debit - credit` (debit-normal); profit = revenue − expense | B18 |

## §B — bugs

| id | date | cause | fix |
|----|------|-------|-----|
| B1 | 2026-08-25 | `logo_failed` localStorage permanent — mobile stuck with SK fallback | Switched to sessionStorage + display:none until onLoad (V17) |
| B2 | 2026-08-25 | TypeScript build fails in Docker (missing .js extensions) | Use esbuild bundle instead of tsc for Docker build |
| B3 | 2026-08-25 | JWT secret defaults to public string | Required via env var, app crashes without it |
| B4 | 2026-08-25 | CORS reflects all origins | Restricted to CORS_ORIGIN env var |
| B5 | 2026-08-25 | Mass-assignment on update routes | Field whitelists on Customer, Product, Tax, Expense |
| B6 | 2026-08-25 | SVG upload allows stored XSS | PNG/JPEG only |
| B7 | 2026-08-25 | Dashboard shows `undefined%` when previous period has no data | `formatChange` uses `== null` instead of `=== null` (T33) |
| B8 | 2026-08-25 | Logo upload ENOENT — `uploads/logos` absent in container volume shadow | mkdir at entrypoint + route mkdirSync (T34,V24) |
| B9 | 2026-08-25 | nginx regex `~* \.(png)$` intercepted `/uploads/logos/*.png` → 404 | `location ^~ /uploads/` prefix takes precedence (T35,V24) |
| B10 | 2026-08-26 | View-mode QTY showed no unit — form mappers dropped nested `product` object so `item.product?.unit` undefined | Mappers carry flat `unit: it.product?.unit || ''`; JSX reads `item.unit` (T38,V23) |
| B11 | 2026-08-26 | Invoice/quotation Detail (and Edit-from-view) showed "Tanpa Pajak" regardless of real PPN — mappers hardcoded `taxId: '__none__'` | Mappers resolve: stored taxId → rate match → `__none__`/'' fallback |
| B12 | 2026-08-26 | Browser back while in Detail/form exited the whole module to the previous real history entry (often Buku Besar) — overlays were state-only with no history entries | `useFormHistory`: marker pushed on open; popstate closes overlay to list (T40,V26) |
| B13 | 2026-08-26 | Expense PUT updated only the row (JE went stale) and DELETE orphaned the posted journal entry — Buku Besar silently desynced | PUT rebuilds linked JE lines/date/description in transaction; DELETE removes linked JE too; Edit button added to UI (T41,V27) |
| B14 | 2026-08-26 | Dashboard "Total Pelanggan" counted vendors too (dual-purpose customers table had no type filter) | Count filtered to `type: 'customer'` (T44,V28) |
| B15 | 2026-08-26 | Long invoice numbers (e.g. 018/INVOICE/OSB/VIII/2026) wrapped inside the 80pt recap Number column and overlapped following rows because rows advanced a fixed 16pt | Klien column removed, Number column 190pt, wrap-aware row heights via heightOfString (T45) |
| B16 | 2026-08-26 | Rekap wizard filters were cosmetic — selection silently contained all statuses regardless of active filter | Wizard redesigned: filtered set IS the rekap content; checkboxes deleted (T46,V29) |
| B17 | 2026-08-26 | Dashboard Faktur Terbaru displayed outstanding (Rp 0 for paid invoices) as the main figure and labeled partial/overdue invoices "Draft" | Show invoice total + conditional Sisa hint; complete status label/color map (T47) |
| B18 | 2026-08-27 | Laba Rugi computed `debit - credit` on revenue lines (credit-normal accounts), yielding negative revenue and positive expenses → always showed "Rugi"; dashboard had correct `credit - debit` for revenue | Flipped revenue to `credit - debit` in backend; frontend revenue line items match (T48) |
