import { authHook, validateTenantHook, requireScope } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'
import { generateDocNumber } from '../../utils/numbering'
import { resolveTaxRate } from '../../utils/tax'
import { generateQuotationPdf } from '../../utils/pdf'

const FLOW = ['draft', 'sent', 'accepted', 'rejected'] as const

function quoteSnapshot(customer: { name: string; email: string | null; phone: string | null; address: string | null; province: string | null; country: string | null }) {
  return {
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    customerAddress: customer.address,
    customerProvince: customer.province,
    customerCountry: customer.country,
  }
}

export async function quotationRoutes(app: FastifyInstance) {
  // LIST QUOTATIONS
  app.get('/', {
    schema: { tags: ['Penawaran'], summary: 'List all quotations', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('penawaran')],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { page = '1', limit = '20', status, customerId } = request.query as any

    const where: any = { tenantId }
    if (status) where.status = status
    if (customerId) where.customerId = customerId

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const take = parseInt(limit as string)

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        include: { items: true, customer: { select: { id: true, name: true } } },
        orderBy: { issueDate: 'desc' },
        skip,
        take,
      }),
      prisma.quotation.count({ where }),
    ])

    return {
      data: quotations,
      pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) },
    }
  })

  // GET SINGLE QUOTATION
  app.get('/:id', {
    schema: { tags: ['Penawaran'], summary: 'Get a quotation by ID', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('penawaran')],
  }, async (request: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const quotation = await prisma.quotation.findFirst({
      where: { id, tenantId },
      include: { items: true, customer: true },
    })
    if (!quotation) throw new Error('Penawaran tidak ditemukan')

    return quotation
  })

  // CREATE QUOTATION
  app.post('/', {
    schema: { tags: ['Penawaran'], summary: 'Create a new quotation', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('penawaran')],
  }, async (request: any, reply: any) => {
    const { tenantId } = request.user as any
    const { customerId, issueDate, validUntil, items, notes, terms, discount, taxId, taxRate: bodyTaxRate } = request.body as any

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    if (!customer) throw new Error('Pelanggan tidak ditemukan')

    if (!Array.isArray(items) || items.length === 0) throw new Error('Minimal satu item diperlukan')

    const parsedIssueDate = issueDate ? new Date(issueDate) : new Date()
    if (isNaN(parsedIssueDate.getTime())) throw new Error('Tanggal penawaran tidak valid')
    let parsedValidUntil: Date | null = null
    if (validUntil) {
      parsedValidUntil = new Date(validUntil)
      if (isNaN(parsedValidUntil.getTime())) throw new Error('Tanggal berlaku hingga tidak valid')
    }

    for (const item of items) {
      if (item.productId) {
        const product = await prisma.product.findFirst({ where: { id: item.productId, tenantId } })
        if (!product) throw new Error('Produk tidak ditemukan')
      }
    }

    const quotationNumber = await generateDocNumber('quotation', tenantId)
    const disc = Number(discount || 0)

    let subtotal = 0
    const quotationItems = items.map((item: any) => {
const discPct = Math.min(Math.max(Number(item.discount || 0), 0), 100)
      const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0) * (1 - discPct / 100)
      subtotal += lineTotal
      return {
        productId: item.productId || null,
        description: item.description || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: Math.min(Math.max(Number(item.discount || 0), 0), 100),
        lineTotal,
      }
    })

    const taxRate = await resolveTaxRate(tenantId, taxId, bodyTaxRate)
    const taxableBase = Math.max(subtotal - disc, 0)
    const taxAmount = taxableBase * (taxRate / 100)

    const quotation = await prisma.quotation.create({
      data: {
        tenantId,
        quotationNumber,
        customerId,
        ...quoteSnapshot(customer),
        issueDate: parsedIssueDate,
        validUntil: parsedValidUntil,
        subtotal,
        taxRate,
        taxAmount,
        discount: disc,
        total: taxableBase + taxAmount,
        status: 'draft',
        notes: notes || null,
        terms: terms || null,
        items: { create: quotationItems },
      },
      include: { items: true },
    })

    reply.code(201).send(quotation)
  })

  // UPDATE QUOTATION (draft only)
  app.put('/:id', {
    schema: { tags: ['Penawaran'], summary: 'Update a quotation (draft only)', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('penawaran')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const { customerId, issueDate, validUntil, items, notes, terms, discount, taxId, taxRate: bodyTaxRate } = request.body as any

    const existing = await prisma.quotation.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Penawaran tidak ditemukan')
    if (existing.status !== 'draft') throw new Error('Hanya penawaran berstatus draft yang bisa diedit')

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    if (!customer) throw new Error('Pelanggan tidak ditemukan')

    if (!Array.isArray(items) || items.length === 0) throw new Error('Minimal satu item diperlukan')

    const parsedIssueDate = issueDate ? new Date(issueDate) : existing.issueDate
    if (isNaN(parsedIssueDate.getTime())) throw new Error('Tanggal penawaran tidak valid')
    let parsedValidUntil: Date | null = existing.validUntil
    if (validUntil !== undefined) {
      parsedValidUntil = validUntil ? new Date(validUntil) : null
      if (parsedValidUntil && isNaN(parsedValidUntil.getTime())) throw new Error('Tanggal berlaku hingga tidak valid')
    }

    for (const item of items) {
      if (item.productId) {
        const product = await prisma.product.findFirst({ where: { id: item.productId, tenantId } })
        if (!product) throw new Error('Produk tidak ditemukan')
      }
    }

    const disc = Number(discount || 0)

    let subtotal = 0
    const quotationItems = items.map((item: any) => {
const discPct = Math.min(Math.max(Number(item.discount || 0), 0), 100)
      const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0) * (1 - discPct / 100)
      subtotal += lineTotal
      return {
        productId: item.productId || null,
        description: item.description || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: Math.min(Math.max(Number(item.discount || 0), 0), 100),
        lineTotal,
      }
    })

    const taxRate = await resolveTaxRate(tenantId, taxId, bodyTaxRate)
    const taxableBase = Math.max(subtotal - disc, 0)
    const taxAmount = taxableBase * (taxRate / 100)

    await prisma.quotationItem.deleteMany({ where: { quotationId: id } })

    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        customerId,
        ...quoteSnapshot(customer),
        issueDate: parsedIssueDate,
        validUntil: parsedValidUntil,
        subtotal,
        taxRate,
        taxAmount,
        discount: disc,
        total: taxableBase + taxAmount,
        notes: notes || null,
        terms: terms || null,
        items: { create: quotationItems },
      },
      include: { items: true },
    })

    reply.send(quotation)
  })

  // UPDATE STATUS — one-way: draft → sent → accepted | rejected
  app.put('/:id/status', {
    schema: { tags: ['Penawaran'], summary: 'Update quotation status', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('penawaran')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { status } = request.body as any
    const { tenantId } = request.user as any

    if (!(FLOW as readonly string[]).includes(status)) throw new Error('Status tidak valid')

    const existing = await prisma.quotation.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Penawaran tidak ditemukan')

    if (existing.status === 'converted') throw new Error('Penawaran sudah dikonversi menjadi faktur')
    if ((FLOW as readonly string[]).indexOf(status as any) <= (FLOW as readonly string[]).indexOf(existing.status as any)) {
      throw new Error('Status hanya bisa maju: draft → dikirim → diterima/ditolak')
    }

    const updated = await prisma.quotation.update({ where: { id }, data: { status }, include: { items: true } })
    reply.send(updated)
  })

  // CONVERT ACCEPTED QUOTATION → DRAFT INVOICE (one-time)
  app.post('/:id/convert', {
    schema: { tags: ['Penawaran'], summary: 'Convert accepted quotation to invoice', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('penawaran')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const quotation = await prisma.quotation.findFirst({
      where: { id, tenantId },
      include: { items: true },
    })
    if (!quotation) throw new Error('Penawaran tidak ditemukan')
    if (quotation.status !== 'accepted') throw new Error('Hanya penawaran berstatus diterima yang bisa dikonversi')
    if (quotation.convertedInvoiceId) throw new Error('Penawaran ini sudah pernah dikonversi menjadi faktur')

    const invoiceNumber = await generateDocNumber('invoice', tenantId)

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        customerId: quotation.customerId,
        customerName: quotation.customerName,
        customerEmail: quotation.customerEmail,
        customerAddress: quotation.customerAddress,
        customerProvince: quotation.customerProvince,
        customerCountry: quotation.customerCountry,
        customerPhone: quotation.customerPhone,
        status: 'draft',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: quotation.subtotal,
        taxRate: quotation.taxRate,
        taxAmount: quotation.taxAmount,
        discount: quotation.discount,
        total: quotation.total,
        notes: quotation.notes,
        terms: quotation.terms,
        items: {
          create: quotation.items.map((it: typeof quotation.items[number]) => ({
            productId: it.productId,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            taxRate: quotation.taxRate,
            taxAmount: (Number(it.lineTotal) * Number(quotation.taxRate)) / 100,
            lineTotal: it.lineTotal,
          })),
        },
      },
    })

    const updatedQuotation = await prisma.quotation.update({
      where: { id },
      data: { status: 'converted', convertedInvoiceId: invoice.id },
    })

    reply.send({ invoice, quotation: updatedQuotation })
  })

  // DELETE QUOTATION (draft or rejected only; never converted)
  app.delete('/:id', {
    schema: { tags: ['Penawaran'], summary: 'Delete a quotation', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('penawaran')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const existing = await prisma.quotation.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Penawaran tidak ditemukan')
    if (existing.convertedInvoiceId) throw new Error('Penawaran yang sudah dikonversi tidak bisa dihapus')
    if (!['draft', 'rejected'].includes(existing.status)) {
      throw new Error('Hanya penawaran draft atau ditolak yang bisa dihapus')
    }

    await prisma.quotation.delete({ where: { id } })
    reply.send({ success: true })
  })

  // PDF
  app.get('/:id/pdf', {
    schema: { tags: ['Penawaran'], summary: 'Download quotation as PDF', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('penawaran')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const pdf = await generateQuotationPdf(id, tenantId)
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="penawaran-${id}.pdf"`)
      .send(pdf)
  })
}
