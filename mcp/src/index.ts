#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { mahakamFetch, mahakamFetchPaginated } from "./client.js"

const server = new McpServer({
  name: "mahakam",
  version: "1.0.0",
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

// --- Start ---
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("MCP server failed:", err)
  process.exit(1)
})
