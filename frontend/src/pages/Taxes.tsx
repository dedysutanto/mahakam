import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { ArrowLeft, Plus, Percent, Trash2, Pencil } from 'lucide-react'

interface Tax {
  id: string
  name: string
  rate: number
  isDefault: boolean
  isActive: boolean
}

export default function Taxes() {
  const [taxes, setTaxes] = useState<Tax[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const emptyForm = { name: '', rate: 11, isDefault: false }
  const [formData, setFormData] = useState(emptyForm)

  const fetchData = () => {
    fetch('/api/taxes/')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch')
        return r.json()
      })
      .then((res) => {
        setTaxes(res.data || res)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const openCreate = () => {
    setEditId(null)
    // Suggest the current default rate as starting point
    const def = taxes.find((t) => t.isDefault)
    setFormData({ name: '', rate: def ? Number(def.rate) : 11, isDefault: false })
    setShowForm(true)
  }

  const openEdit = (t: Tax) => {
    setEditId(t.id)
    setFormData({ name: t.name, rate: Number(t.rate), isDefault: t.isDefault })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(editId ? `/api/taxes/${editId}` : '/api/taxes/', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, rate: Number(formData.rate) }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan pajak')
      }
      setShowForm(false)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus pajak ini?')) return
    try {
      const res = await fetch(`/api/taxes/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menghapus pajak')
      }
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
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

  return (
    <Layout>
      <div className="space-y-6">
        {!showForm && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Pajak</h1>
            <p className="text-sm text-muted-foreground">Kelola tarif pajak (default dipakai otomatis di faktur & pembelian)</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Tambah Pajak
          </button>
        </div>
        )}

        {showForm && (
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="btn btn-secondary btn-sm flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
          </button>
        )}
        {showForm && (
          <h2 className="text-xl font-bold text-foreground">{editId ? 'Edit Pajak' : 'Tambah Pajak'}</h2>
        )}
        {showForm && (
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nama *</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="cth. PPN, PPh 23"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tarif (%) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className="input"
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  />
                  Jadikan default
                </label>
              </div>
              <div className="md:col-span-3 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        )}

        {!showForm && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nama</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tarif</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {taxes.map((t) => (
                <tr key={t.id} className="hover:bg-muted">
                  <td className="px-5 py-3 text-sm font-medium text-foreground">{t.name}</td>
                  <td className="px-5 py-3 text-sm text-right text-foreground">{Number(t.rate)}%</td>
                  <td className="px-5 py-3 text-center">
                    {t.isDefault ? (
                      <span className="badge badge-success">Default</span>
                    ) : (
                      <span className="badge badge-default">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(t)} title="Edit" className="p-1 text-muted-foreground hover:text-primary">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(t.id)} title="Hapus" className="p-1 text-muted-foreground/70 hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {taxes.length === 0 && (
            <div className="text-center py-12">
              <Percent className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Belum ada pajak — tambahkan PPN atau lainnya</p>
            </div>
          )}
        </div>
        )}
      </div>
    </Layout>
  )
}