// T73 self-check — deterministic, local mock only (no network).
// V49: structured 403 · V52: id gate, absolute path, recap id-set hash · V53: no file on non-200/PDF
import assert from "node:assert"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const PDF = Buffer.from("%PDF-1.4 mock")

const server = createServer((req, res) => {
  if (req.url === "/api/invoices/good123/pdf") {
    res.writeHead(200, { "content-type": "application/pdf" }).end(PDF)
  } else if (req.url === "/api/invoices/miss999/pdf") {
    res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ message: "Faktur tidak ditemukan" }))
  } else if (req.url === "/api/invoices/noscope/pdf") {
    res.writeHead(403, { "content-type": "application/json" }).end("{}")
  } else if (req.url === "/api/invoices/recap" && req.method === "POST") {
    res.writeHead(200, { "content-type": "application/pdf" }).end(PDF)
  } else {
    res.writeHead(404).end()
  }
})

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
  const { ID_MSG, ID_RE, recapHash, savePdf } = await import("./pdf.js")

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

  rmSync(dir, { recursive: true, force: true })
  server.close()
  console.log("selfcheck ok")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
