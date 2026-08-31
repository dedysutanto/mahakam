# Plan: Personal Finance Mode for Mahakam

## Status: DRAFT — Revisit Later

## Overview

Add a `type: 'personal' | 'company'` distinction to the Tenant model. Personal tenants get a simplified experience: Dashboard, Quote, Invoice, Expense — with simpler numbering, no journal entries, and auto-created minimal ledgers.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Data model** | Same tables, `tenant.type` field | Minimal schema changes, all existing queries work with a scope filter |
| **User role** | Keep `'owner'` | The `tenant.type` field gates features, not the role |
| **Expense journal entries** | Skip for personal tenants | Personal mode has no double-entry accounting |
| **Dashboard calculation** | Direct from invoice/expense tables | No journal entries to aggregate from |
| **Numbering** | Simple auto-increment (`INV-001`) | Personal users don't need complex formats |
| **Tax** | Include for now (same PDF template) | As per requirement |
| **Payments** | Include (same as company) | Confirmed |

## Changes by Layer

---

### 1. Prisma Schema (`backend/prisma/schema.prisma`)

**Add `type` field to Tenant:**
```prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String   @db.VarChar(100)
  type      String   @default("company") @db.VarChar(20)  // NEW: 'personal' | 'company'
  logoPath  String?
  // ... rest unchanged
}
```

**Make `Expense.ledgerId` optional** (personal expenses don't need a ledger):
```prisma
model Expense {
  ledgerId      String?   // was: String (required)
  // ... rest unchanged
}
```

---

### 2. Registration Flow (`backend/src/modules/auth/auth.routes.ts`)

**Modify POST `/api/auth/register`** to accept a `type` field:

- `type: 'company'` (default): Current behavior — creates tenant, seeds 18 ledger accounts + PPN tax
- `type: 'personal'`: Creates tenant with `type: 'personal'`, seeds only:
  - **5 expense category ledgers**: Makanan & Minuman, Transport, Utilitas, Kesehatan, Lainnya (type: `'expense'`, codes `5-P01` through `5-P05`)
  - **1 cash/asset ledger**: Kas (type: `'asset'`, code `'1-1-01'`)
  - **No PPN tax** (personal invoices don't default to 11% PPN)

**JWT payload**: Add `tenantType` to the token:
```ts
{ userId, tenantId, role: 'owner', tenantType: type }
```

---

### 3. Auth Response (`backend/src/modules/auth/auth.routes.ts`)

**Login response** and **`/me` endpoint**: Include `tenant.type` in the user object:
```ts
{
  // ...existing fields...
  tenant: { id, name, type },  // add 'type'
}
```

**Frontend User interface** (`frontend/src/lib/AuthContext.tsx`): Add `type` to the tenant:
```ts
tenant: { id: string; name: string; type: string } | null
```

---

### 4. Personal Numbering (`backend/src/utils/numbering.ts`)

**Add a `personalSimpleNumber` function** that generates simple auto-increment:

```
INV-001, INV-002, ...  (invoices)
EXP-001, EXP-002, ...  (expenses)
QUO-001, QUO-002, ...  (quotations)
```

Logic: Query max sequence number across all documents of this kind for the tenant (no date filtering), increment, pad to 3 digits.

**Modify `generateDocNumber`**: Check `tenant.type`. If `'personal'`, use `personalSimpleNumber`. If `'company'`, use the existing format engine.

---

### 5. Expense Module (`backend/src/modules/expense/expense.routes.ts`)

**Create handler (POST `/`)**: Skip journal entry creation when `tenant.type === 'personal'`:
```ts
const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
if (tenant.type !== 'personal') {
  // existing journal entry creation logic
}
```

**Update handler**: Same conditional — skip journal entry rebuild for personal.

**Delete handler**: Same conditional — skip journal entry deletion for personal.

---

### 6. Dashboard (`backend/src/modules/dashboard/dashboard.routes.ts`)

**For personal tenants**, replace journal-based queries with direct table queries:

| Metric | Company (current) | Personal (new) |
|---|---|---|
| Revenue | `journalLine` aggregate where ledger.type = 'revenue' | `invoice.aggregate(total)` where status != 'draft' |
| Expense | `journalLine` aggregate where ledger.type = 'expense' | `expense.aggregate(amount)` |
| Profit | revenue - expense | revenue - expense |
| Unpaid invoices | `invoice.count` where status != 'paid' | Same |
| Total invoices | `invoice.count` | Same |
| Recent invoices | `invoice.findMany` | Same |
| Recent expenses | `expense.findMany` | Same |
| Top accounts | `journalLine.groupBy(ledgerId)` | **Empty** (personal has no meaningful account balances) |

The handler checks `tenant.type` and branches the query logic.

---

### 7. Frontend Menu (`frontend/src/components/Layout.tsx`)

**Filter `navItems` by `tenant.type`:**

```ts
const personalScopes = ['', 'faktur', 'penawaran', 'pengeluaran'] // Dasbor, Faktur, Penawaran, Pengeluaran

navItems.filter((item) => {
  if (user?.tenant?.type === 'personal') {
    return personalScopes.includes(item.scope)
  }
  return !item.scope || hasScope(item.scope)
})
```

This hides: Buku Besar, Pembelian, Produk, Pelanggan & Vendor, Pajak, Laporan, Pengaturan for personal users.

---

### 8. Frontend Routing (`frontend/src/App.tsx`)

**Add route guard** for personal users hitting company-only routes:

```tsx
if (user?.tenant?.type === 'personal' && !personalPaths.includes(location.pathname)) {
  return <Navigate to="/" replace />
}
```

---

### 9. Frontend Expense Page (`frontend/src/pages/Expenses.tsx`)

**For personal tenants**, simplify the form:
- **Hide "Akun Beban" dropdown** (no ledger selection needed — use `category` instead)
- **Remove vendor dropdown** (personal doesn't need vendors)
- **Show category dropdown** with the 5 auto-created categories: Makanan & Minuman, Transport, Utilitas, Kesehatan, Lainnya
- **Hide the "Akun" column** in the list table

The backend already accepts `category` and `ledgerId` is now optional, so the frontend just needs conditional rendering.

---

### 10. Frontend Invoice/Quotation Pages

**No changes needed** — invoices and quotations work the same for personal and company. The numbering engine handles the difference transparently.

---

## Files Changed

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `type` to Tenant; make `Expense.ledgerId` optional |
| `backend/src/modules/auth/auth.routes.ts` | Registration accepts `type`; seeds personal ledgers; JWT includes `tenantType`; login/me response includes `tenant.type` |
| `backend/src/utils/numbering.ts` | Add simple auto-increment for personal tenants |
| `backend/src/modules/expense/expense.routes.ts` | Skip journal entries for personal tenants |
| `backend/src/modules/dashboard/dashboard.routes.ts` | Direct queries for personal tenants |
| `frontend/src/lib/AuthContext.tsx` | Add `type` to tenant interface |
| `frontend/src/components/Layout.tsx` | Filter menu by tenant type |
| `frontend/src/App.tsx` | Route guard for personal users |
| `frontend/src/pages/Expenses.tsx` | Simplified form for personal mode |

---

## Migration

Run `npx prisma migrate dev --name add_tenant_type` to add the `type` column with default `'company'`. All existing tenants become company tenants — zero data migration needed.

---

## Testing Checklist

1. **Register as personal** → tenant created with `type: 'personal'`, minimal ledgers seeded
2. **Register as company** → existing behavior unchanged
3. **Personal dashboard** → shows revenue from invoices, expenses from expense module, no top accounts
4. **Personal menu** → only Dasbor, Faktur, Penawaran, Pengeluaran visible
5. **Personal invoice** → works normally, simple numbering (`INV-001`)
6. **Personal quotation** → works normally, convert to invoice works
7. **Personal expense** → no ledger selection, category-based, no journal entries
8. **Company mode** → everything works exactly as before
9. **Route guard** → personal user hitting `/buku-besar` redirects to `/`
