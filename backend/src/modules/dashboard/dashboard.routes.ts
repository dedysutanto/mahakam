import { authHook, validateTenantHook } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'

function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(amount))
}

export async function dashboardRoutes(app: FastifyInstance) {
  const PERIODS = ['30d', 'this_month', 'last_month', 'this_year', 'last_year', 'all'] as const
  type Period = (typeof PERIODS)[number]

  function periodRange(period: Period, now: Date): { from: Date | null; to: Date | null; label: string } {
    switch (period) {
      case 'this_month':
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null, label: 'bulan ini' }
      case 'last_month': {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return { from: first, to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999), label: 'bulan lalu' }
      }
      case 'this_year':
        return { from: new Date(now.getFullYear(), 0, 1), to: null, label: 'tahun ini' }
      case 'last_year':
        return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear(), 0, 0, 23, 59, 59, 999), label: 'tahun lalu' }
      case 'all':
        return { from: null, to: null, label: 'semua waktu' }
      case '30d':
      default:
        return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: null, label: '30 hari terakhir' }
    }
  }

  function previousPeriodFilter(period: Period, now: Date): { gte?: Date; lte?: Date } | null {
    switch (period) {
      case '30d': {
        const end = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
        return { gte: start, lte: end }
      }
      case 'this_month': {
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return { gte: lastMonthStart, lte: lastMonthEnd }
      }
      case 'last_month': {
        const twoMonthsAgoEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999)
        const twoMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
        return { gte: twoMonthsAgoStart, lte: twoMonthsAgoEnd }
      }
      case 'this_year': {
        const lastYearEnd = new Date(now.getFullYear(), 0, 0, 23, 59, 59, 999)
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1)
        return { gte: lastYearStart, lte: lastYearEnd }
      }
      case 'last_year': {
        const twoYearsAgoEnd = new Date(now.getFullYear() - 1, 0, 0, 23, 59, 59, 999)
        const twoYearsAgoStart = new Date(now.getFullYear() - 2, 0, 1)
        return { gte: twoYearsAgoStart, lte: twoYearsAgoEnd }
      }
      case 'all':
      default:
        return null
    }
  }

  app.get('/', {
    schema: { tags: ['Dashboard'], summary: 'Get dashboard overview', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const period: Period = PERIODS.includes(request.query?.period) ? request.query.period : '30d'
    const now = new Date()
    const { from: rangeFrom, label: periodLabel } = periodRange(period, now)

    // Exact windows for bounded periods; open-ended ones just use "from"
    let dateFilter: any = null
    if (rangeFrom) {
      if (period === 'last_month') {
        const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
        dateFilter = { gte: rangeFrom, lte: to }
      } else if (period === 'last_year') {
        const to = new Date(now.getFullYear(), 0, 0, 23, 59, 59, 999)
        dateFilter = { gte: rangeFrom, lte: to }
      } else {
        dateFilter = { gte: rangeFrom }
      }
    }

    const [
      totalRevenue,
      totalExpense,
      totalInvoices,
      unpaidInvoices,
      activeInvoices,
      totalCustomers,
      recentInvoices,
      recentExpenses,
      topAccounts,
    ] = await Promise.all([
      // Revenue for the selected period
      prisma.journalLine.aggregate({
        where: {
          ledger: { tenantId, type: 'revenue' },
          ...(dateFilter ? { entry: { date: dateFilter } } : {}),
        },
        _sum: { debit: true, credit: true },
      }).catch(() => ({ _sum: { debit: null, credit: null } })),

      // Expense for the selected period
      prisma.journalLine.aggregate({
        where: {
          ledger: { tenantId, type: 'expense' },
          ...(dateFilter ? { entry: { date: dateFilter } } : {}),
        },
        _sum: { debit: true, credit: true },
      }).catch(() => ({ _sum: { debit: null, credit: null } })),

      prisma.invoice.count({ where: { tenantId } }),
      prisma.invoice.count({ where: { tenantId, status: { not: 'paid' } } }),
      prisma.invoice.aggregate({
        where: { tenantId, status: { in: ['sent', 'partial', 'overdue'] } },
        _sum: { total: true, amountPaid: true },
      }).catch(() => ({ _sum: { total: null, amountPaid: null } })),
      prisma.customer.count({ where: { tenantId, type: 'customer' } }),

      prisma.invoice.findMany({
        where: { tenantId },
        take: 5,
        orderBy: { issueDate: 'desc' },
        select: { id: true, invoiceNumber: true, customerName: true, total: true, amountPaid: true, status: true, issueDate: true },
      }),

      prisma.expense.findMany({
        where: { tenantId },
        take: 5,
        orderBy: { date: 'desc' },
        select: { id: true, expenseNumber: true, description: true, amount: true, date: true, vendorName: true },
      }),

      // Top accounts by balance
      prisma.journalLine.groupBy({
        by: ['ledgerId'],
        where: { ledger: { tenantId } },
        _sum: { debit: true, credit: true },
      }).then(async (groups) =>
        Promise.all(
          groups.map(async (g) => {
            const ledger = await prisma.ledger.findUnique({ where: { id: g.ledgerId } })
            if (!ledger) return null
            const balance = Number(g._sum.debit || 0) - Number(g._sum.credit || 0)
            return { code: ledger.code, name: ledger.name, type: ledger.type, balance }
          })
        )
      ).then((results) => results.filter(Boolean).sort((a: any, b: any) => Math.abs(b.balance - a.balance)).slice(0, 10)),
    ])

    // Revenue accounts are credit-normal; expense accounts debit-normal
    const revenueTotal = Number(totalRevenue._sum.credit || 0) - Number(totalRevenue._sum.debit || 0)
    const expenseTotal = Number(totalExpense._sum.debit || 0) - Number(totalExpense._sum.credit || 0)
    const profit = revenueTotal - expenseTotal
    const potentialRevenue = Number(activeInvoices._sum.total || 0) - Number(activeInvoices._sum.amountPaid || 0)

    // Previous period comparison
    const prevFilter = previousPeriodFilter(period, now)
    let revenueChange: number | null = null
    let expenseChange: number | null = null

    if (prevFilter) {
      const [prevRevenue, prevExpense] = await Promise.all([
        prisma.journalLine.aggregate({
          where: {
            ledger: { tenantId, type: 'revenue' },
            entry: { date: { gte: prevFilter.gte, lte: prevFilter.lte } },
          },
          _sum: { debit: true, credit: true },
        }).catch(() => ({ _sum: { debit: null, credit: null } })),
        prisma.journalLine.aggregate({
          where: {
            ledger: { tenantId, type: 'expense' },
            entry: { date: { gte: prevFilter.gte, lte: prevFilter.lte } },
          },
          _sum: { debit: true, credit: true },
        }).catch(() => ({ _sum: { debit: null, credit: null } })),
      ])

      const prevRevenueTotal = Number(prevRevenue._sum.credit || 0) - Number(prevRevenue._sum.debit || 0)
      const prevExpenseTotal = Number(prevExpense._sum.debit || 0) - Number(prevExpense._sum.credit || 0)

      if (prevRevenueTotal > 0) {
        revenueChange = Math.round(((revenueTotal - prevRevenueTotal) / prevRevenueTotal) * 1000) / 10
      }
      if (prevExpenseTotal > 0) {
        expenseChange = Math.round(((expenseTotal - prevExpenseTotal) / prevExpenseTotal) * 1000) / 10
      }
    }

    return {
      overview: {
        revenue: { amount: revenueTotal, formatted: formatCurrency(revenueTotal), period: periodLabel, change: revenueChange },
        expense: { amount: expenseTotal, formatted: formatCurrency(expenseTotal), period: periodLabel, change: expenseChange },
        profit: { amount: profit, formatted: formatCurrency(profit), isProfit: profit >= 0 },
        potentialRevenue: { amount: potentialRevenue, formatted: formatCurrency(potentialRevenue) },
        totalInvoices,
        unpaidInvoices,
        totalCustomers,
      },
      recentInvoices: recentInvoices.map((i: any) => ({
        ...i,
        outstanding: Number(i.total) - Number(i.amountPaid),
        formattedOutstanding: formatCurrency(Number(i.total) - Number(i.amountPaid)),
      })),
      recentExpenses: recentExpenses.map((e: any) => ({
        ...e,
        formatted: formatCurrency(e.amount),
      })),
      topAccounts: topAccounts || [],
    }
  })
}
