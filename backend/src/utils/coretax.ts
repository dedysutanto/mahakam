import { prisma } from './db'

/**
 * Coretax e-Faktur (faktur pajak keluaran) XML export.
 *
 * Coretax only ingests XML (`TaxInvoiceBulk`); DJP's Excel template is merely an
 * input to a Windows converter .exe. Emitting the XML directly skips that step.
 * Field contract mirrors "Sample Faktur PK Template v.1.6.1" and the sample
 * TaxInvoiceBulk XML shipped in ConverterEfakturCoretax_v1.6.
 */

// Coretax kode transaksi. 01 = kepada selain Pemungut PPN (the normal case).
export const TRX_CODE = '01'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const digits = (s: string | null | undefined) => String(s || '').replace(/\D/g, '')

/**
 * Normalize a tax id to the 16-digit NPWP Coretax expects.
 *
 * 15-digit NPWP (XX.XXX.XXX.X-XXX.XXX) -> 16 digits for badan usaha by prepending
 * '0'; the legacy form has no check digit, so the leading zero is the whole
 * conversion (confirmed against DJP's NPWP 16-digit FAQ). Individuals already
 * have 16 digits, since their NPWP is the NIK. Returns '' when the value cannot
 * be a NPWP at all, so callers can fall back to the NIK branch instead of
 * emitting a fabricated identity.
 */
function normalizeNpwp(raw: string | null | undefined): string {
  const d = digits(raw)
  if (d.length === 16) return d
  if (d.length === 15) return `0${d}`
  return ''
}

// NITKU = 16-digit NPWP + 6-digit place-of-business code. 000000 = pusat (the
// registered head office), which is the correct default without branch data.
function idTku(npwp16: string): string {
  return `${npwp16}000000`
}

// Coretax wants fixed unit codes (UM.xxxx), we store free text. Unmapped units
// fall back to UM.0018 (Unit) — valid for any goods, never rejected.
const UNIT_CODES: Record<string, string> = {
  unit: 'UM.0018', pcs: 'UM.0021', piece: 'UM.0021', buah: 'UM.0021',
  set: 'UM.0019', lusin: 'UM.0017', dozen: 'UM.0017', roll: 'UM.0039', rol: 'UM.0039',
  kg: 'UM.0003', kilogram: 'UM.0003', gram: 'UM.0004', g: 'UM.0004',
  ton: 'UM.0001', liter: 'UM.0007', l: 'UM.0007', ml: 'UM.0007',
  m: 'UM.0013', meter: 'UM.0013', m2: 'UM.0012', m3: 'UM.0034',
  box: 'UM.0018', dus: 'UM.0018', pak: 'UM.0018', pack: 'UM.0018',
}

function unitCode(unit: string | null | undefined): string {
  return UNIT_CODES[String(unit || '').trim().toLowerCase()] || 'UM.0018'
}

const money = (n: unknown) => Math.round(Number(n) || 0)

function ymd(d: Date | string): string {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export interface CoretaxExportOptions {
  dateFrom?: string
  dateTo?: string
  ids?: string[]
}

/**
 * Build a Coretax TaxInvoiceBulk XML document for a tenant's issued invoices.
 * Drafts are excluded: a draft has no e-faktur obligation yet, and exporting one
 * would invite double-reporting after it is edited.
 */
export async function generateCoretaxXml(tenantId: string, opts: CoretaxExportOptions = {}): Promise<string> {
  const setting = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key: 'company_npwp' } },
    select: { value: true },
  })

  const where: any = { tenantId, status: { not: 'draft' } }
  if (opts.ids?.length) where.id = { in: opts.ids }
  if (opts.dateFrom || opts.dateTo) {
    where.issueDate = {}
    if (opts.dateFrom) where.issueDate.gte = new Date(opts.dateFrom)
    if (opts.dateTo) {
      const to = new Date(opts.dateTo)
      to.setHours(23, 59, 59, 999)
      where.issueDate.lte = to
    }
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: { items: true },
    orderBy: { issueDate: 'asc' },
  })
  if (invoices.length === 0) {
    throw Object.assign(new Error('Tidak ada faktur yang bisa diekspor pada rentang ini'), { statusCode: 422 })
  }

  return buildCoretaxXml(setting?.value, invoices)
}

/** Pure XML assembly — no DB access, so it can be exercised against fixtures. */
export function buildCoretaxXml(sellerNpwp: string | null | undefined, invoices: any[]): string {
  const sellerTin = normalizeNpwp(sellerNpwp)
  if (!sellerTin) {
    throw Object.assign(new Error('NPWP perusahaan belum diisi di Pengaturan'), { statusCode: 422 })
  }

  const docs = invoices.map((inv) => {
    const rate = Number(inv.taxRate) || 0
    // Coretax carries PPN per line; distribute the invoice-level tax so the line
    // sum equals Invoice.taxAmount exactly (last line absorbs the rounding).
    const lines = inv.items
    let allocated = 0

    const goods = lines.map((item, idx) => {
      const gross = Number(item.unitPrice) * Number(item.quantity)
      const discAmount = Math.round(gross * (Number(item.discount) || 0) / 100)
      const taxBase = money(item.lineTotal)
      const isLast = idx === lines.length - 1
      const vat = isLast
        ? money(inv.taxAmount) - allocated
        : Math.round(taxBase * rate / 100)
      allocated += vat

      return [
        '\t\t\t\t<GoodService>',
        `\t\t\t\t\t<Opt>A</Opt>`,
        `\t\t\t\t\t<Code>000000</Code>`,
        `\t\t\t\t\t<Name>${esc(item.description)}</Name>`,
        `\t\t\t\t\t<Unit>${unitCode(item.unit)}</Unit>`,
        `\t\t\t\t\t<Price>${money(item.unitPrice)}</Price>`,
        `\t\t\t\t\t<Qty>${Number(item.quantity) || 0}</Qty>`,
        `\t\t\t\t\t<TotalDiscount>${discAmount}</TotalDiscount>`,
        `\t\t\t\t\t<TaxBase>${taxBase}</TaxBase>`,
        `\t\t\t\t\t<OtherTaxBase>${taxBase}</OtherTaxBase>`,
        `\t\t\t\t\t<VATRate>${rate}</VATRate>`,
        `\t\t\t\t\t<VAT>${vat}</VAT>`,
        `\t\t\t\t\t<STLGRate>0</STLGRate>`,
        `\t\t\t\t\t<STLG>0</STLG>`,
        '\t\t\t\t</GoodService>',
      ].join('\n')
    })

    // A buyer with a usable NPWP/NIK goes in the TIN branch; otherwise Coretax
    // wants the individual branch (document type NIK) with no fabricated TIN.
    const buyerTin = normalizeNpwp(inv.customerTaxId)
    const hasNpwp = buyerTin !== ''

    return [
      '\t\t<TaxInvoice>',
      `\t\t\t<TaxInvoiceDate>${ymd(inv.issueDate)}</TaxInvoiceDate>`,
      '\t\t\t<TaxInvoiceOpt>Normal</TaxInvoiceOpt>',
      `\t\t\t<TrxCode>${TRX_CODE}</TrxCode>`,
      `\t\t\t<AddInfo/>`,
      `\t\t\t<CustomDoc/>`,
      `\t\t\t<CustomDocMonthYear/>`,
      `\t\t\t<RefDesc>${esc(inv.invoiceNumber)}</RefDesc>`,
      `\t\t\t<FacilityStamp/>`,
      `\t\t\t<SellerIDTKU>${idTku(sellerTin)}</SellerIDTKU>`,
      `\t\t\t<BuyerTin>${buyerTin}</BuyerTin>`,
      `\t\t\t<BuyerDocument>${hasNpwp ? 'TIN' : 'NIK'}</BuyerDocument>`,
      `\t\t\t<BuyerCountry>IND</BuyerCountry>`,
      `\t\t\t<BuyerDocumentNumber>${hasNpwp ? '' : esc(buyerTin)}</BuyerDocumentNumber>`,
      `\t\t\t<BuyerName>${esc(inv.customerName)}</BuyerName>`,
      `\t\t\t<BuyerAdress>${esc(inv.customerAddress || '')}</BuyerAdress>`,
      `\t\t\t<BuyerEmail>${esc(inv.customerEmail || '')}</BuyerEmail>`,
      `\t\t\t<BuyerIDTKU>${hasNpwp ? idTku(buyerTin) : ''}</BuyerIDTKU>`,
      '\t\t\t<ListOfGoodService>',
      ...goods,
      '\t\t\t</ListOfGoodService>',
      '\t\t</TaxInvoice>',
    ].join('\n')
  })

  return [
    '<?xml version="1.0" encoding="utf-8" ?>',
    '<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="TaxInvoice.xsd">',
    `\t<TIN>${sellerTin}</TIN>`,
    '\t<ListOfTaxInvoice>',
    ...docs,
    '\t</ListOfTaxInvoice>',
    '</TaxInvoiceBulk>',
  ].join('\n')
}
