import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { config } from "./config.js"
import { mahakamFetch, type MahakamError, type PdfResult } from "./client.js"

// V52 trust boundary: tool args flow into URL and filename.
export const ID_RE = /^[a-z0-9]+$/
export const ID_MSG = "Invalid id: only lowercase letters and digits allowed (a-z, 0-9)."

// V52: recap filename must distinguish id sets — same backend name, different documents.
export function recapHash(ids: string[]): string {
  return createHash("sha1")
    .update([...ids].sort().join(","))
    .digest("hex")
    .slice(0, 8)
}

// V52/V53: mkdir recursive, overwrite allowed, error results never touch disk.
export async function savePdf(filename: string, fetched: PdfResult) {
  if ("error" in fetched) return fetched
  await mkdir(config.pdfDir, { recursive: true })
  const filePath = path.resolve(config.pdfDir, filename)
  await writeFile(filePath, fetched.bytes)
  return { path: filePath, filename }
}

// V54: input is id (direct) or invoice number (exact list filter). Non-id input never
// touches the URL path or filename - only the querystring - resolved id is re-gated.
// Response must echo the requested number: guards against a backend without the filter
// (which would silently return an unrelated newest invoice).
export async function resolveInvoiceId(input: string): Promise<{ id: string } | MahakamError> {
  if (ID_RE.test(input)) return { id: input }
  const found = await mahakamFetch<{ data: { id: string; invoiceNumber: string }[] }>("/invoices", "faktur", {
    invoiceNumber: input,
    limit: "1",
  })
  if ("error" in found) return found
  const match = found.data.find((x) => x.invoiceNumber === input)
  if (!match) return { error: true, message: "Nomor faktur tidak ditemukan", statusCode: 404 }
  if (!ID_RE.test(match.id)) return { error: true, message: ID_MSG, statusCode: 400 }
  return { id: match.id }
}
