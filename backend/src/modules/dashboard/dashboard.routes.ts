import { authHook, validateTenantHook } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'

function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(amount))
}

export async function dashboardRoutes(app: FastifyInstance) {
  const PERIODS = ['30d', 'this_month', 'last_month', 'this_year', 'last_year', 'all'] as const
  type Period = (typeof PERIODS)[number]

  function periodRange(period: Period, now: Date): { from: Date | null; label: string } {
    switch (period) {
      case 'this_month':
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), label: 'bulan ini' }
      case 'last_month': {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return { from: first, label: 'bulan lalu' }
      }
      case 'this_year':
        return { from: new Date(now.getFullYear(), 0, 1), label: 'tahun ini' }
      case 'last_year':
        return { from: new Date(now.getFullYear() - 1, 0, 1), label: 'tahun lalu' }
      case 'all':
        return { from: null, label: 'semua waktu' }
      case '30d':
      default:
        return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), label: '30 hari terakhir' }
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
      prisma.customer.count({ where: { tenantId } }),

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

    return {
      overview: {
        revenue: { amount: revenueTotal, formatted: formatCurrency(revenueTotal), period: periodLabel },
        expense: { amount: expenseTotal, formatted: formatCurrency(expenseTotal), period: periodLabel },
        profit: { amount: profit, formatted: formatCurrency(profit), isProfit: profit >= 0 },
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
