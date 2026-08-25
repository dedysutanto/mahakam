import { authHook, validateTenantHook, requireScope } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'

export async function ledgerRoutes(app: FastifyInstance) {
  // LIST LEDGERS
  app.get('/', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('buku-besar')],
  }, async (request: any) => {
    const { tenantId } = request.user as any

    const ledgers = await prisma.ledger.findMany({
      where: { tenantId },
      include: { parent: { select: { code: true, name: true } } },
      orderBy: { code: 'asc' },
    })

    return ledgers.map((l: any) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      type: l.type,
      parentId: l.parentId,
      parent: l.parent ? `${l.parent.code} - ${l.parent.name}` : null,
      isSystem: l.isSystem,
      isActive: l.isActive,
    }))
  })

  // CREATE LEDGER
  app.post('/', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('buku-besar')],
  }, async (request: any, reply: any) => {
    const { tenantId } = request.user as any
    const { code, name, type, parentId } = request.body as any

    const existing = await prisma.ledger.findUnique({
      where: { tenantId_code: { tenantId, code } },
    })

    if (existing) throw new Error('Kode akun sudah digunakan')

    const ledger = await prisma.ledger.create({
      data: { tenantId, code, name, type, parentId },
    })

    reply.code(201).send(ledger)
  })

  // UPDATE LEDGER
  app.put('/:id', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('buku-besar')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { code, name, type, parentId, isActive } = request.body as any
    const { tenantId } = request.user as any

    const existing = await prisma.ledger.findUnique({ where: { id } })
    if (!existing || existing.tenantId !== tenantId) throw new Error('Akun tidak ditemukan')

    const ledger = await prisma.ledger.update({
      where: { id },
      data: { code, name, type, parentId, isActive },
    })

    reply.send(ledger)
  })

  // GET JOURNAL ENTRIES
  app.get('/:id/journals', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('buku-besar')],
  }, async (request: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const { page = '1', limit = '20', dateFrom, dateTo } = request.query as any

    const where: any = { tenantId, ledgerId: id }
    if (dateFrom) where.date = { ...where.date, gte: new Date(dateFrom as string) }
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo as string) }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const take = parseInt(limit as string)

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            where: { ledgerId: id },
            select: { debit: true, credit: true, description: true, ledger: { select: { code: true, name: true } } },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.journalEntry.count({ where }),
    ])

    return {
      data: entries,
      pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) },
    }
  })

  // GET BALANCE FOR LEDGER
  app.get('/:id/balance', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('buku-besar')],
  }, async (request: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const { dateTo } = request.query as any

    const where: any = { tenantId, ledgerId: id }
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo as string) }

    const lines = await prisma.journalLine.findMany({ where })

    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0)
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0)

    return {
      ledgerId: id,
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
    }
  })
}
