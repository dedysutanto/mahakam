import { authHook, validateTenantHook, requireScope } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'
import { generateDocNumber } from '../../utils/numbering'

export async function expenseRoutes(app: FastifyInstance) {
  // LIST EXPENSES
  app.get('/', {
    schema: { tags: ['Biaya'], summary: 'List all expenses', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pengeluaran')],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { page = '1', limit = '20', category, dateFrom, dateTo, status } = request.query as any

    const where: any = { tenantId }
    if (category) where.category = category
    if (status) where.status = status
    if (dateFrom) where.date = { ...where.date, gte: new Date(dateFrom as string) }
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo as string) }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const take = parseInt(limit as string)

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: { ledger: { select: { code: true, name: true } } },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.expense.count({ where }),
    ])

    return {
      data: expenses,
      pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) },
    }
  })

  // GET SINGLE EXPENSE
  app.get('/:id', {
    schema: { tags: ['Biaya'], summary: 'Get an expense by ID', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pengeluaran')],
  }, async (request: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const expense = await prisma.expense.findFirst({
      where: { id, tenantId },
      include: { ledger: true },
    })

    if (!expense) throw new Error('Pengeluaran tidak ditemukan')

    return expense
  })

  // CREATE EXPENSE
  app.post('/', {
    schema: { tags: ['Biaya'], summary: 'Create a new expense', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pengeluaran')],
  }, async (request: any, reply: any) => {
    const { tenantId, userId } = request.user as any
    const { ledgerId, vendorId, vendorName, description, amount, date, category, receiptUrl, notes } = request.body as any

    // Verify ledger exists
    const ledger = await prisma.ledger.findFirst({ where: { id: ledgerId, tenantId } })
    if (!ledger) throw new Error('Akun tidak ditemukan')

    // Resolve vendor: vendorId refers to the Vendor list; plain text stays backward-compatible
    let resolvedVendorName = typeof vendorName === 'string' ? vendorName : null
    let resolvedVendorId: string | null = null
    if (vendorId) {
      const vendor = await prisma.customer.findFirst({ where: { id: vendorId, tenantId } })
      if (!vendor) throw new Error('Vendor tidak ditemukan')
      if (vendor.type !== 'vendor') throw new Error('Kontak ini bukan vendor')
      resolvedVendorId = vendor.id
      resolvedVendorName = vendor.name
    }

    // Generate expense number (max-based, collision-safe)
    const expenseNumber = await generateDocNumber('expense', tenantId)

    const expense = await prisma.expense.create({
      data: {
        tenantId,
        expenseNumber,
        ledgerId,
        vendorId: resolvedVendorId,
        vendorName: resolvedVendorName,
        description,
        amount,
        date: new Date(date),
        category,
        receiptUrl,
        notes,
        approvedBy: userId,
        status: 'approved',
      },
      include: { ledger: true },
    })

    // Auto-create journal entry
    await prisma.journalEntry.create({
      data: {
        tenantId,
        journalNumber: `JE-${expense.expenseNumber}`,
        date: new Date(date),
        description: `Pengeluaran: ${description}`,
        referenceType: 'expense',
        referenceId: expense.id,
        postedBy: userId,
        lines: {
          create: [
            { ledgerId, debit: Number(amount), description },
            {
              ledgerId: (await prisma.ledger.findFirst({ where: { tenantId, type: 'asset', code: { contains: '1-1' } } }))?.id || '',
              credit: Number(amount),
              description: `Pembayaran ${expenseNumber}`,
            },
          ].filter((l) => l.ledgerId),
        },
      },
    })

    reply.code(201).send(expense)
  })

  // UPDATE EXPENSE — keeps the auto-posted journal entry in sync (V27)
  app.put('/:id', {
    schema: { tags: ['Biaya'], summary: 'Update an expense', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pengeluaran')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const body = request.body as any

    const existing = await prisma.expense.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pengeluaran tidak ditemukan')

    const allowed = (({ ledgerId, vendorId, vendorName, description, amount, date, category, receiptUrl, notes }) =>
      ({ ledgerId, vendorId, vendorName, description, amount, date, category, receiptUrl, notes }))(body)

    if (allowed.vendorId === null || allowed.vendorId === '') {
      allowed.vendorId = null
    } else if (allowed.vendorId) {
      const vendor = await prisma.customer.findFirst({ where: { id: allowed.vendorId, tenantId } })
      if (!vendor) throw new Error('Vendor tidak ditemukan')
      if (vendor.type !== 'vendor') throw new Error('Kontak ini bukan vendor')
      allowed.vendorName = vendor.name
    }
    if (allowed.date) allowed.date = new Date(allowed.date)

    const expense = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.expense.update({
        where: { id },
        data: allowed,
        include: { ledger: true },
      })

      // Rebuild the journal entry lines from the FINAL stored row so partial
      // API updates stay correct even when the body omits fields.
      const je = await tx.journalEntry.findFirst({
        where: { tenantId, referenceType: 'expense', referenceId: id },
      })
      const cashLedger = await tx.ledger.findFirst({ where: { tenantId, type: 'asset', code: { contains: '1-1' } } })
      const lines = [
        { ledgerId: updated.ledgerId, debit: Number(updated.amount), description: updated.description },
        ...(cashLedger ? [{ ledgerId: cashLedger.id, credit: Number(updated.amount), description: `Pembayaran ${updated.expenseNumber}` }] : []),
      ].filter((l: any) => l.ledgerId)

      if (je) {
        await tx.journalLine.deleteMany({ where: { entryId: je.id } })
        await tx.journalLine.createMany({ data: lines.map((l: any) => ({ ...l, entryId: je.id })) })
        await tx.journalEntry.update({
          where: { id: je.id },
          data: { date: updated.date, description: `Pengeluaran: ${updated.description}` },
        })
      } else {
        // Legacy row without a journal entry — post one now
        await tx.journalEntry.create({
          data: {
            tenantId,
            journalNumber: `JE-${updated.expenseNumber}`,
            date: updated.date,
            description: `Pengeluaran: ${updated.description}`,
            referenceType: 'expense',
            referenceId: updated.id,
            postedBy: existing.approvedBy || 'system',
            lines: { create: lines },
          },
        })
      }

      return updated
    })

    reply.send(expense)
  })

  // DELETE EXPENSE — removes its auto-posted journal entry too (V27)
  app.delete('/:id', {
    schema: { tags: ['Biaya'], summary: 'Delete an expense', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pengeluaran')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const existing = await prisma.expense.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pengeluaran tidak ditemukan')

    await prisma.$transaction([
      prisma.journalEntry.deleteMany({ where: { tenantId, referenceType: 'expense', referenceId: id } }),
      prisma.expense.delete({ where: { id } }),
    ])

    reply.send({ message: 'Pengeluaran berhasil dihapus' })
  })
}
