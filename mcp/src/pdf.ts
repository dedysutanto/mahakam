import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { config } from "./config.js"
import type { PdfResult } from "./client.js"

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
