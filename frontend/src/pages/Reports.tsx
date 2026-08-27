import { useState } from 'react'
import Layout from '../components/Layout'
import { useFormHistory } from '../lib/useFormHistory'
import { formatCurrency, formatDateDMY } from '../lib/utils'
import DatePicker from '../components/DatePicker'
import { BarChart3, FileText, TrendingUp, ArrowLeft, Printer } from 'lucide-react'

interface ReportData {
  title: string
  period?: { from: string; to: string }
  asOf?: string
  revenue?: { total: number; formatted: string; accounts: any[] }
  expense?: { total: number; formatted: string; accounts: any[] }
  profit?: { amount: number; formatted: string; isProfit: boolean }
  assets?: { total: number; formatted: string; accounts: any[] }
  liabilities?: { total: number; formatted: string; accounts: any[] }
  equity?: { total: number; formatted: string; accounts: any[] }
  movements?: any[]
  endingBalance?: number
  total?: number
  byCategory?: any[]
  items?: any[]
  summary?: any
  aging?: any
}

const reports = [
  { id: 'laba-rugi', name: 'Laba Rugi', icon: TrendingUp, desc: 'Laporan Rugi & Laba (Income Statement)' },
  { id: 'neraca', name: 'Neraca', icon: FileText, desc: 'Laporan Posisi Keuangan (Balance Sheet)' },
  { id: 'arus-kas', name: 'Arus Kas', icon: BarChart3, desc: 'Laporan Arus Kas (Cash Flow Statement)' },
  { id: 'pengeluaran', name: 'Pengeluaran', icon: FileText, desc: 'Laporan Rincian Pengeluaran' },
  { id: 'piutang-hutang', name: 'Piutang & Hutang', icon: FileText, desc: 'Laporan Aging Piutang & Utang' },
]

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  useFormHistory(selectedReport !== null, () => { setSelectedReport(null); setData(null) })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const params = new URLSearchParams()
  if (dateFrom) params.set('dateFrom', dateFrom)
  if (dateTo) params.set('dateTo', dateTo)
  const qs = params.toString() ? `?${params.toString()}` : ''

  const fetchReport = async (id: string) => {
    setSelectedReport(id)
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/${id}${qs}`)
      if (!res.ok) throw new Error('Gagal memuat laporan')
      const json = await res.json()
      setData(json)
    } catch {
      setData(null)
    }
    setLoading(false)
  }

  if (selectedReport) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedReport(null); setData(null) }} className="btn btn-ghost">
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </button>
            <h1 className="text-xl font-bold text-foreground">{data?.title}</h1>
            <button onClick={() => window.print()} className="btn btn-ghost ml-auto">
              <Printer className="w-4 h-4" />
              Cetak
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : data ? (
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              {/* Period */}
              <div className="mb-6 pb-4 border-b">
                <p className="text-sm text-muted-foreground">
                  Periode: {data.period?.from || data.asOf || '-'} s/d {data.period?.to || '-'}
                </p>
              </div>

              {/* Laba Rugi */}
              {data.revenue && data.profit && (
                <div>
                  <h3 className="font-semibold text-foreground mb-4">PENDAPATAN</h3>
                  {data.revenue.accounts.map((acc: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 text-sm">
                      <span className="text-muted-foreground">{acc.name}</span>
                      <span className="text-foreground">{formatCurrency(acc.credit - acc.debit)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t font-semibold text-foreground">
                    <span>Total Pendapatan</span>
                    <span>{data.revenue.formatted}</span>
                  </div>

                  <h3 className="font-semibold text-foreground mt-6 mb-4">BEBAN</h3>
                  {data.expense?.accounts.map((acc: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 text-sm">
                      <span className="text-muted-foreground">{acc.name}</span>
                      <span className="text-foreground">{formatCurrency(acc.debit - acc.credit)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t font-semibold text-foreground">
                    <span>Total Beban</span>
                    <span>{data.expense?.formatted}</span>
                  </div>

                  <div className={`flex justify-between py-4 border-t-2 font-bold text-lg mt-4 ${data.profit.isProfit ? 'text-success' : 'text-destructive'}`}>
                    <span>{data.profit.isProfit ? 'LABA BERSIH' : 'RUGI BERSIH'}</span>
                    <span>{data.profit.formatted}</span>
                  </div>
                </div>
              )}

              {/* Neraca */}
              {data.assets && (
                <div>
                  <h3 className="font-semibold text-foreground mb-4">ASET</h3>
                  {data.assets.accounts.map((acc: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 text-sm">
                      <span className="text-muted-foreground">{acc.code} - {acc.name}</span>
                      <span className="text-foreground">{formatCurrency(acc.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t font-semibold text-foreground">
                    <span>Total Aset</span>
                    <span>{data.assets.formatted}</span>
                  </div>

                  <h3 className="font-semibold text-foreground mt-6 mb-4">KEWAJIBAN</h3>
                  {data.liabilities?.accounts.map((acc: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 text-sm">
                      <span className="text-muted-foreground">{acc.code} - {acc.name}</span>
                      <span className="text-foreground">{formatCurrency(acc.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t font-semibold text-foreground">
                    <span>Total Kewajiban</span>
                    <span>{data.liabilities?.formatted}</span>
                  </div>

                  <h3 className="font-semibold text-foreground mt-6 mb-4">EKUITAS</h3>
                  {data.equity?.accounts.map((acc: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 text-sm">
                      <span className="text-muted-foreground">{acc.code} - {acc.name}</span>
                      <span className="text-foreground">{formatCurrency(acc.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t font-semibold text-foreground">
                    <span>Total Ekuitas</span>
                    <span>{data.equity?.formatted}</span>
                  </div>
                </div>
              )}

              {/* Arus Kas */}
              {data.movements && (
                <div>
                  <div className="flex justify-between py-3 border-t-2 font-bold text-lg">
                    <span>Saldo Akhir Kas</span>
                    <span>{formatCurrency(data.endingBalance || 0)}</span>
                  </div>

                  <h3 className="font-semibold text-foreground mt-6 mb-4">RINCIAN ARUS KAS</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 text-muted-foreground">Tanggal</th>
                          <th className="text-left py-2 text-muted-foreground">Keterangan</th>
                          <th className="text-right py-2 text-muted-foreground">Debit</th>
                          <th className="text-right py-2 text-muted-foreground">Kredit</th>
                          <th className="text-right py-2 text-muted-foreground">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.movements.map((m: any, i: number) => (
                          <tr key={i} className="border-b border-border">
                            <td className="py-2 text-muted-foreground">{formatDateDMY(m.date)}</td>
                            <td className="py-2 text-foreground">{m.description}</td>
                            <td className="py-2 text-right text-success">{m.debit > 0 ? formatCurrency(m.debit) : '-'}</td>
                            <td className="py-2 text-right text-destructive">{m.credit > 0 ? formatCurrency(m.credit) : '-'}</td>
                            <td className="py-2 text-right font-medium">{formatCurrency(m.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pengeluaran detail */}
              {data.byCategory && (
                <div>
                  <h3 className="font-semibold text-foreground mb-4">KATEGORI</h3>
                  {data.byCategory.map((cat: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 text-sm">
                      <span className="text-muted-foreground">{cat.name}</span>
                      <span className="text-foreground">{cat.formatted}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t font-semibold text-foreground">
                    <span>Total</span>
                    <span>{formatCurrency(data.endingBalance || 0)}</span>
                  </div>
                </div>
              )}

              {/* Piutang & Hutang */}
              {data.aging && (
                <div>
                  <div className="flex justify-between py-2 font-semibold text-foreground">
                    <span>Total Outstanding</span>
                    <span>{data.summary.formatted}</span>
                  </div>

                  <h3 className="font-semibold text-foreground mt-6 mb-4">AGING ANALYSIS</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                    {(Object.entries(data.aging) as [string, any][]).map(([key, val]) => {
                      const labels: Record<string, string> = {
                        current: 'Sesuai Tempo',
                        days30: '30 Hari',
                        days60: '60 Hari',
                        days90: '90 Hari',
                        over90: '> 90 Hari',
                      }
                      return (
                        <div key={key} className="bg-muted rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground">{labels[key]}</p>
                          <p className="text-sm font-semibold text-foreground mt-1">{formatCurrency(val.amount)}</p>
                          <p className="text-xs text-muted-foreground/70">{val.count} faktur</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Data tidak tersedia</div>
          )}
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Laporan Keuangan</h1>
          <p className="text-sm text-muted-foreground">Pilih jenis laporan yang ingin ditampilkan</p>
        </div>

        {/* Date Filters */}
        <div className="flex flex-col sm:flex-row gap-4 bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-1">Dari Tanggal</label>
            <DatePicker
              className="input"
              value={dateFrom}
              onChange={setDateFrom}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-1">Sampai Tanggal</label>
            <DatePicker
              className="input"
              value={dateTo}
              onChange={setDateTo}
            />
          </div>
          <button
            onClick={() => selectedReport && fetchReport(selectedReport)}
            className="btn btn-primary self-end"
            disabled={!selectedReport}
          >
            Terapkan
          </button>
        </div>

        {/* Report Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <button
              key={report.id}
              onClick={() => fetchReport(report.id)}
              className="card p-5 text-left hover:shadow-md transition-shadow hover:border-ring group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center group-hover:bg-accent transition-colors">
                  <report.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{report.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{report.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Layout>
  )
}
