#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { mahakamFetch, mahakamFetchPaginated, mahakamFetchPdf } from "./client.js"
import { ID_MSG, ID_RE, recapHash, resolveInvoiceId, resolveInvoiceIds, savePdf } from "./pdf.js"

const server = new McpServer({
  name: "mahakam",
  version: "1.4.0",
})

// --- healthcheck ---
server.tool("healthcheck", "Check Mahakam MCP server is alive", {}, async () => ({
  content: [{ type: "text" as const, text: "ok" }],
}))

// --- Dashboard ---
server.tool(
  "get_dashboard",
  "Get dashboard overview stats (revenue, expenses, invoices, customers)",
  { period: z.enum(["30d", "this_month", "last_month", "this_year", "last_year", "all"]).optional() },
  async ({ period }) => {
    const result = await mahakamFetch("/dashboard", "dashboard", { period })
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// --- Invoices ---
server.tool(
  "list_invoices",
  "List invoices with optional filters. Returns paginated list.",
  {
    status: z.string().optional().describe("Filter by status: draft, sent, partial, paid, overdue"),
    customerId: z.string().optional().describe("Filter by customer ID"),
    dateFrom: z.string().optional().describe("Filter from date (YYYY-MM-DD)"),
    dateTo: z.string().optional().describe("Filter to date (YYYY-MM-DD)"),
    page: z.string().optional().describe("Page number (default 1)"),
  },
  async ({ status, customerId, dateFrom, dateTo, page }) => {
    const result = await mahakamFetchPaginated("/invoices", "faktur", {
      status, customerId, dateFrom, dateTo, page,
    })
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  "get_invoice",
  "Get a single invoice by ID with items, payments, and customer data",
  { id: z.string().describe("Invoice ID") },
  async ({ id }) => {
    const result = await mahakamFetch(`/invoices/${id}`, "faktur")
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// --- Expenses ---
server.tool(
  "list_expenses",
  "List expenses with optional filters. Returns paginated list.",
  {
    category: z.string().optional().describe("Filter by category"),
    dateFrom: z.string().optional().describe("Filter from date (YYYY-MM-DD)"),
    dateTo: z.string().optional().describe("Filter to date (YYYY-MM-DD)"),
    page: z.string().optional().describe("Page number (default 1)"),
  },
  async ({ category, dateFrom, dateTo, page }) => {
    const result = await mahakamFetchPaginated("/expenses", "pengeluaran", {
      category, dateFrom, dateTo, page,
    })
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  "get_expense",
  "Get a single expense by ID",
  { id: z.string().describe("Expense ID") },
  async ({ id }) => {
    const result = await mahakamFetch(`/expenses/${id}`, "pengeluaran")
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// --- Ledger ---
server.tool(
  "list_ledgers",
  "List chart of accounts (ledger accounts)",
  {},
  async () => {
    const result = await mahakamFetch("/ledgers", "buku-besar")
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// --- Reports ---
server.tool(
  "get_profit_loss",
  "Get income statement (Laba Rugi) with revenue, expense, and profit totals",
  {
    dateFrom: z.string().optional().describe("From date (YYYY-MM-DD)"),
    dateTo: z.string().optional().describe("To date (YYYY-MM-DD)"),
  },
  async ({ dateFrom, dateTo }) => {
    const result = await mahakamFetch("/reports/laba-rugi", "laporan", { dateFrom, dateTo })
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  "get_balance_sheet",
  "Get balance sheet (Neraca) with assets, liabilities, and equity",
  {
    dateTo: z.string().optional().describe("As of date (YYYY-MM-DD)"),
  },
  async ({ dateTo }) => {
    const result = await mahakamFetch("/reports/neraca", "laporan", { dateTo })
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  "get_cash_flow",
  "Get cash flow statement",
  {
    dateFrom: z.string().optional().describe("From date (YYYY-MM-DD)"),
    dateTo: z.string().optional().describe("To date (YYYY-MM-DD)"),
  },
  async ({ dateFrom, dateTo }) => {
    const result = await mahakamFetch("/reports/arus-kas", "laporan", { dateFrom, dateTo })
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)


// --- PDF downloads (V50: recap POST is generate-only; V52/V53: id gate, safe write) ---
const text = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
})

server.tool(
  "download_invoice_pdf",
  "Download invoice PDF to disk; accepts invoice ID or invoice number (e.g. 020/INVOICE/OSB/VIII/2026); returns absolute file path",
  { id: z.string().min(1).max(100).describe("Invoice ID or invoice number") },
  async ({ id }) => {
    const resolved = await resolveInvoiceId(id)
    if ("error" in resolved) return text(resolved)
    return text(await savePdf(`faktur-${resolved.id}.pdf`, await mahakamFetchPdf(`/invoices/${resolved.id}/pdf`, "faktur")))
  }
)

server.tool(
  "download_quotation_pdf",
  "Download quotation PDF to disk; returns absolute file path",
  { id: z.string().describe("Quotation ID") },
  async ({ id }) => {
    if (!ID_RE.test(id)) return text({ error: true, message: ID_MSG, statusCode: 400 })
    return text(await savePdf(`penawaran-${id}.pdf`, await mahakamFetchPdf(`/quotations/${id}/pdf`, "penawaran")))
  }
)

server.tool(
  "download_recap_pdf",
  "Generate recap billing statement PDF for selected invoices (must all belong to one customer) and download to disk; accepts invoice IDs or invoice numbers; returns absolute file path",
  {
    ids: z
      .array(z.string().min(1).max(100))
      .min(1)
      .describe("Invoice IDs or invoice numbers (all one customer)"),
  },
  async ({ ids }) => {
    const resolved = await resolveInvoiceIds(ids)
    if ("error" in resolved) return text(resolved)
    const fetched = await mahakamFetchPdf("/invoices/recap", "faktur", "POST", { ids: resolved.ids })
    return text(await savePdf(`rekap-penagihan-${recapHash(resolved.ids)}.pdf`, fetched))
  }
)

// --- Customers (V57: auth-only endpoint — resolves the customerId a write needs) ---
server.tool(
  "list_customers",
  "List customers/vendors to find the customer ID an invoice needs. Supports name/email search.",
  {
    search: z.string().optional().describe("Search by name or email"),
    type: z.string().optional().describe("Filter by type: customer, vendor"),
    page: z.string().optional().describe("Page number (default 1)"),
  },
  async ({ search, type, page }) => {
    const result = await mahakamFetchPaginated("/customers", "", { search, type, page })
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  }
)

// --- Write (V50/V56/V58: drafts only; number + totals are server-owned) ---
const SERVER_OWNED = ["invoiceNumber", "status", "subtotal", "taxAmount", "total"] as const

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number(),
  unitPrice: z.number(),
  productId: z.string().optional(),
  unit: z.string().optional().describe("Server auto-fills from the product when omitted"),
  discount: z.number().optional().describe("Discount percent 0-100"),
})

// Declared only so a caller supplying them hits the rejection instead of a silent strip.
const rejectedSchema = {
  invoiceNumber: z.string().optional(),
  status: z.string().optional(),
  subtotal: z.number().optional(),
  taxAmount: z.number().optional(),
  total: z.number().optional(),
}

// V58: PUT replaces the whole invoice, so everything editable is required here.
const draftFields = {
  customerId: z.string().min(1).describe("Existing customer ID"),
  issueDate: z.string().min(1).describe("Issue date (YYYY-MM-DD) — a replacement must state it, it is not defaulted"),
  dueDate: z.string().min(1).describe("Due date (YYYY-MM-DD)"),
  items: z.array(itemSchema).min(1).describe("Invoice line items"),
  notes: z.string().optional(),
  terms: z.string().optional(),
  taxId: z.string().optional(),
  taxRate: z.number().optional(),
}

function rejectServerOwned(tool: string, args: unknown) {
  const injected = SERVER_OWNED.filter((k) => (args as Record<string, unknown>)[k] !== undefined)
  if (injected.length === 0) return null
  return text({
    error: true,
    message: `${tool} does not accept ${injected.join(", ")} — the number is generated server-side, only drafts are created, and totals are computed from the items.`,
    statusCode: 400,
  })
}

server.tool(
  "create_invoice_draft",
  "Create a DRAFT invoice (never issued) from a customer and line items. The invoice number is generated server-side and totals are computed server-side; passing invoiceNumber/status/total is rejected. Returns the created row plus the saved PDF path. A human reviews the draft in the web UI before issuing it.",
  {
    customerId: z.string().min(1).describe("Existing customer ID"),
    dueDate: z.string().min(1).describe("Due date (YYYY-MM-DD)"),
    items: z.array(itemSchema).min(1).describe("Invoice line items"),
    issueDate: z.string().optional().describe("Issue date (YYYY-MM-DD); server default when omitted"),
    notes: z.string().optional(),
    terms: z.string().optional(),
    taxId: z.string().optional(),
    taxRate: z.number().optional(),
    ...rejectedSchema,
  },
  async (args) => {
    const rejected = rejectServerOwned("create_invoice_draft", args)
    if (rejected) return rejected
    const { customerId, dueDate, items, issueDate, notes, terms, taxId, taxRate } = args
    // V56: this body is the whole write surface — no server-owned field ever leaves here.
    const created = await mahakamFetch<{ id: string }>("/invoices", "faktur", undefined, {
      method: "POST",
      body: { customerId, dueDate, items, issueDate, notes, terms, taxId, taxRate },
    })
    if ("error" in created) return text(created)

    const fetched = await mahakamFetchPdf(`/invoices/${created.id}/pdf`, "faktur")
    const pdf = await savePdf(`faktur-${created.id}.pdf`, fetched)
    if ("error" in pdf) return text(pdf)

    const { error, ...row } = created as Record<string, unknown> & { id: string }
    return text({ ...row, path: pdf.path, filename: pdf.filename })
  }
)

server.tool(
  "update_invoice_draft",
  "Replace a DRAFT invoice's contents (only drafts can be edited; a sent or paid invoice is rejected). This is a FULL replacement: customerId, issueDate, dueDate and items are all required — anything you omit is not carried over. The invoice keeps its number; totals are recomputed server-side. Returns the fresh row plus the regenerated PDF path.",
  {
    invoiceId: z.string().min(1).describe("Draft invoice ID (a sent/paid invoice is rejected)"),
    ...draftFields,
    ...rejectedSchema,
  },
  async (args) => {
    const rejected = rejectServerOwned("update_invoice_draft", args)
    if (rejected) return rejected

    const { invoiceId, customerId, issueDate, dueDate, items, notes, terms, taxId, taxRate } = args
    const current = await mahakamFetch<{ invoiceNumber: string; status: string }>(`/invoices/${invoiceId}`, "faktur")
    if ("error" in current) return text(current)
    if (current.status !== "draft") {
      return text({
        error: true,
        message: `Faktur ${current.invoiceNumber} berstatus ${current.status} — hanya draft yang dapat diubah.`,
        statusCode: 422,
      })
    }

    // V58: the backend replaces the whole invoice; the number is re-sent so the draft keeps it.
    const updated = await mahakamFetch<{ id: string }>(`/invoices/${invoiceId}`, "faktur", undefined, {
      method: "PUT",
      body: { customerId, issueDate, dueDate, items, notes, terms, taxId, taxRate, invoiceNumber: current.invoiceNumber },
    })
    if ("error" in updated) return text(updated)

    const fetched = await mahakamFetchPdf(`/invoices/${invoiceId}/pdf`, "faktur")
    const pdf = await savePdf(`faktur-${invoiceId}.pdf`, fetched)
    if ("error" in pdf) return text(pdf)

    const { error, ...row } = updated as Record<string, unknown> & { id: string }
    return text({ ...row, path: pdf.path, filename: pdf.filename })
  }
)

// --- Start ---
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("MCP server failed:", err)
  process.exit(1)
})
