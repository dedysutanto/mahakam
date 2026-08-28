import { prisma } from "./db"

// Sequential document-number generation with flexible format templates.
//
// Format tokens:
//   {000} / {00X} / {SEQ} / {SEQ:N}  — sequence number (width = digit count)
//   {YYYY}  — 4-digit year            {YY}  — 2-digit year
//   {MM}    — month zero-padded        {RM}  — month Roman numeral (I–XII)
//   {DD}    — day zero-padded
//
// Everything else in the template is literal text.
// Monthly reset: include {MM} or {RM} in the format.
// Yearly reset: omit month tokens.

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

function pad(n: number, width = 4): string {
  return String(n).padStart(width, '0')
}

function toRoman(n: number): string {
  return ROMAN[n - 1] || String(n)
}

function renderDateTokens(template: string, date: Date): string {
  return template
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{RM\}/g, toRoman(date.getMonth() + 1))
    .replace(/\{DD\}/g, String(date.getDate()).padStart(2, '0'))
}

function parseSequenceToken(format: string): { token: string; width: number; prefix: string; suffix: string } | null {
  const match = format.match(/\{(0+|X+|SEQ(?::\d+)?)\}/)
  if (!match) return null

  const token = match[0]
  let width = 4
  if (match[1] === 'SEQ') {
    width = 4
  } else if (match[1].startsWith('SEQ:')) {
    width = parseInt(match[1].slice(4)) || 4
  } else {
    width = match[1].length
  }

  const idx = format.indexOf(token)
  const prefix = format.slice(0, idx)
  const suffix = format.slice(idx + token.length)

  return { token, width, prefix, suffix }
}

async function getSetting(tenantId: string, key: string, fallback: string): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key } },
    select: { value: true },
  })
  return row?.value || fallback
}

const DEFAULTS: Record<string, string> = {
  invoice: '{000}/INV/{RM}/{YYYY}',
  expense: '{000}/EXP/{RM}/{YYYY}',
  purchase: '{000}/PUR/{RM}/{YYYY}',
  quotation: '{000}/QUO/{RM}/{YYYY}',
}

const LEGACY_PREFIX: Record<string, string> = {
  invoice: 'INV',
  expense: 'EXP',
  purchase: 'PUR',
  quotation: 'QUO',
}

export async function generateDocNumber(
  kind: 'invoice' | 'expense' | 'purchase' | 'quotation',
  tenantId: string
): Promise<string> {
  const delegates: Record<string, { model: any; field: string }> = {
    invoice: { model: prisma.invoice, field: 'invoiceNumber' },
    expense: { model: prisma.expense, field: 'expenseNumber' },
    purchase: { model: prisma.purchase, field: 'purchaseNumber' },
    quotation: { model: prisma.quotation, field: 'quotationNumber' },
  }

  const { model, field } = delegates[kind]

  // 1. Read format from settings
  let format = await getSetting(tenantId, `numbering_${kind}_format`, '')

  // 2. Backward compat: if no format setting, construct from legacy prefix/year/digits
  if (!format) {
    const prefix = await getSetting(tenantId, `numbering_${kind}_prefix`, LEGACY_PREFIX[kind])
    const includeYear = (await getSetting(tenantId, `numbering_${kind}_year`, 'true')) === 'true'
    const digits = parseInt(await getSetting(tenantId, `numbering_${kind}_digits`, '4'), 10) || 4
    const yearPart = includeYear ? '-{YYYY}-' : '-'
    const seqPad = '{' + '0'.repeat(digits) + '}'
    format = `${prefix}${yearPart}${seqPad}`
  }

  // 3. Fall back to new default if still empty
  if (!format) format = DEFAULTS[kind]

  // 4. Parse sequence token
  const parsed = parseSequenceToken(format)
  if (!parsed) {
    // No sequence token — return a simple fallback
    return `${LEGACY_PREFIX[kind]}-0001`
  }

  // 5. Render date tokens in prefix and suffix
  const now = new Date()
  const renderedPrefix = renderDateTokens(parsed.prefix, now)
  const renderedSuffix = renderDateTokens(parsed.suffix, now)

  // 6. Find the highest existing number with this context
  const last = await model.findFirst({
    where: {
      tenantId,
      [field]: { startsWith: renderedPrefix, endsWith: renderedSuffix },
    },
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  })

  // 7. Extract and increment sequence
  let seq = 1
  if (last) {
    const seqStr = last[field].slice(
      renderedPrefix.length,
      last[field].length - (renderedSuffix.length || 0),
    )
    seq = (parseInt(seqStr, 10) || 0) + 1
  }

  // 8. Collision loop
  const candidate = () => `${renderedPrefix}${pad(seq, parsed.width)}${renderedSuffix}`
  while (
    await model.findFirst({
      where: { tenantId, [field]: candidate() },
      select: { id: true },
    })
  ) {
    seq++
  }

  return candidate()
}
