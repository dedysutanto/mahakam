import PDFDocument from 'pdfkit'
import { prisma } from './db'
import { join } from 'path'
import { existsSync } from 'fs'
import { PassThrough } from 'stream'
import { terbilang } from './terbilang'

function currency(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateShort(d: Date | string): string {
  const dt = new Date(d)
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

async function getSetting(tenantId: string, key: string, fallback: string): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key } },
    select: { value: true },
  })
  return row?.value || fallback
}

type DesignName = 'clean' | 'professional' | 'elegant'

interface Theme {
  body: string
  bold: string
  titleSize: number
  title: string
  text: string
  muted: string
  line: string
  strongLine: string
  headerBg: string | null
  headerText: string
  zebra: string | null
  rowRule: string | null
  doubleRule: boolean
  boxedTotal: boolean
}

const THEMES: Record<DesignName, Theme> = {
  // Minimal: hairlines only, no fills, airy spacing
  clean: {
    body: 'Helvetica', bold: 'Helvetica-Bold', titleSize: 22,
    title: '#111827', text: '#111827', muted: '#9CA3AF',
    line: '#F3F4F6', strongLine: '#111827',
    headerBg: null, headerText: '#111827',
    zebra: null, rowRule: '#F3F4F6', doubleRule: false, boxedTotal: false,
  },
  // Structured corporate: dark filled table header, striped rows
  professional: {
    body: 'Helvetica', bold: 'Helvetica-Bold', titleSize: 24,
    title: '#1F2937', text: '#111827', muted: '#6B7280',
    line: '#D1D5DB', strongLine: '#1F2937',
    headerBg: '#1F2937', headerText: '#FFFFFF',
    zebra: '#F3F4F6', rowRule: null, doubleRule: false, boxedTotal: false,
  },
  // Classic serif with warm gold accents
  elegant: {
    body: 'Times-Roman', bold: 'Times-Bold', titleSize: 26,
    title: '#1F2937', text: '#1F2937', muted: '#8B7355',
    line: '#E5DCC8', strongLine: '#8B7355',
    headerBg: null, headerText: '#8B7355',
    zebra: '#FAF7F0', rowRule: '#EFE8D8', doubleRule: true, boxedTotal: true,
  },
}

const PAGE = { left: 50, right: 545, top: 50, bottomLimit: 720 }
const W = PAGE.right - PAGE.left

// Column geometry — every numeric column shares the right edge chain, last ends at PAGE.right
const colDesc = { x: PAGE.left + 4, w: 246 }
const colQty = { x: 272, w: 48 }
const colPrice = { x: 326, w: 82 }
const colDisc = { x: 412, w: 64 }
const colTotal = { x: PAGE.right - 94, w: 94 }

function rule(doc: PDFKit.PDFDocument, y: number, x1: number, x2: number, color: string, width = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(width).strokeColor(color).stroke().restore()
}

type InvoiceFull = NonNullable<Awaited<ReturnType<typeof fetchInvoiceFull>>>

function fetchInvoiceFull(invoiceId: string, tenantId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { items: { include: { product: true } }, payments: true, customer: true },
  })
}

// Renders one full invoice (header, table, totals, notes) onto the given doc.
// Shared by standalone faktur PDF and the recap appendix.
async function renderInvoiceInto(doc: PDFKit.PDFDocument, invoice: InvoiceFull, tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  const companyName = tenant?.name || 'Perusahaan'

  const designRaw = await getSetting(tenantId, 'invoice_pdf_design', 'professional')
  const t = THEMES[(designRaw as DesignName)] || THEMES.professional

  const [companyAddress, companyCity, companyProvince, companyCountry, companyNpwp, companyPhone, companyEmail] = await Promise.all([
    getSetting(tenantId, 'company_address', ''),
    getSetting(tenantId, 'company_city', ''),
    getSetting(tenantId, 'company_province', ''),
    getSetting(tenantId, 'company_country', ''),
    getSetting(tenantId, 'company_npwp', ''),
    getSetting(tenantId, 'company_phone', ''),
    getSetting(tenantId, 'company_email', ''),
  ])
  const templateNote = await getSetting(tenantId, 'invoice_template_note', '')
  const templateTerms = await getSetting(tenantId, 'invoice_template_terms', '')
  const [bankName, bankAccountNumber, bankAccountHolder] = await Promise.all([
    getSetting(tenantId, 'bank_name', ''),
    getSetting(tenantId, 'bank_account_number', ''),
    getSetting(tenantId, 'bank_account_holder', ''),
  ])

  // ---------- header ----------
  let leftBottom = PAGE.top
  if (tenant?.logoPath) {
    const logoAbs = join(process.cwd(), 'uploads', 'logos', tenant.logoPath)
    if (existsSync(logoAbs)) {
      try {
        doc.image(logoAbs, PAGE.left, PAGE.top, { fit: [110, 55] })
        leftBottom += 62
      } catch {}
    }
  }

  doc.font(t.bold).fontSize(15).fillColor(t.title)
    .text(companyName, PAGE.left, leftBottom + (tenant?.logoPath ? 2 : 10), { width: 290 })
  const detailLines = [
    [companyAddress, companyCity, companyProvince, companyCountry].filter(Boolean).join(', '),
    companyNpwp ? `NPWP: ${companyNpwp}` : '',
    [companyPhone, companyEmail].filter(Boolean).join(' · '),
  ].filter(Boolean)
  doc.fontSize(8).font(t.body).fillColor(t.muted)
  for (const line of detailLines) {
    doc.text(line, PAGE.left, doc.y + 2, { width: 290 }) // width-bounded so it never collides with the title block
  }
  leftBottom = Math.max(doc.y, leftBottom)

  // Right-side title + meta
  const metaX = 340
  const metaW = PAGE.right - metaX
  doc.font(t.bold).fontSize(t.titleSize).fillColor(t.title)
    .text('FAKTUR', metaX, PAGE.top, { width: metaW, align: 'right' })

  let metaY = doc.y + 6
  doc.font(t.body).fontSize(10).fillColor(t.muted)
    .text(invoice.invoiceNumber, metaX, metaY, { width: metaW, align: 'right' })
  metaY += 16

  const statusColors: Record<string, string> = {
    draft: '#6B7280', sent: '#2563EB', partial: '#D97706', paid: '#059669', overdue: '#DC2626',
  }
  doc.font(t.bold).fontSize(8).fillColor(statusColors[invoice.status] || t.muted)
    .text(invoice.status.toUpperCase(), metaX, metaY, { width: metaW, align: 'right', characterSpacing: 1 })
  metaY += 18

  doc.fontSize(9)
  doc.font(t.body).fillColor(t.muted)
  doc.text('Tanggal Terbit', metaX, metaY, { width: metaW / 2, align: 'left' })
  doc.font(t.body).fillColor(t.text)
  doc.text(formatDate(invoice.issueDate), metaX + metaW / 2, metaY, { width: metaW / 2, align: 'right' })
  metaY += 15
  doc.font(t.body).fillColor(t.muted)
  doc.text('Jatuh Tempo', metaX, metaY, { width: metaW / 2, align: 'left' })
  doc.font(t.body).fillColor(t.text)
  doc.text(formatDate(invoice.dueDate), metaX + metaW / 2, metaY, { width: metaW / 2, align: 'right' })
  metaY += 14

  // Divider — style depends on theme
  const dividerY = Math.max(leftBottom, metaY) + 18
  if (t.doubleRule) {
    rule(doc, dividerY, PAGE.left, PAGE.right, t.strongLine, 1)
    rule(doc, dividerY + 3, PAGE.left, PAGE.right, t.strongLine, 0.5)
  } else {
    rule(doc, dividerY, PAGE.left, PAGE.right, t.line, 1)
  }

  // ---------- bill to ----------
  let y = dividerY + 18
  doc.font(t.bold).fontSize(8).fillColor(t.muted)
    .text('DITAGIHKAN KEPADA', PAGE.left, y, { characterSpacing: 1 })
  y = doc.y + 6
  doc.font(t.bold).fontSize(11).fillColor(t.title)
    .text(invoice.customerName || '-', PAGE.left, y, { width: 300 })
  y = doc.y + 2
  doc.font(t.body).fontSize(9).fillColor(t.text)
  const billAddress = [invoice.customerAddress, invoice.customerProvince, invoice.customerCountry].filter(Boolean).join(', ')
  for (const line of [invoice.customerEmail, invoice.customerPhone, billAddress].filter(Boolean) as string[]) {
    doc.text(line, PAGE.left, y, { width: 300 })
    y = doc.y + 2
  }
  y += 12

  // ---------- items table ----------
  const hasAnyDiscount = invoice.items.some((item: typeof invoice.items[number]) => (Number(item.discount) || 0) > 0)
  const effectiveColTotal = hasAnyDiscount ? colTotal : { x: colDisc.x, w: PAGE.right - colDisc.x }

  const drawTableHeader = (rowY: number): number => {
    if (t.headerBg) {
      doc.save().rect(PAGE.left, rowY, W, 22).fill(t.headerBg).restore()
      doc.font(t.bold).fontSize(8).fillColor(t.headerText)
      doc.text('Item', colDesc.x, rowY + 7, { width: colDesc.w })
      doc.text('Qty', colQty.x, rowY + 7, { width: colQty.w, align: 'right' })
      doc.text('Harga', colPrice.x, rowY + 7, { width: colPrice.w, align: 'right' })
      if (hasAnyDiscount) doc.text('Diskon', colDisc.x, rowY + 7, { width: colDisc.w, align: 'right' })
      doc.text('Total', effectiveColTotal.x, rowY + 7, { width: effectiveColTotal.w, align: 'right' })
      return rowY + 22
    }
    doc.font(t.bold).fontSize(8).fillColor(t.headerText === t.title ? t.title : t.headerText)
    doc.text('ITEM', colDesc.x, rowY, { width: colDesc.w, characterSpacing: 0.5 })
    doc.text('QTY', colQty.x, rowY, { width: colQty.w, align: 'right', characterSpacing: 0.5 })
    doc.text('HARGA', colPrice.x, rowY, { width: colPrice.w, align: 'right', characterSpacing: 0.5 })
    if (hasAnyDiscount) doc.text('DISKON', colDisc.x, rowY, { width: colDisc.w, align: 'right', characterSpacing: 0.5 })
    doc.text('TOTAL', effectiveColTotal.x, rowY, { width: effectiveColTotal.w, align: 'right', characterSpacing: 0.5 })
    if (t.doubleRule) {
      rule(doc, rowY + 15, PAGE.left, PAGE.right, t.strongLine, 1)
      rule(doc, rowY + 18, PAGE.left, PAGE.right, t.strongLine, 0.5)
      return rowY + 26
    }
    rule(doc, rowY + 15, PAGE.left, PAGE.right, t.strongLine, 1)
    return rowY + 22
  }

  let rowY = Math.max(y + 6, dividerY + 90)
  rowY = drawTableHeader(rowY)

  doc.font(t.body).fontSize(9).fillColor(t.text)
  invoice.items.forEach((item: typeof invoice.items[number], idx: number) => {
    const descH = doc.heightOfString(item.description || '-', { width: colDesc.w })
    const rowH = Math.max(20, descH + 10)

    if (rowY + rowH > PAGE.bottomLimit) {
      doc.addPage()
      rowY = PAGE.top
      rowY = drawTableHeader(rowY)
      doc.font(t.body).fontSize(9).fillColor(t.text)
    }

    if (t.zebra && idx % 2 === 1) {
      doc.save().rect(PAGE.left, rowY, W, rowH).fill(t.zebra).restore()
      doc.font(t.body).fontSize(9)
    }

    const textY = rowY + 5
    doc.fillColor(t.text)
    doc.text(item.description || '-', colDesc.x, textY, { width: colDesc.w })
    doc.text(`${Number(item.quantity)} ${item.unit || item.product?.unit || ''}`, colQty.x, textY, { width: colQty.w, align: 'right' })
    doc.text(currency(Number(item.unitPrice)), colPrice.x, textY, { width: colPrice.w, align: 'right' })
    if (hasAnyDiscount) {
      doc.text(
        (Number(item.discount) || 0) > 0 ? `-${Number(item.discount)}%` : '-',
        colDisc.x, textY, { width: colDisc.w, align: 'right' }
      )
    }
    doc.font(t.body).fillColor(t.text)
    doc.text(currency(Number(item.lineTotal)), effectiveColTotal.x, textY, { width: effectiveColTotal.w, align: 'right' })

    if (t.rowRule) rule(doc, rowY + rowH, PAGE.left, PAGE.right, t.rowRule, 0.5)
    rowY += rowH
  })

  // ---------- totals ----------
  if (rowY + 130 > PAGE.bottomLimit) { doc.addPage(); rowY = PAGE.top }
  rowY += 12
  rule(doc, rowY, PAGE.left, PAGE.right, t.line, 0.5)
  rowY += 10

  const labelBox = { x: 300, w: 140 }
  const valueBox = { x: 450, w: PAGE.right - 450 }

  const totalRow = (label: string, value: string, opts: { size?: number; bold?: boolean; color?: string } = {}) => {
    const size = opts.size ?? 9
    const fnt = opts.bold ? t.bold : t.body
    doc.font(fnt).fontSize(size).fillColor(opts.color || t.text)
    doc.text(label, labelBox.x, rowY, { width: labelBox.w, align: 'right' })
    doc.text(value, valueBox.x, rowY, { width: valueBox.w, align: 'right' })
    rowY += size + 8
  }

  totalRow('Subtotal', currency(Number(invoice.subtotal)))
  if (Number(invoice.discount || 0) > 0) {
    totalRow('Diskon', `-${currency(Number(invoice.discount))}`)
  }
  totalRow(`PPN (${Number(invoice.taxRate)}%)`, currency(Number(invoice.taxAmount)))

  rowY += 2
  if (t.boxedTotal) {
    const boxH = 30
    doc.save()
      .rect(labelBox.x - 8, rowY, PAGE.right - labelBox.x + 16, boxH)
      .fillColor('#FFFFFF')
      .lineWidth(1).strokeColor(t.strongLine)
      .rect(labelBox.x - 8, rowY, PAGE.right - labelBox.x + 16, boxH)
      .stroke()
      .restore()
    doc.font(t.bold).fontSize(13).fillColor(t.title)
    doc.text('TOTAL', labelBox.x - 2, rowY + 8, { width: labelBox.w, align: 'right' })
    doc.text(currency(Number(invoice.total)), valueBox.x, rowY + 8, { width: valueBox.w, align: 'right' })
    rowY += boxH + 4
  } else {
    rule(doc, rowY, labelBox.x - 8, PAGE.right, t.strongLine, 0.75)
    rowY += 6
    totalRow('Total', currency(Number(invoice.total)), { size: 13, bold: true, color: t.title })
  }

  if (Number(invoice.amountPaid || 0) > 0) {
    if (rowY + 40 > PAGE.bottomLimit) { doc.addPage(); rowY = PAGE.top }
    rowY += 2
    totalRow('Dibayar', currency(Number(invoice.amountPaid)), { color: '#059669' })
    const remaining = Number(invoice.total) - Number(invoice.amountPaid)
    if (remaining > 0) {
      totalRow('Sisa', currency(remaining), { bold: true, color: '#DC2626' })
    }
  }

  // ---------- notes / terms ----------
  const finalNotes = [templateNote, invoice.notes].filter(Boolean).join('\n')
  const finalTerms = [templateTerms, invoice.terms].filter(Boolean).join('\n')

  const sectionBlock = (title: string, content: string) => {
    if (rowY > PAGE.bottomLimit) { doc.addPage(); rowY = PAGE.top }
    rowY += 10
    doc.font(t.bold).fontSize(8).fillColor(t.muted)
      .text(title.toUpperCase(), PAGE.left, rowY, { characterSpacing: 1 })
    rowY = doc.y + 4
    doc.font(t.body).fontSize(9).fillColor(t.text)
    doc.text(content, PAGE.left, rowY, { width: 460 })
    rowY = doc.y + 2
  }
  if (finalNotes) sectionBlock('Catatan', finalNotes)
  if (finalTerms) sectionBlock('Syarat & Ketentuan', finalTerms)

  // ---------- bank info ----------
  if (bankName || bankAccountNumber || bankAccountHolder) {
    if (rowY > PAGE.bottomLimit) { doc.addPage(); rowY = PAGE.top }
    rowY += 10
    doc.font(t.bold).fontSize(8).fillColor(t.muted)
      .text('PEMBAYARAN', PAGE.left, rowY, { characterSpacing: 1 })
    rowY = doc.y + 4
    doc.font(t.body).fontSize(9).fillColor(t.text)
      .text('Mohon transfer ke rekening berikut:', PAGE.left, rowY, { width: 460 })
    rowY = doc.y + 6

    const bankRows: Array<[string, string]> = [
      ['Nama Bank', bankName],
      ['No. Rekening', bankAccountNumber],
      ['Atas Nama', bankAccountHolder],
    ]
    for (const [label, value] of bankRows.filter(([, v]) => v)) {
      doc.font(t.bold).fontSize(9).fillColor(t.muted)
        .text(`${label}:`, PAGE.left + 10, rowY, { width: 100 })
      doc.font(t.body).fontSize(9).fillColor(t.text)
        .text(value, PAGE.left + 110, rowY, { width: 350 })
      rowY = doc.y + 2
    }
  }

}

export async function generateInvoicePdf(invoiceId: string, tenantId: string): Promise<Buffer> {
  const invoice = await fetchInvoiceFull(invoiceId, tenantId)
  if (!invoice) throw new Error('Faktur tidak ditemukan')

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const passThrough = new PassThrough()
  doc.pipe(passThrough)

  await renderInvoiceInto(doc, invoice, tenantId)

  doc.end()

  return new Promise((resolve, reject) => {
    const bufs: Buffer[] = []
    passThrough.on('data', (c: Buffer) => bufs.push(c))
    passThrough.on('end', () => resolve(Buffer.concat(bufs)))
    passThrough.on('error', reject)
  })
}

export async function generateQuotationPdf(quotationId: string, tenantId: string): Promise<Buffer> {
  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, tenantId },
    include: { items: { include: { product: true } }, customer: true },
  })
  if (!quotation) throw new Error('Penawaran tidak ditemukan')

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  const companyName = tenant?.name || 'Perusahaan'

  const designRaw = await getSetting(tenantId, 'invoice_pdf_design', 'professional')
  const t = THEMES[(designRaw as DesignName)] || THEMES.professional

  const [companyAddress, companyCity, companyProvince, companyCountry, companyNpwp, companyPhone, companyEmail] = await Promise.all([
    getSetting(tenantId, 'company_address', ''),
    getSetting(tenantId, 'company_city', ''),
    getSetting(tenantId, 'company_province', ''),
    getSetting(tenantId, 'company_country', ''),
    getSetting(tenantId, 'company_npwp', ''),
    getSetting(tenantId, 'company_phone', ''),
    getSetting(tenantId, 'company_email', ''),
  ])
  const templateNote = await getSetting(tenantId, 'quotation_template_note', '')

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const passThrough = new PassThrough()
  doc.pipe(passThrough)

  // ---------- header ----------
  let leftBottom = PAGE.top
  if (tenant?.logoPath) {
    const logoAbs = join(process.cwd(), 'uploads', 'logos', tenant.logoPath)
    if (existsSync(logoAbs)) {
      try {
        doc.image(logoAbs, PAGE.left, PAGE.top, { fit: [110, 55] })
        leftBottom += 62
      } catch {}
    }
  }

  doc.font(t.bold).fontSize(15).fillColor(t.title)
    .text(companyName, PAGE.left, leftBottom + (tenant?.logoPath ? 2 : 10), { width: 290 })
  const detailLines = [
    [companyAddress, companyCity, companyProvince, companyCountry].filter(Boolean).join(', '),
    companyNpwp ? `NPWP: ${companyNpwp}` : '',
    [companyPhone, companyEmail].filter(Boolean).join(' · '),
  ].filter(Boolean)
  doc.fontSize(8).font(t.body).fillColor(t.muted)
  for (const line of detailLines) {
    doc.text(line, PAGE.left, doc.y + 2, { width: 290 })
  }
  leftBottom = Math.max(doc.y, leftBottom)

  // Right-side title + meta
  const metaX = 340
  const metaW = PAGE.right - metaX
  doc.font(t.bold).fontSize(t.titleSize).fillColor(t.title)
    .text('PENAWARAN', metaX, PAGE.top, { width: metaW, align: 'right' })

  let metaY = doc.y + 6
  doc.font(t.body).fontSize(10).fillColor(t.muted)
    .text(quotation.quotationNumber, metaX, metaY, { width: metaW, align: 'right' })
  metaY += 16

  const statusColors: Record<string, string> = {
    draft: '#6B7280', sent: '#2563EB', accepted: '#059669', rejected: '#DC2626', converted: '#7C3AED',
  }
  doc.font(t.bold).fontSize(8).fillColor(statusColors[quotation.status] || t.muted)
    .text(quotation.status.toUpperCase(), metaX, metaY, { width: metaW, align: 'right', characterSpacing: 1 })
  metaY += 18

  doc.fontSize(9)
  doc.font(t.body).fillColor(t.muted)
  doc.text('Tanggal', metaX, metaY, { width: metaW / 2, align: 'left' })
  doc.font(t.body).fillColor(t.text)
  doc.text(formatDate(quotation.issueDate), metaX + metaW / 2, metaY, { width: metaW / 2, align: 'right' })
  metaY += 15
  doc.font(t.body).fillColor(t.muted)
  doc.text('Berlaku Hingga', metaX, metaY, { width: metaW / 2, align: 'left' })
  doc.font(t.body).fillColor(t.text)
  doc.text(
    quotation.validUntil ? formatDate(quotation.validUntil) : '-',
    metaX + metaW / 2, metaY, { width: metaW / 2, align: 'right' }
  )
  metaY += 14

  const dividerY = Math.max(leftBottom, metaY) + 18
  if (t.doubleRule) {
    rule(doc, dividerY, PAGE.left, PAGE.right, t.strongLine, 1)
    rule(doc, dividerY + 3, PAGE.left, PAGE.right, t.strongLine, 0.5)
  } else {
    rule(doc, dividerY, PAGE.left, PAGE.right, t.line, 1)
  }

  // ---------- bill to ----------
  let y = dividerY + 18
  doc.font(t.bold).fontSize(8).fillColor(t.muted)
    .text('DITAWARKAN KEPADA', PAGE.left, y, { characterSpacing: 1 })
  y = doc.y + 6
  doc.font(t.bold).fontSize(11).fillColor(t.title)
    .text(quotation.customerName || '-', PAGE.left, y, { width: 300 })
  y = doc.y + 2
  doc.font(t.body).fontSize(9).fillColor(t.text)
  const billAddress = [quotation.customerAddress, quotation.customerProvince, quotation.customerCountry].filter(Boolean).join(', ')
  for (const line of [quotation.customerEmail, quotation.customerPhone, billAddress].filter(Boolean) as string[]) {
    doc.text(line, PAGE.left, y, { width: 300 })
    y = doc.y + 2
  }
  y += 12

  // ---------- items table ----------
  const hasAnyDiscount = quotation.items.some((item: typeof quotation.items[number]) => (Number(item.discount) || 0) > 0)
  const effectiveColTotal = hasAnyDiscount ? colTotal : { x: colDisc.x, w: PAGE.right - colDisc.x }

  const drawTableHeader = (rowY: number): number => {
    if (t.headerBg) {
      doc.save().rect(PAGE.left, rowY, W, 22).fill(t.headerBg).restore()
      doc.font(t.bold).fontSize(8).fillColor(t.headerText)
      doc.text('Item', colDesc.x, rowY + 7, { width: colDesc.w })
      doc.text('Qty', colQty.x, rowY + 7, { width: colQty.w, align: 'right' })
      doc.text('Harga', colPrice.x, rowY + 7, { width: colPrice.w, align: 'right' })
      if (hasAnyDiscount) doc.text('Diskon', colDisc.x, rowY + 7, { width: colDisc.w, align: 'right' })
      doc.text('Total', effectiveColTotal.x, rowY + 7, { width: effectiveColTotal.w, align: 'right' })
      return rowY + 22
    }
    doc.font(t.bold).fontSize(8).fillColor(t.headerText === t.title ? t.title : t.headerText)
    doc.text('ITEM', colDesc.x, rowY, { width: colDesc.w, characterSpacing: 0.5 })
    doc.text('QTY', colQty.x, rowY, { width: colQty.w, align: 'right', characterSpacing: 0.5 })
    doc.text('HARGA', colPrice.x, rowY, { width: colPrice.w, align: 'right', characterSpacing: 0.5 })
    if (hasAnyDiscount) doc.text('DISKON', colDisc.x, rowY, { width: colDisc.w, align: 'right', characterSpacing: 0.5 })
    doc.text('TOTAL', effectiveColTotal.x, rowY, { width: effectiveColTotal.w, align: 'right', characterSpacing: 0.5 })
    if (t.doubleRule) {
      rule(doc, rowY + 15, PAGE.left, PAGE.right, t.strongLine, 1)
      rule(doc, rowY + 18, PAGE.left, PAGE.right, t.strongLine, 0.5)
      return rowY + 26
    }
    rule(doc, rowY + 15, PAGE.left, PAGE.right, t.strongLine, 1)
    return rowY + 22
  }

  let rowY = Math.max(y + 6, dividerY + 90)
  rowY = drawTableHeader(rowY)

  doc.font(t.body).fontSize(9).fillColor(t.text)
  quotation.items.forEach((item: typeof quotation.items[number], idx: number) => {
    const descH = doc.heightOfString(item.description || '-', { width: colDesc.w })
    const rowH = Math.max(20, descH + 10)

    if (rowY + rowH > PAGE.bottomLimit) {
      doc.addPage()
      rowY = PAGE.top
      rowY = drawTableHeader(rowY)
      doc.font(t.body).fontSize(9).fillColor(t.text)
    }

    if (t.zebra && idx % 2 === 1) {
      doc.save().rect(PAGE.left, rowY, W, rowH).fill(t.zebra).restore()
      doc.font(t.body).fontSize(9)
    }

    const textY = rowY + 5
    doc.fillColor(t.text)
    doc.text(item.description || '-', colDesc.x, textY, { width: colDesc.w })
    doc.text(`${Number(item.quantity)} ${item.unit || item.product?.unit || ''}`, colQty.x, textY, { width: colQty.w, align: 'right' })
    doc.text(currency(Number(item.unitPrice)), colPrice.x, textY, { width: colPrice.w, align: 'right' })
    if (hasAnyDiscount) {
      doc.text(
        (Number(item.discount) || 0) > 0 ? `-${Number(item.discount)}%` : '-',
        colDisc.x, textY, { width: colDisc.w, align: 'right' }
      )
    }
    doc.font(t.body).fillColor(t.text)
    doc.text(currency(Number(item.lineTotal)), effectiveColTotal.x, textY, { width: effectiveColTotal.w, align: 'right' })

    if (t.rowRule) rule(doc, rowY + rowH, PAGE.left, PAGE.right, t.rowRule, 0.5)
    rowY += rowH
  })

  // ---------- totals ----------
  if (rowY + 130 > PAGE.bottomLimit) { doc.addPage(); rowY = PAGE.top }
  rowY += 12
  rule(doc, rowY, PAGE.left, PAGE.right, t.line, 0.5)
  rowY += 10

  const labelBox = { x: 300, w: 140 }
  const valueBox = { x: 450, w: PAGE.right - 450 }

  const totalRow = (label: string, value: string, opts: { size?: number; bold?: boolean; color?: string } = {}) => {
    const size = opts.size ?? 9
    const fnt = opts.bold ? t.bold : t.body
    doc.font(fnt).fontSize(size).fillColor(opts.color || t.text)
    doc.text(label, labelBox.x, rowY, { width: labelBox.w, align: 'right' })
    doc.text(value, valueBox.x, rowY, { width: valueBox.w, align: 'right' })
    rowY += size + 8
  }

  totalRow('Subtotal', currency(Number(quotation.subtotal)))
  if (Number(quotation.discount || 0) > 0) {
    totalRow('Diskon', `-${currency(Number(quotation.discount))}`)
  }
  totalRow(`PPN (${Number(quotation.taxRate)}%)`, currency(Number(quotation.taxAmount)))

  rowY += 2
  if (t.boxedTotal) {
    const boxH = 30
    doc.save()
      .rect(labelBox.x - 8, rowY, PAGE.right - labelBox.x + 16, boxH)
      .lineWidth(1).strokeColor(t.strongLine)
      .rect(labelBox.x - 8, rowY, PAGE.right - labelBox.x + 16, boxH)
      .stroke()
      .restore()
    doc.font(t.bold).fontSize(13).fillColor(t.title)
    doc.text('TOTAL', labelBox.x - 2, rowY + 8, { width: labelBox.w, align: 'right' })
    doc.text(currency(Number(quotation.total)), valueBox.x, rowY + 8, { width: valueBox.w, align: 'right' })
    rowY += boxH + 4
  } else {
    rule(doc, rowY, labelBox.x - 8, PAGE.right, t.strongLine, 0.75)
    rowY += 6
    totalRow('Total', currency(Number(quotation.total)), { size: 13, bold: true, color: t.title })
  }

  // ---------- notes / terms ----------
  const finalNotes = [templateNote, quotation.notes].filter(Boolean).join('\n')
  const finalTerms = quotation.terms || ''

  const sectionBlock = (title: string, content: string) => {
    if (rowY > PAGE.bottomLimit) { doc.addPage(); rowY = PAGE.top }
    rowY += 10
    doc.font(t.bold).fontSize(8).fillColor(t.muted)
      .text(title.toUpperCase(), PAGE.left, rowY, { characterSpacing: 1 })
    rowY = doc.y + 4
    doc.font(t.body).fontSize(9).fillColor(t.text)
    doc.text(content, PAGE.left, rowY, { width: 460 })
    rowY = doc.y + 2
  }
  if (finalNotes) sectionBlock('Catatan', finalNotes)
  if (finalTerms) sectionBlock('Syarat & Ketentuan', finalTerms)

  doc.end()

  return new Promise((resolve, reject) => {
    const bufs: Buffer[] = []
    passThrough.on('data', (c: Buffer) => bufs.push(c))
    passThrough.on('end', () => resolve(Buffer.concat(bufs)))
    passThrough.on('error', reject)
  })
}

// Recap / surat tagihan: selected invoices of ONE client, matching the
// manual paper form (header, invoice table, totals, terbilang, bank info).
export async function generateRecapPdf(invoiceIds: string[], tenantId: string): Promise<Buffer> {
  if (!invoiceIds.length) throw new Error('Pilih minimal satu faktur')

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds }, tenantId },
    include: { items: { include: { product: true } }, payments: true, customer: true },
    orderBy: { issueDate: 'asc' },
  })
  if (invoices.length !== invoiceIds.length) throw new Error('Beberapa faktur tidak ditemukan')

  const hasDraft = invoices.some((i: typeof invoices[number]) => i.status === 'draft')
  if (hasDraft) throw new Error('Faktur berstatus draft tidak dapat dimasukkan ke rekap')

  const customerIds = new Set(invoices.map((i: typeof invoices[number]) => i.customerId))
  if (customerIds.size > 1) throw new Error('Semua faktur harus milik satu pelanggan yang sama')

  const client = invoices[0]

  const [bankName, bankAccountNumber, bankAccountHolder] = await Promise.all([
    getSetting(tenantId, 'bank_name', ''),
    getSetting(tenantId, 'bank_account_number', ''),
    getSetting(tenantId, 'bank_account_holder', ''),
  ])

  const totalJumlah = invoices.reduce((s: number, i: typeof invoices[number]) => s + Number(i.total), 0)
  const totalSaldo = invoices.reduce((s: number, i: typeof invoices[number]) => s + Math.max(Number(i.total) - Number(i.amountPaid || 0), 0), 0)

  // "Berdasarkan Pemesanan Bulan Agustus 2026" — derived from the earliest picked invoice
  const firstDate = invoices[0].issueDate
  const monthLabel = new Date(firstDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const passThrough = new PassThrough()
  doc.pipe(passThrough)

  const L = PAGE.left, R = PAGE.right

  // Company logo (optional)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  let y = PAGE.top
  if (tenant?.logoPath) {
    const logoAbs = join(process.cwd(), 'uploads', 'logos', tenant.logoPath)
    if (existsSync(logoAbs)) {
      try {
        doc.image(logoAbs, L, PAGE.top, { fit: [110, 55] })
        y += 62
      } catch {}
    }
  }

  // Title
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827')
    .text('Billing Statement', L, y, { width: W, align: 'center' })

  y = Math.max(doc.y, y + 24) + 16

  // Header info rows
  const dayName = new Date().toLocaleDateString('id-ID', { weekday: 'long' })
  const dateStr = formatDateShort(new Date())
  const rows: Array<[string, string]> = [
    ['Kepada YTH', client.customer?.name || client.customerName || '-'],
    ['Telephone/Mobile', client.customer?.phone || client.customerPhone || '-'],
    ['Tanggal', `${dayName}, ${dateStr}`],
  ]
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
    doc.text(label, L, y, { width: 200 })
    doc.text(':', L + 205, y)
    doc.font('Helvetica-Bold').text(value, L + 215, y, { width: R - L - 215 })
    y = Math.max(doc.y, y + 16) + 4
  }
  y += 14

  // Invoice table — Klien column removed (recap is single-client by rule);
  // Number column widened; rows are wrap-aware so long numbering patterns
  // never overlap the next row
  const colNum = { x: L, w: 190 }
  const colJml = { x: R - 300, w: 110 }
  const colSaldo = { x: R - 190, w: 110 }
  const colTgl = { x: R - 75, w: 75 }

  const tableHeaderY = y
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827')
  doc.text('Number', colNum.x, tableHeaderY, { width: colNum.w })
  doc.text('Jumlah', colJml.x, tableHeaderY, { width: colJml.w, align: 'right' })
  doc.text('Saldo', colSaldo.x, tableHeaderY, { width: colSaldo.w, align: 'right' })
  doc.text('Tanggal', colTgl.x, tableHeaderY, { width: colTgl.w, align: 'right' })
  rule(doc, tableHeaderY + 15, L, R, '#111827', 1)
  y = tableHeaderY + 22

  doc.font('Helvetica').fontSize(9).fillColor('#111827')
  for (const inv of invoices) {
    const saldo = Math.max(Number(inv.total) - Number(inv.amountPaid || 0), 0)
    doc.text(inv.invoiceNumber, colNum.x, y, { width: colNum.w })
    doc.text(currency(Number(inv.total)), colJml.x, y, { width: colJml.w, align: 'right' })
    doc.text(currency(saldo), colSaldo.x, y, { width: colSaldo.w, align: 'right' })
    doc.text(formatDateShort(inv.issueDate), colTgl.x, y, { width: colTgl.w, align: 'right' })
    const numH = doc.heightOfString(inv.invoiceNumber, { width: colNum.w })
    y += Math.max(numH + 6, 16)
  }
  rule(doc, y, L, R, '#D1D5DB', 0.5)
  y += 8

  // Summary row
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827')
  doc.text(`${invoices.length} faktur`, colNum.x, y, { width: colNum.w })
  doc.text(currency(totalJumlah), colJml.x, y, { width: colJml.w, align: 'right' })
  doc.text(currency(totalSaldo), colSaldo.x, y, { width: colSaldo.w, align: 'right' })
  y += 24

  // Note + sub total
  doc.font('Helvetica').fontSize(10).fillColor('#374151')
  doc.text(`Berdasarkan Pemesanan Bulan ${monthLabel}`, L, y, { width: 260 })
  doc.text('Sub Total :', L + 270, y, { width: 120, align: 'right' })
  doc.font('Helvetica-Bold').text(currency(totalSaldo), L + 400, y, { width: R - L - 400, align: 'right' })
  y += 20

  doc.font('Helvetica').fillColor('#374151')
  doc.text('Terbilang :', L, y)
  y += 15
  doc.font('Helvetica-Oblique').text(terbilang(totalSaldo) + ' Rupiah', L, y, { width: 300 })
  doc.font('Helvetica-Bold').fillColor('#111827')
  doc.text('Total Penagihan :', L + 270, y, { width: 130, align: 'right' })
  doc.text(currency(totalSaldo), L + 400, y, { width: R - L - 400, align: 'right' })
  y += 40

  // Bank details
  if (bankName || bankAccountNumber || bankAccountHolder) {
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text('Mohon transfer ke rekening berikut:', L, y)
    y += 17
    const bankRows: Array<[string, string]> = [
      ['Nama bank', bankName],
      ['No. Rekening', bankAccountNumber],
      ['Atas Nama', bankAccountHolder],
    ]
    for (const [label, value] of bankRows.filter(([, v]) => v)) {
      doc.text(label, L, y, { width: 110 })
      doc.text(':', L + 115, y)
      doc.text(value, L + 125, y)
      y += 15
    }
    y += 12
  }

  doc.font('Helvetica-Oblique').fontSize(10).fillColor('#374151')
    .text('Terima Kasih Untuk Pesanan Anda', L, y, { width: W, align: 'center', lineBreak: false })

  // Appendix: every selected invoice in full, one per fresh page, in table order
  for (const inv of invoices) {
    doc.addPage()
    await renderInvoiceInto(doc, inv as InvoiceFull, tenantId)
  }

  doc.end()

  return new Promise((resolve, reject) => {
    const bufs: Buffer[] = []
    passThrough.on('data', (c: Buffer) => bufs.push(c))
    passThrough.on('end', () => resolve(Buffer.concat(bufs)))
    passThrough.on('error', reject)
  })
}
