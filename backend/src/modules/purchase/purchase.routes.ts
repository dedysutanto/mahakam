import { authHook, validateTenantHook, requireScope } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'
import { generateDocNumber } from '../../utils/numbering'
import { resolveTaxRate } from '../../utils/tax'

export async function purchaseRoutes(app: FastifyInstance) {
  // LIST PURCHASES
  app.get('/', {
    schema: { tags: ['Pembelian'], summary: 'List all purchases', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pembelian')],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { page = '1', limit = '20', status, vendorId } = request.query as any

    const where: any = { tenantId }
    if (status) where.status = status
    if (vendorId) where.vendorId = vendorId

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const take = parseInt(limit as string)

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: { items: true, vendor: { select: { id: true, name: true, email: true, phone: true } } },
        orderBy: { orderDate: 'desc' },
        skip,
        take,
      }),
      prisma.purchase.count({ where }),
    ])

    return {
      data: purchases,
      pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) },
    }
  })

  // GET SINGLE PURCHASE
  app.get('/:id', {
    schema: { tags: ['Pembelian'], summary: 'Get a purchase by ID', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pembelian')],
  }, async (request: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const purchase = await prisma.purchase.findFirst({
      where: { id, tenantId },
      include: { items: { include: { product: true } }, vendor: true },
    })
    if (!purchase) throw new Error('Pembelian tidak ditemukan')

    return purchase
  })

  // CREATE PURCHASE
  app.post('/', {
    schema: { tags: ['Pembelian'], summary: 'Create a new purchase', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pembelian')],
  }, async (request: any, reply: any) => {
    const { tenantId } = request.user as any
    const { vendorId, orderDate, items, notes, taxId, taxRate: bodyTaxRate } = request.body as any

    const vendor = await prisma.customer.findFirst({ where: { id: vendorId, tenantId } })
    if (!vendor) throw new Error('Vendor tidak ditemukan')
    if (vendor.type !== 'vendor') throw new Error('Kontak ini bukan vendor')

    if (!Array.isArray(items) || items.length === 0) throw new Error('Minimal satu item diperlukan')

    const parsedOrderDate = orderDate ? new Date(orderDate) : new Date()
    if (isNaN(parsedOrderDate.getTime())) throw new Error('Tanggal pembelian tidak valid')

    // Validate products belong to tenant when provided
    for (const item of items) {
      if (item.productId) {
        const product = await prisma.product.findFirst({ where: { id: item.productId, tenantId } })
        if (!product) throw new Error('Produk tidak ditemukan')
      }
    }

    const purchaseNumber = await generateDocNumber('purchase', tenantId)

    let subtotal = 0
    const purchaseItems = items.map((item: any) => {
      const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0)
      subtotal += lineTotal
      return {
        productId: item.productId || null,
        description: item.description || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal,
      }
    })

    const taxRate = await resolveTaxRate(tenantId, taxId, bodyTaxRate)

    const taxAmount = subtotal * (taxRate / 100)

    const purchase = await prisma.purchase.create({
      data: {
        tenantId,
        purchaseNumber,
        vendorId,
        orderDate: parsedOrderDate,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
        status: 'draft',
        notes: notes || null,
        items: { create: purchaseItems },
      },
      include: { items: true, vendor: true },
    })

    reply.code(201).send(purchase)
  })

  // UPDATE PURCHASE (draft only)
  app.put('/:id', {
    schema: { tags: ['Pembelian'], summary: 'Update a purchase (draft only)', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pembelian')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const { vendorId, orderDate, items, notes, taxId, taxRate: bodyTaxRate } = request.body as any

    const existing = await prisma.purchase.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pembelian tidak ditemukan')
    if (existing.status !== 'draft') throw new Error('Hanya pembelian berstatus draft yang bisa diedit')

    const vendor = await prisma.customer.findFirst({ where: { id: vendorId, tenantId } })
    if (!vendor) throw new Error('Vendor tidak ditemukan')
    if (vendor.type !== 'vendor') throw new Error('Kontak ini bukan vendor')

    if (!Array.isArray(items) || items.length === 0) throw new Error('Minimal satu item diperlukan')

    const parsedOrderDate = orderDate ? new Date(orderDate) : existing.orderDate
    if (isNaN(parsedOrderDate.getTime())) throw new Error('Tanggal pembelian tidak valid')

    for (const item of items) {
      if (item.productId) {
        const product = await prisma.product.findFirst({ where: { id: item.productId, tenantId } })
        if (!product) throw new Error('Produk tidak ditemukan')
      }
    }

    let subtotal = 0
    const purchaseItems = items.map((item: any) => {
      const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0)
      subtotal += lineTotal
      return {
        productId: item.productId || null,
        description: item.description || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal,
      }
    })

    const taxRate = await resolveTaxRate(tenantId, taxId, bodyTaxRate)
    const taxAmount = subtotal * (taxRate / 100)

    await prisma.purchaseItem.deleteMany({ where: { purchaseId: id } })

    const purchase = await prisma.purchase.update({
      where: { id },
      data: {
        vendorId,
        orderDate: parsedOrderDate,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
        notes: notes || null,
        items: { create: purchaseItems },
      },
      include: { items: true, vendor: true },
    })

    reply.send(purchase)
  })

  // UPDATE STATUS
  app.put('/:id/status', {
    schema: { tags: ['Pembelian'], summary: 'Update purchase status', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pembelian')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { status } = request.body as any
    const { tenantId, userId } = request.user as any

    const flow = ['draft', 'ordered', 'received']
    if (!flow.includes(status)) throw new Error('Status tidak valid')

    const existing = await prisma.purchase.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pembelian tidak ditemukan')

    // one-way flow: draft -> ordered -> received
    if (flow.indexOf(status) <= flow.indexOf(existing.status)) {
      throw new Error('Status hanya bisa maju: draft → dipesan → diterima')
    }

    const updated = await prisma.purchase.update({ where: { id }, data: { status }, include: { items: true } })

    // Post journal when goods are received: Debit HPP / Credit Hutang Usaha
    if (status === 'received') {
      const journalNumber = `JE-PUR-${updated.purchaseNumber}`
      const alreadyPosted = await prisma.journalEntry.findFirst({ where: { tenantId, journalNumber } })
      if (!alreadyPosted) {
        const [expenseLedger, liabilityLedger] = await Promise.all([
          prisma.ledger.findFirst({
            where: { tenantId, type: 'expense' },
            orderBy: [{ code: 'asc' }],
          }),
          prisma.ledger.findFirst({
            where: { tenantId, type: 'liability', code: { startsWith: '2-' } },
            orderBy: { code: 'asc' },
          }),
        ])
        if (expenseLedger && liabilityLedger) {
          await prisma.journalEntry.create({
            data: {
              tenantId,
              journalNumber,
              date: new Date(),
              description: `Pembelian ${updated.purchaseNumber}`,
              referenceType: 'purchase',
              referenceId: updated.id,
              postedBy: userId,
              lines: {
                create: [
                  { ledgerId: expenseLedger.id, debit: Number(updated.total), description: `Pembelian ${updated.purchaseNumber}` },
                  { ledgerId: liabilityLedger.id, credit: Number(updated.total), description: `Utang ${updated.purchaseNumber}` },
                ],
              },
            },
          })
        }
      }
    }

    reply.send(updated)
  })

  // DELETE PURCHASE
  app.delete('/:id', {
    schema: { tags: ['Pembelian'], summary: 'Delete a purchase', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pembelian')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const existing = await prisma.purchase.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pembelian tidak ditemukan')

    await prisma.purchase.delete({ where: { id } })
    reply.send({ message: 'Pembelian berhasil dihapus' })
  })
}