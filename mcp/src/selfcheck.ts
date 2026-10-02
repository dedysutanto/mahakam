// T73 self-check — deterministic, local mock only (no network).
// V49: structured 403 · V52: id gate, absolute path, recap id-set hash · V53: no file on non-200/PDF
import assert from "node:assert"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const PDF = Buffer.from("%PDF-1.4 mock")

const created: { body?: any; count: number } = { count: 0 }
const put: { body?: any; count: number } = { count: 0 }
const deleted: { count: number } = { count: 0 }

const server = createServer((req, res) => {
  if (req.url === "/api/invoices" && req.method === "POST") {
    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      created.count++
      created.body = JSON.parse(Buffer.concat(chunks).toString())
      res.writeHead(201, { "content-type": "application/json" }).end(
        JSON.stringify({
          id: "newinv1",
          invoiceNumber: "001/INV/OSB/X/2026",
          status: "draft",
          subtotal: 100000,
          taxAmount: 11000,
          total: 111000,
        })
      )
    })
  } else if (req.url === "/api/invoices/newinv1/pdf") {
    res.writeHead(200, { "content-type": "application/pdf" }).end(PDF)
  } else if (req.url === "/api/invoices/good123/pdf") {
    res.writeHead(200, { "content-type": "application/pdf" }).end(PDF)
  } else if (req.url === "/api/invoices/miss999/pdf") {
    res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ message: "Faktur tidak ditemukan" }))
  } else if (req.url === "/api/invoices/noscope/pdf") {
    res.writeHead(403, { "content-type": "application/json" }).end("{}")
  } else if (req.url === "/api/invoices/recap" && req.method === "POST") {
    res.writeHead(200, { "content-type": "application/pdf" }).end(PDF)
  } else if (req.url === "/api/invoices/upd111" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ id: "upd111", invoiceNumber: "009/INV/OSB/X/2026", status: "draft" })
    )
  } else if (req.url === "/api/invoices/sent222" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ id: "sent222", invoiceNumber: "010/INV/OSB/X/2026", status: "sent" })
    )
  } else if (req.url === "/api/invoices/newinv1" && req.method === "GET") {
    // V61: the row exists as a draft until the DELETE lands, then it is gone.
    if (deleted.count > 0) {
      // deployed API throws on a missing row, so the status is 500 (not 404) — mirrored here on purpose
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ message: "Faktur tidak ditemukan" }))
    } else {
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({ id: "newinv1", invoiceNumber: "001/INV/OSB/X/2026", status: "draft" })
      )
    }
  } else if (req.url === "/api/invoices/newinv1" && req.method === "DELETE") {
    deleted.count++
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ message: "Faktur berhasil dihapus" }))
  } else if (req.url === "/api/invoices/upd111" && req.method === "PUT") {
    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      put.count++
      put.body = JSON.parse(Buffer.concat(chunks).toString())
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          id: "upd111",
          invoiceNumber: put.body.invoiceNumber,
          status: "draft",
          subtotal: 200000,
          taxAmount: 22000,
          total: 222000,
        })
      )
    })
  } else if (req.url === "/api/invoices/upd111/pdf") {
    res.writeHead(200, { "content-type": "application/pdf" }).end(PDF)
  } else if (req.url?.startsWith("/api/invoices?")) {
    const num = new URL(req.url, "http://localhost").searchParams.get("invoiceNumber")
    const byNumber: Record<string, string> = {
      "020/INVOICE/OSB/VIII/2026": "good123",
      "021/INVOICE/OSB/VIII/2026": "good456",
      "001/INV/OSB/X/2026": "newinv1",
    }
    const data: { id: string; invoiceNumber: string }[] = []
    if (byNumber[num ?? ""]) data.push({ id: byNumber[num!], invoiceNumber: num! })
    else if (num === "WRONG-1") data.push({ id: "good123", invoiceNumber: "OTHER-1" })
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ data, pagination: { page: 1, limit: 1, total: data.length, totalPages: 1 } }))
  } else if (req.url?.startsWith("/api/customers?")) {
    const q = new URL(req.url, "http://localhost").searchParams
    assert(q.get("search") === "KMJ", "T78: search filter forwarded verbatim")
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        data: [{ id: "cust1", name: "PT KMJ", type: "customer" }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      })
    )
  } else {
    res.writeHead(404).end()
  }
})

// The tool lives inside index.ts on a connected MCP server; call it through a real
// MCP client over stdio so the assertion covers the schema gate, not a re-implementation.
const toolCall = async (name: string, args: unknown) => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js")
  const transport = new StdioClientTransport({
    command: path.join(path.dirname(new URL(import.meta.url).pathname), "../node_modules/.bin/tsx"),
    args: [new URL("./index.ts", import.meta.url).pathname],
    cwd: path.dirname(new URL(import.meta.url).pathname),
    env: { ...process.env } as Record<string, string>,
    stderr: "inherit",
  })
  const client = new Client({ name: "selfcheck", version: "0" })
  await client.connect(transport)
  const result = await client.callTool({ name, arguments: args as Record<string, unknown> })
  await client.close()
  return JSON.parse((result.content as { type: string; text: string }[])[0].text)
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const addr = server.address()
  if (!addr || typeof addr === "string") throw new Error("server address unavailable")
  const port = addr.port
  const dir = mkdtempSync(path.join(tmpdir(), "mahakam-selfcheck-"))
  process.env.MAHAKAM_BASE_URL = `http://127.0.0.1:${port}`
  process.env.MAHAKAM_API_KEY = "mk_live_selfcheck"
  process.env.MAHAKAM_PDF_DIR = dir

  // Load-boundary exception: config.ts reads env at module load and exits when unset —
  // MAHAKAM_BASE_URL only exists after listen(), so these must load after env assignment.
  const { mahakamFetchPdf } = await import("./client.js")
  const { ID_MSG, ID_RE, recapHash, resolveInvoiceId, resolveInvoiceIds, savePdf } = await import("./pdf.js")

  // V53: 500 JSON → error object, never a file
  const miss = await mahakamFetchPdf("/invoices/miss999/pdf", "faktur")
  assert("error" in miss && miss.statusCode === 500, "V53: 500 maps to error object")
  const saved1 = await savePdf("faktur-miss999.pdf", miss)
  assert("error" in saved1, "V53: error result not saved")
  assert(!existsSync(path.join(dir, "faktur-miss999.pdf")), "V53: no file left behind on error")

  // V49: structured 403
  const denied = await mahakamFetchPdf("/invoices/noscope/pdf", "faktur")
  assert(
    "error" in denied && denied.statusCode === 403 && denied.message.includes("Scope 'faktur' required"),
    "V49: structured 403 message"
  )

  // 200 + application/pdf → bytes land on disk with PDF magic
  const ok = await mahakamFetchPdf("/invoices/good123/pdf", "faktur")
  assert(!("error" in ok), "valid fetch must not error")
  const saved2 = await savePdf("faktur-good123.pdf", ok)
  assert("path" in saved2 && path.isAbsolute(saved2.path), "V52: returns absolute path")
  assert(
    "path" in saved2 && readFileSync(saved2.path).subarray(0, 5).toString() === "%PDF-",
    "V52: PDF bytes written"
  )

  // V52: id trust boundary
  assert(!ID_RE.test("../etc/passwd") && !ID_RE.test("AB/../x"), "V52: traversal rejected")
  assert(ID_RE.test("cmtc7m5260003o307iw6cc3p6"), "V52: cuid accepted")
  assert(ID_MSG.length > 0, "V52: reject message present")

  // V52: recap filename distinguishes id sets
  assert(recapHash(["b1", "a1"]) === recapHash(["a1", "b1"]), "recap hash order-insensitive")
  assert(recapHash(["a1", "b1"]) !== recapHash(["a1"]), "V52: distinct id sets → distinct hash")

  // recap POST rides the same V53 gate
  const recap = await mahakamFetchPdf("/invoices/recap", "faktur", "POST", { ids: ["a1"] })
  assert(!("error" in recap), "recap fetch ok")
  await savePdf(`rekap-penagihan-${recapHash(["a1"])}.pdf`, recap)
  assert(readdirSync(dir).filter((f) => f.endsWith(".pdf")).length === 2, "only successful PDFs on disk")

  // V54: id passes direct, invoice number resolves via exact filter, unknown → structured 404
  const direct = await resolveInvoiceId("good123")
  assert("id" in direct && direct.id === "good123", "V54: id passes through without lookup")
  const byNumber = await resolveInvoiceId("020/INVOICE/OSB/VIII/2026")
  assert("id" in byNumber && byNumber.id === "good123", "V54: invoice number resolves to id")
  const unknown = await resolveInvoiceId("NOPE-9")
  assert(
    "error" in unknown && unknown.statusCode === 404 && unknown.message === "Nomor faktur tidak ditemukan",
    "V54: unknown invoice number → structured 404"
  )

  // V54: backend without the filter echoes a different number -> 404, never a wrong invoice
  const wrong = await resolveInvoiceId("WRONG-1")
  assert("error" in wrong && wrong.statusCode === 404, "V54: number mismatch -> 404, no wrong PDF")

  // T76: recap resolves numbers too — cuids pass through, numbers resolve 1:1, order preserved
  const batch = await resolveInvoiceIds(["good123", "021/INVOICE/OSB/VIII/2026"])
  assert("ids" in batch && batch.ids.join(",") === "good123,good456", "T76: recap resolves ids and numbers")
  const batchErr = await resolveInvoiceIds(["good123", "NOPE-9"])
  assert("error" in batchErr && batchErr.statusCode === 404, "T76: unknown number aborts the whole recap")
  await savePdf(
    `rekap-penagihan-${recapHash(batch.ids)}.pdf`,
    await mahakamFetchPdf("/invoices/recap", "faktur", "POST", { ids: batch.ids })
  )

  // T77 / V56: draft create — server-owned fields rejected loudly, nothing posted
  const before = created.count
  for (const bad of [{ invoiceNumber: "999/X" }, { status: "sent" }, { total: 1 }, { subtotal: 1 }, { taxAmount: 1 }]) {
    const res = await toolCall("create_invoice_draft", {
      customerId: "cust1",
      dueDate: "2026-10-31",
      items: [{ description: "Jasa", quantity: 1, unitPrice: 100000 }],
      ...bad,
    })
    assert(
      res.error === true && res.statusCode === 400 && res.message.includes(Object.keys(bad)[0]),
      `V56: ${Object.keys(bad)[0]} rejected with 400`
    )
  }
  assert(created.count === before, "V56: rejected call must not reach the API")

  // T77 / V56: happy path — body carries no server-owned field, response exposes server totals + PDF path
  const made = await toolCall("create_invoice_draft", {
    customerId: "cust1",
    dueDate: "2026-10-31",
    items: [{ description: "Jasa", quantity: 1, unitPrice: 100000 }],
  })
  assert(made.id === "newinv1" && made.status === "draft", "V56: created row returned")
  assert(made.invoiceNumber === "001/INV/OSB/X/2026", "V56: number comes from the server")
  assert(made.subtotal === 100000 && made.taxAmount === 11000 && made.total === 111000, "V56: server-computed totals")
  assert(
    !("invoiceNumber" in created.body) && !("status" in created.body) && !("total" in created.body),
    "V56: request body carries no server-owned field"
  )
  assert(created.body.customerId === "cust1" && created.body.items.length === 1, "V56: only caller fields posted")
  assert(path.isAbsolute(made.path) && readFileSync(made.path).subarray(0, 5).toString() === "%PDF-", "T77: draft PDF saved")

  // T78 / V57: customer lookup is reachable under the write call's scope and forwards filters
  const customers = await toolCall("list_customers", { search: "KMJ" })
  assert(customers.items[0].id === "cust1" && customers.totalCount === 1, "T78: customer list returned")

  // T79 / V58: full-surface draft edit — number preserved, totals recomputed, server-owned rejected
  const noPut = await toolCall("update_invoice_draft", {
    invoiceId: "upd111", customerId: "cust1", issueDate: "2026-10-02", dueDate: "2026-10-31",
    items: [{ description: "Jasa", quantity: 1, unitPrice: 200000 }], total: 999,
  })
  assert(noPut.error === true && noPut.statusCode === 400 && put.body === undefined, "V58: injected total rejected before any PUT")

  const edited = await toolCall("update_invoice_draft", {
    invoiceId: "upd111", customerId: "cust1", issueDate: "2026-10-02", dueDate: "2026-10-31",
    items: [{ description: "Jasa revisi", quantity: 1, unitPrice: 200000 }], notes: "revisi",
  })
  assert(edited.subtotal === 200000 && edited.taxAmount === 22000 && edited.total === 222000, "V58: totals recomputed server-side")
  assert(put.body.invoiceNumber === "009/INV/OSB/X/2026", "V58: draft keeps its number")
  assert(put.body.notes === "revisi" && put.body.items[0].description === "Jasa revisi", "V58: replacement body sent")
  assert(!("status" in put.body) && !("subtotal" in put.body), "V58: request body carries no server-owned field")
  assert(
    path.isAbsolute(edited.path) && readFileSync(edited.path).subarray(0, 5).toString() === "%PDF-",
    "V58: regenerated PDF saved"
  )

  // V58: a non-draft never reaches the PUT
  const sent = await toolCall("update_invoice_draft", {
    invoiceId: "sent222", customerId: "cust1", issueDate: "2026-10-02", dueDate: "2026-10-31",
    items: [{ description: "Jasa", quantity: 1, unitPrice: 1 }],
  })
  assert(sent.error === true && sent.statusCode === 422 && put.count === 1, "V58: non-draft rejected locally")

  // V61: create → delete (by server-assigned number) → the row is gone
  const made2 = await toolCall("create_invoice_draft", {
    customerId: "cust1", dueDate: "2026-10-31", items: [{ description: "Jasa", quantity: 1, unitPrice: 1 }],
  })
  assert(made2.id === "newinv1" && made2.invoiceNumber === "001/INV/OSB/X/2026", "V61: draft created for delete")
  const goneBefore = await toolCall("get_invoice", { id: "newinv1" })
  assert(goneBefore.id === "newinv1", "V61: draft reachable before delete")
  const removed = await toolCall("delete_invoice_draft", { invoiceRef: "001/INV/OSB/X/2026" })
  assert(removed.deleted === true && removed.id === "newinv1", "V61: number resolved and row reported deleted")
  assert(removed.invoiceNumber === "001/INV/OSB/X/2026", "V61: response echoes the number")
  assert(deleted.count === 1, "V61: exactly one DELETE sent")
  const goneAfter = await toolCall("get_invoice", { id: "newinv1" })
  assert(goneAfter.error === true && goneAfter.statusCode === 500, "V61: row gone after delete")

  // V61: a non-draft is rejected locally — zero DELETE reaches the API
  const sentDel = await toolCall("delete_invoice_draft", { invoiceRef: "sent222" })
  assert(
    sentDel.error === true && sentDel.statusCode === 422 && deleted.count === 1,
    "V61: non-draft rejected locally, no DELETE sent"
  )

  rmSync(dir, { recursive: true, force: true })
  server.close()
  console.log("selfcheck ok")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
