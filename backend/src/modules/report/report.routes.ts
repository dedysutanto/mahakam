import { authHook, validateTenantHook } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'

function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(amount))
}

export async function reportRoutes(app: FastifyInstance) {
  // LABA RUGI (INCOME STATEMENT)
  app.get('/laba-rugi', {
    schema: { tags: ['Pelaporan'], summary: 'Get income statement (laba rugi)', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { dateFrom, dateTo } = request.query as any

    const where: any = { entry: { tenantId } }
    if (dateFrom || dateTo) {
      where.entry.date = {}
      if (dateFrom) where.entry.date.gte = new Date(dateFrom as string)
      if (dateTo) where.entry.date.lte = new Date(dateTo as string)
    }

    // Get all journal lines
    const lines = await prisma.journalLine.findMany({
      where,
      include: { entry: true, ledger: true },
    })

    // Aggregate by account type
    const accounts: Record<string, any[]> = {}
    let totalRevenue = 0
    let totalExpense = 0

    for (const line of lines) {
      const type = line.ledger.type
      if (!accounts[type]) accounts[type] = []

      const entry = {
        code: line.ledger.code,
        name: line.ledger.name,
        debit: Number(line.debit),
        credit: Number(line.credit),
        date: line.entry.date,
        description: line.description || line.entry.description,
      }

      if (type === 'revenue') {
        totalRevenue += Number(line.credit) - Number(line.debit)
        accounts[type].push(entry)
      } else if (type === 'expense') {
        totalExpense += Number(line.debit) - Number(line.credit)
        accounts[type].push(entry)
      }
    }

    const profit = totalRevenue - totalExpense

    return {
      title: 'Laporan Laba Rugi',
      period: { from: dateFrom || 'Awal', to: dateTo || 'Sekarang' },
      revenue: {
        total: totalRevenue,
        formatted: formatCurrency(totalRevenue),
        accounts: accounts.revenue || [],
      },
      expense: {
        total: totalExpense,
        formatted: formatCurrency(totalExpense),
        accounts: accounts.expense || [],
      },
      profit: {
        amount: profit,
        formatted: formatCurrency(profit),
        isProfit: profit >= 0,
      },
    }
  })

  // NERACA (BALANCE SHEET)
  app.get('/neraca', {
    schema: { tags: ['Pelaporan'], summary: 'Get balance sheet (neraca)', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { dateTo } = request.query as any

    const where: any = { entry: { tenantId } }
    if (dateTo) where.entry.date = { lte: new Date(dateTo as string) }

    const lines = await prisma.journalLine.findMany({
      where,
      include: { ledger: true },
    })

    const accountBalances: Record<string, any> = {}
    const assets: any[] = []
    const liabilities: any[] = []
    const equity: any[] = []

    for (const line of lines) {
      const code = line.ledger.code
      if (!accountBalances[code]) {
        accountBalances[code] = {
          code: line.ledger.code,
          name: line.ledger.name,
          debit: 0,
          credit: 0,
        }
      }
      accountBalances[code].debit += Number(line.debit)
      accountBalances[code].credit += Number(line.credit)
    }

    for (const acc of Object.values(accountBalances)) {
      const balance = (acc as any).debit - (acc as any).credit
      const entry = { ...acc, balance }

      if ((acc as any).code.startsWith('1')) {
        assets.push(entry)
      } else if ((acc as any).code.startsWith('2')) {
        liabilities.push(entry)
      } else if ((acc as any).code.startsWith('3')) {
        equity.push(entry)
      }
    }

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0)
    const totalEquity = equity.reduce((s, a) => s + a.balance, 0)

    return {
      title: 'Neraca (Laporan Posisi Keuangan)',
      asOf: dateTo || 'Sekarang',
      assets: { total: totalAssets, formatted: formatCurrency(totalAssets), accounts: assets },
      liabilities: { total: totalLiabilities, formatted: formatCurrency(totalLiabilities), accounts: liabilities },
      equity: { total: totalEquity, formatted: formatCurrency(totalEquity), accounts: equity },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
    }
  })

  // ARUS KAS (CASH FLOW)
  app.get('/arus-kas', {
    schema: { tags: ['Pelaporan'], summary: 'Get cash flow statement (arus kas)', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { dateFrom, dateTo } = request.query as any

    const where: any = { tenantId }
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) where.date.gte = new Date(dateFrom as string)
      if (dateTo) where.date.lte = new Date(dateTo as string)
    }

    const cashLedgers = await prisma.ledger.findMany({
      where: { tenantId, type: 'asset', code: { contains: '1-1' } },
    })

    const cashLedgerIds = cashLedgers.map((l: any) => l.id)
    if (cashLedgerIds.length === 0) return { data: [], message: 'Tidak ada akun kas ditemukan' }

    const lines = await prisma.journalLine.findMany({
      where: { ledgerId: { in: cashLedgerIds } },
      include: { entry: { include: { lines: { include: { ledger: true } } } } },
      orderBy: { date: 'asc' },
    })

    let balance = 0
    const movements = lines.map((line: any) => {
      const change = Number(line.debit) - Number(line.credit)
      balance += change

      // Find related entry (opposite side)
      const related = line.entry.lines.find((l: any) => l.ledgerId !== line.ledgerId)

      return {
        date: line.entry.date,
        description: line.entry.description || 'Pencatatan otomatis',
        referenceType: line.entry.referenceType,
        referenceId: line.entry.referenceId,
        debit: Number(line.debit),
        credit: Number(line.credit),
        change,
        balance,
      }
    })

    return {
      title: 'Laporan Arus Kas',
      period: { from: dateFrom || 'Awal', to: dateTo || 'Sekarang' },
      movements,
      endingBalance: balance,
      formatted: formatCurrency(balance),
    }
  })

  // LAPORAN PENGELUARAN
  app.get('/pengeluaran', {
    schema: { tags: ['Pelaporan'], summary: 'Get expense report (pengeluaran)', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { dateFrom, dateTo, category } = request.query as any

    const where: any = { tenantId }
    if (dateFrom) where.date = { ...where.date, gte: new Date(dateFrom as string) }
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo as string) }
    if (category) where.category = category

    const expenses = await prisma.expense.findMany({
      where,
      include: { ledger: { select: { code: true, name: true } } },
      orderBy: { date: 'desc' },
    })

    const byCategory: Record<string, number> = {}
    let total = 0
    for (const exp of expenses) {
      const cat = exp.category || 'Lainnya'
      byCategory[cat] = (byCategory[cat] || 0) + Number(exp.amount)
      total += Number(exp.amount)
    }

    return {
      title: 'Laporan Pengeluaran',
      period: { from: dateFrom || 'Awal', to: dateTo || 'Sekarang' },
      total,
      formattedTotal: formatCurrency(total),
      byCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount, formatted: formatCurrency(amount) })),
      items: expenses,
    }
  })

  // PIUTANG HUTANG (AGING)
  app.get('/piutang-hutang', {
    schema: { tags: ['Pelaporan'], summary: 'Get receivables and payables aging report', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any

    const now = new Date()

    const unpaidInvoices = await prisma.invoice.findMany({
      where: { tenantId, status: { not: 'paid' } },
      select: {
        id: true,
        invoiceNumber: true,
        customerName: true,
        total: true,
        amountPaid: true,
        dueDate: true,
        status: true,
      },
      orderBy: { dueDate: 'asc' },
    })

    const aging = {
      current: { count: 0, amount: 0 },
      days30: { count: 0, amount: 0 },
      days60: { count: 0, amount: 0 },
      days90: { count: 0, amount: 0 },
      over90: { count: 0, amount: 0 },
    }

    for (const inv of unpaidInvoices) {
      const outstanding = Number(inv.total) - Number(inv.amountPaid)
      if (outstanding <= 0) continue

      const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))

      let bucket: keyof typeof aging
      if (daysOverdue <= 0) bucket = 'current'
      else if (daysOverdue <= 30) bucket = 'days30'
      else if (daysOverdue <= 60) bucket = 'days60'
      else if (daysOverdue <= 90) bucket = 'days90'
      else bucket = 'over90'

      aging[bucket].count++
      aging[bucket].amount += outstanding
    }

    return {
      title: 'Laporan Piutang & Utang',
      summary: {
        totalOutstanding: unpaidInvoices.reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0),
        formatted: formatCurrency(unpaidInvoices.reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0)),
      },
      aging,
      items: unpaidInvoices,
    }
  })
}
