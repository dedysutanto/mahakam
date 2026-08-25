# Mahakam — Sistem Informasi Keuangan

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

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@majusejahtera.id | admin123 |

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

## License

Private — All rights reserved.
