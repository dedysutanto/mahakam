import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useFormHistory } from '../lib/useFormHistory'
import { formatCurrency } from '../lib/utils'
import { ArrowLeft, Plus, Search, Receipt, Trash2, Pencil } from 'lucide-react'

interface Expense {
  id: string
  expenseNumber: string
  description: string
  amount: number
  date: string
  category: string
  vendorName: string
  status: string
  ledger: { code: string; name: string }
  ledgerId?: string
  vendorId?: string | null
  notes?: string | null
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [ledgers, setLedgers] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  useFormHistory(showForm, () => setShowForm(false))
  const [search, setSearch] = useState('')
  const emptyForm = () => ({
    ledgerId: '',
    vendorId: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: '',
    notes: '',
  })
  const [editId, setEditId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)

  const NEW_VENDOR = '__new_vendor__'
  const emptyNewVendor = { name: '', email: '', phone: '' }
  const [newVendorOpen, setNewVendorOpen] = useState(false)
  const [newVendor, setNewVendor] = useState(emptyNewVendor)

  const fetchData = () => {
    Promise.all([
      fetch('/api/expenses/').then((r) => r.json()),
      fetch('/api/ledgers/').then((r) => r.json()),
      fetch('/api/customers/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
    ]).then(([expRes, ledRes, custRes]) => {
      setExpenses(expRes.data || expRes)
      setLedgers(ledRes)
      setVendors(custRes.data || custRes)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const filtered = expenses.filter(
    (exp) =>
      exp.expenseNumber.toLowerCase().includes(search.toLowerCase()) ||
      exp.description.toLowerCase().includes(search.toLowerCase()) ||
      (exp.vendorName || '').toLowerCase().includes(search.toLowerCase())
  )

  // ---------- vendor select (mirrors Purchases flow) ----------
  const handleVendorSelect = (value: string) => {
    if (value === NEW_VENDOR) {
      setNewVendorOpen(true)
    } else {
      setFormData({ ...formData, vendorId: value })
    }
  }

  const handleCreateVendor = async () => {
    try {
      const res = await fetch('/api/customers/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newVendor, type: 'vendor' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal membuat vendor')
      }
      const created = await res.json()
      setVendors([...vendors, created])
      setFormData((f) => ({ ...f, vendorId: created.id }))
      setNewVendorOpen(false)
      setNewVendor(emptyNewVendor)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const openEdit = (exp: Expense) => {
    setEditId(exp.id)
    setFormData({
      ledgerId: exp.ledgerId || '',
      vendorId: exp.vendorId || '',
      description: exp.description,
      amount: String(Number(exp.amount)),
      date: new Date(exp.date).toISOString().split('T')[0],
      category: exp.category || '',
      notes: exp.notes || '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(editId ? `/api/expenses/${editId}` : '/api/expenses/', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: Number(formData.amount),
          vendorName: null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan pengeluaran')
      }
      setShowForm(false)
      setEditId(null)
      setFormData(emptyForm())
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus pengeluaran ini?')) return
    try {
      await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const totalExpenses = filtered.reduce((s, e) => s + Number(e.amount), 0)

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
        {!showForm && (
        <>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Pengeluaran</h1>
            <p className="text-sm text-muted-foreground">Kelola pengeluaran perusahaan</p>
          </div>
          <button onClick={() => { setEditId(null); setFormData(emptyForm()); setShowForm(true) }} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Tambah Pengeluaran
          </button>
        </div>

        {/* Summary */}
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-destructive font-medium">Total Pengeluaran Tercatat</p>
            <p className="text-2xl font-bold text-destructive mt-1">{formatCurrency(totalExpenses)}</p>
          </div>
          <Receipt className="w-10 h-10 text-destructive/70" />
        </div>
        </>
        )}

        {showForm && (
          <button
            type="button"
            onClick={() => { setEditId(null); setShowForm(false) }}
            className="btn btn-secondary btn-sm flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
          </button>
        )}
        {showForm && (
          <h2 className="text-xl font-bold text-foreground">{editId ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</h2>
        )}
        {showForm && (
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Akun Beban</label>
                <select
                  className="input"
                  required
                  value={formData.ledgerId}
                  onChange={(e) => setFormData({ ...formData, ledgerId: e.target.value })}
                >
                  <option value="">Pilih akun...</option>
                  {ledgers
                    .filter((l) => l.type === 'expense')
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} - {l.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Vendor</label>
                <select
                  className="input"
                  value={formData.vendorId || ''}
                  onChange={(e) => handleVendorSelect(e.target.value)}
                >
                  <option value="">Pilih vendor...</option>
                  {vendors.filter((v) => v.type === 'vendor').map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                  <option value={NEW_VENDOR}>+ Buat vendor baru...</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Jumlah (Rp)</label>
                <input
                  type="number"
                  required
                  className="input"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="100000"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-foreground mb-1">Deskripsi</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Deskripsi pengeluaran"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tanggal</label>
                <input
                  type="date"
                  required
                  className="input"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Kategori</label>
                <input
                  type="text"
                  className="input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Operasional, Gaji, dll"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">Catatan</label>
                <input
                  type="text"
                  className="input"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan tambahan..."
                />
              </div>

              {newVendorOpen && (
                <div className="md:col-span-3 border border-accent bg-accent/40 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">Vendor Baru</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text" required placeholder="Nama vendor *" className="input"
                      value={newVendor.name}
                      onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                    />
                    <input
                      type="email" placeholder="Email" className="input"
                      value={newVendor.email}
                      onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                    />
                    <input
                      type="text" placeholder="Telepon" className="input"
                      value={newVendor.phone}
                      onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-secondary" onClick={() => { setNewVendorOpen(false); setNewVendor(emptyNewVendor) }}>
                      Batal
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleCreateVendor}>
                      Simpan Vendor
                    </button>
                  </div>
                </div>
              )}

              <div className="md:col-span-3 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => { setEditId(null); setShowForm(false) }}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan
                </button>
              </div>
            </form>
          </div>
        )}

        {!showForm && (
        <>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Cari pengeluaran..."
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">No. Pengeluaran</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deskripsi</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Akun</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kategori</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tanggal</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jumlah</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((exp) => (
                  <tr key={exp.id} className="hover:bg-muted">
                    <td className="px-5 py-3 text-sm font-mono text-muted-foreground">{exp.expenseNumber}</td>
                    <td className="px-5 py-3 text-sm text-foreground">{exp.description}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{exp.vendorName || '-'}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">
                      {exp.ledger.code} - {exp.ledger.name}
                    </td>
                    <td className="px-5 py-3">
                      {exp.category ? (
                        <span className="badge badge-default">{exp.category}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{new Date(exp.date).toLocaleDateString('id-ID')}</td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-destructive">{formatCurrency(exp.amount)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(exp)}
                          title="Edit"
                          className="p-1 text-muted-foreground hover:text-primary"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id)}
                          title="Hapus"
                          className="p-1 text-muted-foreground/70 hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Receipt className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Tidak ada pengeluaran ditemukan</p>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </Layout>
  )
}
