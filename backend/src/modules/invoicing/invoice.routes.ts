import { authHook, validateTenantHook, requireScope } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'
import { generateDocNumber } from '../../utils/numbering'
import { resolveTaxRate } from '../../utils/tax'
import { generateInvoicePdf, generateRecapPdf } from '../../utils/pdf'

export async function invoiceRoutes(app: FastifyInstance) {
  // LIST INVOICES
  app.get('/', {
    schema: {
      tags: ['Faktur'],
      summary: 'List invoices',
      description: 'List all invoices for the authenticated tenant. Supports pagination and filtering by status, customer, date range.',
      security: [{ BearerAuth: [] }],
      querystring: { type: 'object', properties: { page: { type: 'string' }, limit: { type: 'string' }, status: { type: 'string' }, customerId: { type: 'string' }, dateFrom: { type: 'string' }, dateTo: { type: 'string' } } },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { page = '1', limit = '20', status, customerId, dateFrom, dateTo } = request.query as any

    const where: any = { tenantId }
    if (status) where.status = status
    if (customerId) where.customerId = customerId
    if (dateFrom) where.issueDate = { ...where.issueDate, gte: new Date(dateFrom as string) }
    if (dateTo) where.issueDate = { ...where.issueDate, lte: new Date(dateTo as string) }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const take = parseInt(limit as string)

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { items: true, payments: true, customer: true },
        orderBy: { issueDate: 'desc' },
        skip,
        take,
      }),
      prisma.invoice.count({ where }),
    ])

    return {
      data: invoices,
      pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) },
    }
  })

  // GET SINGLE INVOICE
  app.get('/:id', {
    schema: {
      tags: ['Faktur'],
      summary: 'Get invoice by ID',
      description: 'Returns a single invoice with items, payments, and customer data.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId },
      include: { items: true, payments: true, customer: true },
    })

    if (!invoice) throw new Error('Faktur tidak ditemukan')

    return invoice
  })

  // CREATE INVOICE
  app.post('/', {
    schema: {
      tags: ['Faktur'],
      summary: 'Create invoice',
      description: 'Create a new invoice with line items. Auto-generates invoice number from settings pattern.',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['customerId', 'items', 'dueDate'],
        properties: {
          customerId: { type: 'string' },
          customerName: { type: 'string' },
          customerEmail: { type: 'string' },
          customerAddress: { type: 'string' },
          customerPhone: { type: 'string' },
          issueDate: { type: 'string' },
          dueDate: { type: 'string' },
          invoiceNumber: { type: 'string', description: 'Custom invoice number (optional, auto-generated if omitted)' },
          taxId: { type: 'string' },
          taxRate: { type: 'number' },
          notes: { type: 'string' },
          terms: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['description', 'quantity', 'unitPrice'],
              properties: {
                productId: { type: 'string' },
                description: { type: 'string' },
                quantity: { type: 'number' },
                unitPrice: { type: 'number' },
                discount: { type: 'number' },
                taxRate: { type: 'number' },
              },
            },
          },
        },
      },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any, reply: any) => {
    const { tenantId, userId } = request.user as any
    const { customerId, customerName, customerEmail, customerAddress, customerPhone, issueDate, dueDate, items, notes, terms, taxId, taxRate: bodyTaxRate, invoiceNumber: customNumber } = request.body as any

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    if (!customer) throw new Error('Pelanggan tidak ditemukan')

    for (const item of items) {
      if (item.productId) {
        const product = await prisma.product.findFirst({ where: { id: item.productId, tenantId } })
        if (!product) throw new Error('Produk tidak ditemukan')
      }
    }

    const parsedIssueDate = issueDate ? new Date(issueDate) : new Date()
    if (isNaN(parsedIssueDate.getTime())) throw new Error('Tanggal faktur tidak valid')

    const parsedDueDate = new Date(dueDate)
    if (isNaN(parsedDueDate.getTime())) throw new Error('Tanggal jatuh tempo tidak valid')

    // Use custom number if given, otherwise auto-generate (max-based, collision-safe)
    let invoiceNumber: string
    if (customNumber && String(customNumber).trim()) {
      invoiceNumber = String(customNumber).trim()
      const clash = await prisma.invoice.findFirst({
        where: { tenantId, invoiceNumber },
        select: { id: true },
      })
      if (clash) throw new Error('Nomor faktur sudah digunakan')
    } else {
      invoiceNumber = await generateDocNumber('invoice', tenantId)
    }

    const taxRate = await resolveTaxRate(tenantId, taxId, bodyTaxRate)

    // Calculate totals
    let subtotal = 0

    const invoiceItems = items.map((item: any) => {
const discPct = Math.min(Math.max(Number(item.discount || 0), 0), 100)
      const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0) * (1 - discPct / 100)
      subtotal += lineTotal
      return {
        productId: item.productId || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: Math.min(Math.max(Number(item.discount ?? 0), 0), 100),
        taxRate: 0,
        taxAmount: 0,
        lineTotal,
      }
    })

    const discount = 0
    const taxAmount = (subtotal - discount) * (taxRate / 100)
    const total = subtotal - discount + taxAmount

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        customerId,
        customerName: customerName || customer.name,
        customerEmail: customerEmail || customer.email,
        customerAddress: customerAddress || customer.address,
        customerProvince: customer.province,
        customerCountry: customer.country,
        customerPhone: customerPhone || customer.phone,
        issueDate: parsedIssueDate,
        dueDate: parsedDueDate,
        subtotal,
        taxRate,
        taxAmount,
        discount,
        total,
        notes,
        terms,
        status: 'draft',
        items: { create: invoiceItems },
      },
      include: { items: true, customer: true },
    })

    reply.code(201).send(invoice)
  })


  // UPDATE INVOICE (draft only)
  app.put('/:id', {
    schema: {
      tags: ['Faktur'],
      summary: 'Update invoice (draft only)',
      description: 'Update an existing invoice. Only draft invoices can be modified.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const { customerId, issueDate, dueDate, items, notes, terms, taxId, taxRate: bodyTaxRate, invoiceNumber: customNumber } = request.body as any

    const invoice = await prisma.invoice.findFirst({ where: { id, tenantId } })
    if (!invoice) throw new Error('Faktur tidak ditemukan')
    if (invoice.status !== 'draft') throw new Error('Hanya faktur berstatus Draft yang dapat diubah')

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    if (!customer) throw new Error('Pelanggan tidak ditemukan')

    const parsedIssueDate = issueDate ? new Date(issueDate) : invoice.issueDate
    if (isNaN(parsedIssueDate.getTime())) throw new Error('Tanggal faktur tidak valid')

    const parsedDueDate = new Date(dueDate)
    if (isNaN(parsedDueDate.getTime())) throw new Error('Tanggal jatuh tempo tidak valid')

    if (!Array.isArray(items) || items.length === 0) throw new Error('Minimal satu item diperlukan')

    // Number: blank keeps existing; a new non-blank value must be free
    let invoiceNumber = invoice.invoiceNumber
    if (customNumber != null) {
      const trimmed = String(customNumber).trim()
      if (trimmed && trimmed !== invoiceNumber) {
        const clash = await prisma.invoice.findFirst({
          where: { tenantId, invoiceNumber: trimmed, id: { not: id } },
          select: { id: true },
        })
        if (clash) throw new Error('Nomor faktur sudah digunakan')
        invoiceNumber = trimmed
      }
    }

    const taxRate = await resolveTaxRate(tenantId, taxId, bodyTaxRate)

    let subtotal = 0
    const invoiceItems = items.map((item: any) => {
const discPct = Math.min(Math.max(Number(item.discount || 0), 0), 100)
      const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0) * (1 - discPct / 100)
      subtotal += lineTotal
      return {
        productId: item.productId || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: Math.min(Math.max(Number(item.discount ?? 0), 0), 100),
        taxRate: 0,
        taxAmount: 0,
        lineTotal,
      }
    })

    const discount = 0
    const taxAmount = (subtotal - discount) * (taxRate / 100)
    const total = subtotal - discount + taxAmount

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        invoiceNumber,
        customerId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerAddress: customer.address,
        customerProvince: customer.province,
        customerCountry: customer.country,
        customerPhone: customer.phone,
        issueDate: parsedIssueDate,
        dueDate: parsedDueDate,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: notes ?? null,
        terms: terms ?? null,
        items: {
          deleteMany: {},
          create: invoiceItems,
        },
      },
      include: { items: true, customer: true },
    })

    reply.send(updated)
  })

  // UPDATE STATUS
  app.put('/:id/status', {
    schema: {
      tags: ['Faktur'],
      summary: 'Update invoice status',
      description: 'Change invoice status. Only draft→sent is allowed manually. Partial/paid status is derived from payments.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['sent'] } } },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { status } = request.body as any
    const { tenantId } = request.user as any

    const invoice = await prisma.invoice.findFirst({ where: { id, tenantId } })
    if (!invoice) throw new Error('Faktur tidak ditemukan')

    // Manual transition is Draft → Terkirim ONLY.
    // Sebagian & Lunas are derived exclusively from recorded payments.
    if (status !== 'sent') {
      throw Object.assign(
        new Error('Hanya perubahan ke Terkirim yang manual. Sebagian/Lunas terbentuk otomatis dari pencatatan pembayaran.'),
        { statusCode: 422 }
      )
    }
    if (invoice.status !== 'draft') {
      throw Object.assign(new Error('Hanya faktur Draft yang bisa dikirim'), { statusCode: 422 })
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
      include: { items: true, customer: true },
    })

    reply.send(updated)
  })

  // ADD PAYMENT
  app.post('/:id/payments', {
    schema: {
      tags: ['Faktur'],
      summary: 'Record payment',
      description: 'Record a payment against an invoice. Automatically updates invoice status (partial/paid).',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['amount', 'method'],
        properties: {
          amount: { type: 'number', description: 'Payment amount' },
          method: { type: 'string', description: 'Payment method (e.g. cash, transfer, card)' },
          reference: { type: 'string', description: 'Payment reference number' },
          notes: { type: 'string' },
        },
      },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { amount, method, reference, notes } = request.body as any
    const { tenantId, userId } = request.user as any

    const invoice = await prisma.invoice.findFirst({ where: { id, tenantId } })
    if (!invoice) throw new Error('Faktur tidak ditemukan')

    // Generate payment number
    const payCount = await prisma.payment.count({ where: { invoiceId: id } })
    const paymentNumber = `PAY-${invoice.invoiceNumber}-${String(payCount + 1).padStart(3, '0')}`

    const payment = await prisma.payment.create({
      data: {
        invoiceId: id,
        paymentNumber,
        amount,
        method,
        reference,
        notes,
      },
    })

    const newPaid = Number(invoice.amountPaid) + Number(amount)
    const updateData: any = { amountPaid: newPaid }
    // Payments only advance status along the one-way lifecycle
    const ORDER: Record<string, number> = { draft: 0, sent: 1, partial: 2, paid: 3 }
    if (newPaid >= Number(invoice.total)) {
      updateData.status = 'paid'
      if (!invoice.paidAt) updateData.paidAt = new Date()
    } else if (newPaid > 0 && (ORDER[invoice.status] ?? 0) < ORDER.partial) {
      updateData.status = 'partial'
    }

    await prisma.invoice.update({
      where: { id },
      data: updateData,
    })

    // Post journal: Debit Kas / Credit Pendapatan — keeps dashboard revenue in sync with payments
    const [cashLedger, revenueLedger] = await Promise.all([
      prisma.ledger.findFirst({ where: { tenantId, type: 'asset', code: { startsWith: '1-1' } }, orderBy: { code: 'asc' } }),
      prisma.ledger.findFirst({ where: { tenantId, type: 'revenue', code: { startsWith: '4-' } }, orderBy: { code: 'asc' } }),
    ])
    if (cashLedger && revenueLedger) {
      await prisma.journalEntry.create({
        data: {
          tenantId,
          journalNumber: `JE-${paymentNumber}`,
          date: new Date(),
          description: `Pembayaran ${invoice.invoiceNumber}`,
          referenceType: 'payment',
          referenceId: payment.id,
          postedBy: userId,
          lines: {
            create: [
              { ledgerId: cashLedger.id, debit: Number(amount), description: `Pembayaran ${invoice.invoiceNumber}` },
              { ledgerId: revenueLedger.id, credit: Number(amount), description: `Pendapatan ${invoice.invoiceNumber}` },
            ],
          },
        },
      })
    }

    reply.code(201).send(payment)
  })

  // DELETE INVOICE
  app.delete('/:id', {
    schema: {
      tags: ['Faktur'],
      summary: 'Delete invoice',
      description: 'Delete an invoice. Staff cannot delete paid/overdue invoices.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId, role } = request.user as any

    const invoice = await prisma.invoice.findFirst({ where: { id, tenantId } })
    if (!invoice) throw new Error('Faktur tidak ditemukan')

    // Staff may not delete invoices in a final state (paid / overdue)
    if (role === 'member' && ['paid', 'overdue'].includes(invoice.status)) {
      reply.code(403).send({ message: 'Faktur lunas/jatuh tempo hanya dapat dihapus oleh admin' })
      return
    }

    await prisma.invoice.delete({ where: { id } })
    reply.send({ message: 'Faktur berhasil dihapus' })
  })

  // DOWNLOAD INVOICE PDF
  app.get('/:id/pdf', {
    schema: {
      tags: ['Faktur'],
      summary: 'Download invoice PDF',
      description: 'Generate and download the invoice as a PDF file. Includes company info, bank details, items, totals, notes/terms.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const pdf = await generateInvoicePdf(id, tenantId)
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="faktur-${id}.pdf"`)
      .send(pdf)
  })

  // RECAP PDF for selected invoices (must all belong to one client)
  app.post('/recap', {
    schema: {
      tags: ['Faktur'],
      summary: 'Generate recap billing statement PDF',
      description: 'Generate a recap billing statement PDF for selected invoices. All invoices must belong to the same customer.',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['ids'],
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'Array of invoice IDs' },
        },
      },
    },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('faktur')],
  }, async (request: any, reply: any) => {
    const { ids } = request.body as any
    const { tenantId } = request.user as any
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('Pilih minimal satu faktur')

    const pdf = await generateRecapPdf(ids, tenantId)
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'inline; filename="rekap-penagihan.pdf"')
      .send(pdf)
  })
}
