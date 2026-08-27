import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import Layout from '../components/Layout'
import { formatCurrency } from '../lib/utils'
import { TrendingUp, TrendingDown, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface DashboardData {
  overview: {
    revenue: { amount: number; formatted: string; period: string; change: number | null }
    expense: { amount: number; formatted: string; period: string; change: number | null }
    profit: { amount: number; formatted: string; isProfit: boolean }
    totalInvoiceValue: { amount: number; formatted: string; period: string }
    totalInvoices: number
    unpaidInvoices: number
    totalCustomers: number
  }
  recentInvoices: any[]
  recentExpenses: any[]
  topAccounts: any[]
}

const PERIOD_OPTIONS = [
  { key: '30d', label: '30 Hari' },
  { key: 'this_month', label: 'Bulan Ini' },
  { key: 'last_month', label: 'Bulan Lalu' },
  { key: 'this_year', label: 'Tahun Ini' },
  { key: 'last_year', label: 'Tahun Lalu' },
  { key: 'all', label: 'Semua' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30d')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error('Gagal memuat dashboard')
        return r.json()
      })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [period])

  // Super admin without company membership has no dashboard data
  // (placed after all hooks to keep hook order stable while /me restores the profile)
  if (user?.isSuperAdmin && !user.tenant) {
    return <Navigate to="/admin-sistem" replace />
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      </Layout>
    )
  }

  if (!data?.overview) {
    return (
      <Layout>
        <div className="text-center text-muted-foreground py-16">Gagal memuat data dashboard.</div>
      </Layout>
    )
  }

  const formatChange = (change: number | null, invertColor?: boolean): { text: string; positive: boolean } => {
    if (change == null) return { text: 'Baru', positive: true }
    const sign = change >= 0 ? '+' : ''
    const isPositive = invertColor ? change <= 0 : change >= 0
    return { text: `${sign}${change}%`, positive: isPositive }
  }

  const revenueChange = formatChange(data.overview.revenue.change)
  const expenseChange = formatChange(data.overview.expense.change, true)

  const stats = [
    {
      label: `Pendapatan (${data.overview.revenue.period})`,
      value: data.overview.revenue.formatted || 'Rp 0',
      change: revenueChange.text,
      positive: revenueChange.positive,
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: `Pengeluaran (${data.overview.expense.period})`,
      value: data.overview.expense.formatted || 'Rp 0',
      change: expenseChange.text,
      positive: expenseChange.positive,
      icon: TrendingDown,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    {
      label: `Laba/Rugi (${data.overview.revenue.period})`,
      value: data.overview.profit.formatted || 'Rp 0',
      change: data.overview.profit.isProfit ? 'Untung' : 'Rugi',
      positive: data.overview.profit.isProfit ?? false,
      icon: data.overview.profit.isProfit ? ArrowUpRight : ArrowDownRight,
      color: data.overview.profit.isProfit ? 'text-success' : 'text-destructive',
      bg: data.overview.profit.isProfit ? 'bg-success/10' : 'bg-destructive/10',
    },
    {
      label: `Faktur Belum Dibayar (${data.overview.totalInvoiceValue?.period || ''})`,
      value: data.overview.unpaidInvoices.toString() || '0',
      change: `${data.overview.unpaidInvoices} dari ${data.overview.totalInvoices} faktur`,
      positive: true,
      icon: FileText,
      color: 'text-primary',
      bg: 'bg-accent',
    },
    {
      label: `Total Faktur (${data.overview.totalInvoiceValue?.period || ''})`,
      value: data.overview.totalInvoiceValue?.formatted || 'Rp 0',
      change: `${data.overview.totalInvoices || 0} faktur`,
      positive: true,
      icon: FileText,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === opt.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground border border-border hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {stats.map((stat, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className={`text-xs mt-1 ${stat.positive ? 'text-success' : 'text-destructive'}`}>
                {stat.change}
              </p>
            </div>
          ))}
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-primary to-primary rounded-xl p-5 text-white shadow-lg shadow-blue-200">
            <p className="text-primary-foreground/60 text-sm">Total Pelanggan</p>
            <p className="text-3xl font-bold mt-1">{data?.overview.totalCustomers}</p>
            <p className="text-primary-foreground/75 text-xs mt-2">Aktif</p>
          </div>
          <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-xl p-5 text-white shadow-lg shadow-violet-200">
            <p className="text-violet-100 text-sm">Rasio Pembayaran</p>
            <p className="text-3xl font-bold mt-1">
              {data?.overview.totalInvoices
                ? Math.round(((data.overview.totalInvoices - data.overview.unpaidInvoices) / data.overview.totalInvoices) * 100)
                : 0}
              %
            </p>
            <p className="text-violet-200 text-xs mt-2">Tercapai</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Invoices */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Faktur Terbaru</h3>
              <a href="/faktur" className="text-sm text-primary hover:text-primary">Lihat Semua →</a>
            </div>
            <div className="p-4 space-y-3">
              {data?.recentInvoices.slice(0, 5).map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{inv.customerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(Number(inv.total))}
                    </p>
                    {Number(inv.amountPaid) > 0 && Number(inv.total) - Number(inv.amountPaid) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Sisa {formatCurrency(Number(inv.total) - Number(inv.amountPaid))}
                      </p>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        inv.status === 'paid'
                          ? 'bg-success/15 text-success'
                          : inv.status === 'sent'
                          ? 'bg-accent text-primary'
                          : inv.status === 'partial'
                          ? 'bg-amber-100 text-amber-700'
                          : inv.status === 'overdue'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {inv.status === 'paid' ? 'Lunas' : inv.status === 'sent' ? 'Terkirim' : inv.status === 'partial' ? 'Sebagian' : inv.status === 'overdue' ? 'Terlambat' : 'Draft'}
                    </span>
                  </div>
                </div>
              ))}
              {(!data?.recentInvoices || data.recentInvoices.length === 0) && (
                <p className="text-center text-sm text-muted-foreground py-4">Belum ada faktur</p>
              )}
            </div>
          </div>

          {/* Recent Expenses */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Pengeluaran Terbaru</h3>
              <a href="/pengeluaran" className="text-sm text-primary hover:text-primary">Lihat Semua →</a>
            </div>
            <div className="p-4 space-y-3">
              {data?.recentExpenses.slice(0, 5).map((exp: any) => (
                <div key={exp.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{exp.description}</p>
                    <p className="text-xs text-muted-foreground">{exp.vendorName || 'Tanpa vendor'}</p>
                  </div>
                  <p className="text-sm font-semibold text-destructive">{formatCurrency(exp.amount)}</p>
                </div>
              ))}
              {(!data?.recentExpenses || data.recentExpenses.length === 0) && (
                <p className="text-center text-sm text-muted-foreground py-4">Belum ada pengeluaran</p>
              )}
            </div>
          </div>
        </div>

        {/* Top Accounts */}
        {data?.topAccounts && data.topAccounts.length > 0 && (
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Saldo Akun Terbesar</h3>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.topAccounts.slice(0, 6).map((acc: any) => (
                <div key={acc.code} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">{acc.code}</p>
                    <p className="text-sm font-medium text-foreground">{acc.name}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{formatCurrency(acc.balance)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
