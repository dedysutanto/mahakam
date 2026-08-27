export const PERIOD_OPTIONS = [
  { key: '30d', label: '30 Hari' },
  { key: 'this_month', label: 'Bulan Ini' },
  { key: 'last_month', label: 'Bulan Lalu' },
  { key: 'this_year', label: 'Tahun Ini' },
  { key: 'last_year', label: 'Tahun Lalu' },
  { key: 'all', label: 'Semua' },
]

export function matchPeriod(dateStr: string, period: string): boolean {
  if (period === 'all') return true
  const now = new Date()
  const d = new Date(dateStr)
  switch (period) {
    case '30d':
      return d >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case 'this_month':
      return d >= new Date(now.getFullYear(), now.getMonth(), 1)
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return d >= from && d <= to
    }
    case 'this_year':
      return d >= new Date(now.getFullYear(), 0, 1)
    case 'last_year': {
      const from = new Date(now.getFullYear() - 1, 0, 1)
      const to = new Date(now.getFullYear(), 0, 0, 23, 59, 59, 999)
      return d >= from && d <= to
    }
    default:
      return true
  }
}

interface PeriodFilterProps {
  value: string
  onChange: (value: string) => void
}

export default function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === opt.key
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground border border-border hover:bg-muted'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
