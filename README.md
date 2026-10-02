# Mahakam — Sistem Informasi Keuangan

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Sistem manajemen keuangan dan invoice multi-tenant untuk bisnis Indonesia.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Fastify 5, Prisma 6, PostgreSQL 16 |
| Frontend | React 19, Vite 6, TailwindCSS 3 |
| PDF | PDFKit |
| Auth | JWT + bcryptjs |
| Deploy | Docker, Docker Compose, Docker Swarm |

## Features

- **Dashboard** — ringkasan keuangan real-time
- **Faktur (Invoice)** — buat, kirim, lacak pembayaran, cetak PDF
- **Penawaran (Quotation)** — buat penawaran, konversi ke faktur
- **Pembelian (Purchase)** — pesanan ke vendor, status workflow
- **Pengeluaran (Expense)** — catat pengeluaran per akun
- **Produk** — katalog produk dengan harga jual
- **Pelanggan & Vendor** — database pelanggan dan vendor
- **Pajak** — konfigurasi tarif PPN
- **Buku Besar (Ledger)** — chart of accounts, jurnal ganda
- **Laporan** — laba/rugi, neraca, arus kas
- **Super Admin** — manajemen tenant dan user
- **Rekap Faktur** — PDF billing statement per pelanggan

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm

### Local Development

```bash
# Backend
cd backend
cp .env.example .env    # edit DATABASE_URL, JWT_SECRET
npm install
npx prisma migrate dev
npm run seed
npm run dev             # http://localhost:3000

# Frontend (new terminal)
cd frontend
npm install
npm run dev             # http://localhost:5173
```

### Default Login

Super admin credentials are configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPER_ADMIN_EMAIL` | `super@mahakam.id` | Super admin email |
| `SUPER_ADMIN_PASSWORD` | *(auto-generated)* | Random 16-char password if not set |

**Docker**: Password is printed in container logs on first start.
**Local dev**: Seed manually with `npm run seed` (password: `admin123`).

## Docker

### Standalone

```bash
cp deploy/.env.example .env   # edit secrets
docker compose up -d
```

Services:
- Frontend: http://localhost:80
- Backend API: http://localhost:3000
- Database: localhost:5432

### Docker Swarm

```bash
docker stack deploy -c deploy/swarm-stack.yml mahakam
```

With 2 API replicas + 2 frontend replicas, rolling updates, resource limits.

## MCP Server

Standalone stdio MCP server (`mcp/`) wraps the REST API for LLM clients (OpenCode, Claude Desktop, …). Read-only; PDF download tools write to disk (POST only for recap generation).

```bash
cd mcp && npm ci
export MAHAKAM_BASE_URL=https://m.app.ptosb.com MAHAKAM_API_KEY=mk_live_...
npx tsx src/index.ts      # stdio
```

Tools: dashboard, invoices (list/get/PDF by id or number), expenses, ledgers, customers (list — resolves the customer ID an invoice needs), laba rugi, neraca, arus kas, quotation PDF, recap PDF (ids or invoice numbers — one customer per recap), `create_invoice_draft` and `update_invoice_draft` (draft invoices from customer + items; number and totals are server-generated, updates replace the whole draft).

OpenCode: `opencode.json` already declares `mcp.servers.mahakam` (env `MAHAKAM_API_KEY`). Claude Desktop / other clients:

```json
{ "mcpServers": { "mahakam": { "command": "npx", "args": ["tsx", "/abs/path/mahakam/mcp/src/index.ts"],
  "env": { "MAHAKAM_BASE_URL": "https://m.app.ptosb.com", "MAHAKAM_API_KEY": "mk_live_..." } } } }
```

API key needs the matching per-module scopes (`faktur`, `pengeluaran`, `buku-besar`, `laporan`, `penawaran`); missing scope returns a structured message naming it. Optional `MAHAKAM_PDF_DIR` (default `./mahakam-pdfs`).

## Project Structure

```
mahakam/
├── backend/
│   ├── src/
│   │   ├── modules/          # route modules (auth, invoice, ledger, ...)
│   │   ├── middleware/       # JWT auth
│   │   └── utils/            # PDF, numbering, tax, terbilang
│   ├── prisma/               # schema + migrations
│   ├── Dockerfile
│   └── docker-entrypoint.sh
├── frontend/
│   ├── src/
│   │   ├── pages/            # all page components
│   │   ├── components/       # Layout, shared UI
│   │   └── lib/              # auth, utils, regions
│   ├── nginx.conf
│   └── Dockerfile
├── deploy/
│   ├── swarm-stack.yml
│   └── .env.example
├── mcp/                      # standalone stdio MCP server
└── docker-compose.yml
```

## API Endpoints

| Prefix | Module |
|--------|--------|
| `/api/auth` | Login, register, profile |
| `/api/tenants` | Tenant settings, users |
| `/api/invoices` | CRUD + status + PDF + payments + recap |
| `/api/quotations` | CRUD + convert to invoice + PDF |
| `/api/purchases` | CRUD + status + journal |
| `/api/expenses` | CRUD + journal |
| `/api/customers` | Pelanggan & vendor |
| `/api/products` | Katalog produk |
| `/api/taxes` | Tarif pajak |
| `/api/ledgers` | Chart of accounts |
| `/api/reports` | Laba/rugi, neraca, arus kas |
| `/api/dashboard` | Ringkasan keuangan |
| `/api/superadmin` | Manajemen tenant |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `JWT_SECRET` | — | Secret key for JWT tokens |
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `3000` | Backend server port |
| `POSTGRES_USER` | `si_keuangan` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `si_keuangan_pass` | PostgreSQL password |
| `POSTGRES_DB` | `keuangan_db` | PostgreSQL database name |
| `SUPER_ADMIN_EMAIL` | `super@mahakam.id` | Super admin email |
| `SUPER_ADMIN_PASSWORD` | *(auto-generated)* | Super admin password (random if empty) |

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE) for details.
