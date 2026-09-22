const BASE_URL = process.env.MAHAKAM_BASE_URL
const API_KEY = process.env.MAHAKAM_API_KEY

if (!BASE_URL) {
  console.error("MAHAKAM_BASE_URL env var required")
  process.exit(1)
}
if (!API_KEY) {
  console.error("MAHAKAM_API_KEY env var required")
  process.exit(1)
}

export const config = {
  baseUrl: BASE_URL.replace(/\/$/, ""),
  apiKey: API_KEY,
}
