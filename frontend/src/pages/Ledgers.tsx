import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { Plus, Pencil, Trash2, BookOpen, Search } from 'lucide-react'

interface Ledger {
  id: string
  code: string
  name: string
  type: string
  parentId: string | null
  isSystem: boolean
  isActive: boolean
  parent: string | null
}

const typeLabels: Record<string, string> = {
  asset: 'Aset',
  liability: 'Kewajiban',
  equity: 'Ekuitas',
  revenue: 'Pendapatan',
  expense: 'Beban',
}

export default function Ledgers() {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({ code: '', name: '', type: 'asset', parentId: '' })
  const [filterType, setFilterType] = useState<string>('all')

  const fetchLedgers = () => {
    fetch('/api/ledgers/')
      .then((r) => r.json())
      .then((d) => {
        setLedgers(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchLedgers() }, [])

  const filtered = ledgers.filter((l) => {
    const matchSearch =
      l.code.toLowerCase().includes(search.toLowerCase()) ||
      l.name.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || l.type === filterType
    return matchSearch && matchType
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch('/api/ledgers/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      setShowForm(false)
      fetchLedgers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleEditAccount = async (acc: any) => {
    if (acc.isSystem) return
    const name = prompt('Nama akun:', acc.name)
    if (!name || name === acc.name) return
    try {
      const res = await fetch(`/api/ledgers/${acc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: acc.code, name, type: acc.type }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal mengubah akun')
      }
      fetchLedgers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus akun ini?')) return
    try {
      await fetch(`/api/ledgers/${id}`, { method: 'DELETE' })
      fetchLedgers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const grouped = filtered.reduce((acc, l) => {
    if (!acc[l.type]) acc[l.type] = []
    acc[l.type].push(l)
    return acc
  }, {} as Record<string, Ledger[]>)

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Buku Besar</h1>
            <p className="text-sm text-muted-foreground">Daftar akun buku besar (Chart of Accounts)</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Tambah Akun
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h3 className="font-semibold text-foreground mb-4">Tambah Akun Baru</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Kode Akun</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="1-1100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nama Akun</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nama akun"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tipe</label>
                <select
                  className="input"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  {Object.entries(typeLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button type="submit" className="btn btn-primary flex-1">Simpan</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Batal
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Cari akun..."
              className="input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-fit"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">Semua Tipe</option>
            {Object.entries(typeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Table by type */}
        {Object.entries(grouped).map(([type, accounts]) => (
          <div key={type} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted">
              <h3 className="font-semibold text-foreground">{typeLabels[type]}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kode</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nama Akun</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Induk</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-muted">
                      <td className="px-5 py-3">
                        <span className="text-sm font-mono text-muted-foreground">{acc.code}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-sm text-foreground">{acc.name}</span>
                      </td>
                      <td className="px-5 py-3">
                        {acc.parent ? (
                          <span className="text-xs text-muted-foreground">{acc.parent}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/70">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {acc.isSystem ? (
                            <span className="text-xs text-muted-foreground/70 italic">Sistem</span>
                          ) : (
                            <>
                              <button onClick={() => handleEditAccount(acc)} title="Edit" className="p-1 text-muted-foreground hover:text-primary">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(acc.id)} className="text-muted-foreground/70 hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">Tidak ada akun ditemukan</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
