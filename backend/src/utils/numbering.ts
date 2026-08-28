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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderTokens(template: string, date: Date, abbr: string): string {
  return template
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{RM\}/g, toRoman(date.getMonth() + 1))
    .replace(/\{DD\}/g, String(date.getDate()).padStart(2, '0'))
    .replace(/\{ABBR\}/g, abbr)
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

const DELEGATES: Record<string, { model: any; field: string; dateField: string }> = {
  invoice: { model: prisma.invoice, field: 'invoiceNumber', dateField: 'issueDate' },
  expense: { model: prisma.expense, field: 'expenseNumber', dateField: 'date' },
  purchase: { model: prisma.purchase, field: 'purchaseNumber', dateField: 'orderDate' },
  quotation: { model: prisma.quotation, field: 'quotationNumber', dateField: 'issueDate' },
}

export async function generateDocNumber(
  kind: 'invoice' | 'expense' | 'purchase' | 'quotation',
  tenantId: string
): Promise<string> {
  const { model, field, dateField } = DELEGATES[kind]

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
    return `${LEGACY_PREFIX[kind]}-0001`
  }

  // 5. Render tokens for the candidate
  const now = new Date()
  const abbr = await getSetting(tenantId, 'company_abbreviation', '')
  const renderedPrefix = renderTokens(parsed.prefix, now, abbr)
  const renderedSuffix = renderTokens(parsed.suffix, now, abbr)

  // 6. Build date filter based on reset context in the format
  const hasMonthToken = /\{(MM|RM)\}/.test(format)
  const hasYearToken = /\{(YYYY|YY)\}/.test(format)
  const dateFilter: any = {}
  if (hasMonthToken) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    dateFilter[dateField] = { gte: start, lte: end }
  } else if (hasYearToken) {
    const start = new Date(now.getFullYear(), 0, 1)
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    dateFilter[dateField] = { gte: start, lte: end }
  }
  // else: no date tokens → no date filter (find max across all)

  // 7. Find existing numbers in this date context
  const existing = await model.findMany({
    where: { tenantId, ...dateFilter },
    select: { [field]: true },
  })

  // 8. Extract sequence from matching numbers using date-context-anchored regex
  let seq = 1
  if (existing.length > 0) {
    // Build a date-context anchor from the format's date tokens
    const dateTokenRe = /\{(YYYY|YY|MM|RM|DD)\}/g
    const dateTokens: string[] = []
    let dm: RegExpExecArray | null
    while ((dm = dateTokenRe.exec(parsed.suffix)) !== null) {
      dateTokens.push(dm[0])
    }
    while ((dm = dateTokenRe.exec(parsed.prefix)) !== null) {
      dateTokens.push(dm[0])
    }
    const dateAnchor = dateTokens.length
      ? dateTokens.map(t => escapeRegex(renderTokens(t, now, abbr))).join('.*')
      : ''
    const seqPattern = parsed.token.replace(/[{}]/g, '')
      .replace(/0+/g, '\\d+')
      .replace(/X+/g, '\\d+')
      .replace(/SEQ(?::\d+)?/, '\\d+')
    const re = dateAnchor
      ? new RegExp(`^(${seqPattern}).*${dateAnchor}.*$`)
      : new RegExp(`^(${seqPattern})$`)
    // Try each invoice number — pick the highest matching sequence
    for (const row of existing) {
      const numStr = row[field] as string
      const m = numStr.match(re)
      if (m) {
        const s = (parseInt(m[1], 10) || 0) + 1
        if (s > seq) seq = s
      }
    }
  }

  // 9. Collision loop
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
