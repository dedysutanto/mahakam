import { prisma } from "./db"

// Sequential document-number generation.
//
// Never derive sequences from row counts: deleting a mid-series row makes
// count+1 collide with an existing number. Instead take the highest existing
// sequence for this tenant+prefix and step past it, skipping anything taken.

function pad(n: number, width = 4): string {
  return String(n).padStart(width, '0')
}

function extractSeq(docNumber: string, prefix: string): number {
  const n = parseInt(docNumber.slice(prefix.length), 10)
  return isNaN(n) ? 0 : n
}

async function getSetting(tenantId: string, key: string, fallback: string): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key } },
    select: { value: true },
  })
  return row?.value || fallback
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
  const defaults: Record<string, { prefix: string; year: string; digits: string }> = {
    invoice: { prefix: 'INV', year: 'true', digits: '4' },
    expense: { prefix: 'EXP', year: 'true', digits: '4' },
    purchase: { prefix: 'PUR', year: 'true', digits: '4' },
    quotation: { prefix: 'QUO', year: 'true', digits: '4' },
  }

  const { model, field } = delegates[kind]
  const d = defaults[kind]

  const prefix = await getSetting(tenantId, `numbering_${kind}_prefix`, d.prefix)
  const includeYear = (await getSetting(tenantId, `numbering_${kind}_year`, d.year)) === 'true'
  const digits = parseInt(await getSetting(tenantId, `numbering_${kind}_digits`, d.digits), 10) || 4

  const yearPart = includeYear ? `${new Date().getFullYear()}-` : ''
  const seqPrefix = `${prefix}-${yearPart}`

  const last = await model.findFirst({
    where: { tenantId, [field]: { startsWith: seqPrefix } },
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  })

  let seq = last ? extractSeq(last[field], seqPrefix) + 1 : 1

  while (
    await model.findFirst({
      where: { tenantId, [field]: `${seqPrefix}${pad(seq, digits)}` },
      select: { id: true },
    })
  ) {
    seq++
  }

  return `${seqPrefix}${pad(seq, digits)}`
}