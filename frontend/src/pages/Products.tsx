import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { ArrowLeft, Plus, Search, Package, Trash2, Pencil } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

interface Product {
  id: string
  name: string
  sku: string | null
  unit: string
  description: string | null
  price: number
  isActive: boolean
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const emptyForm = { name: '', sku: '', unit: 'pcs', description: '', price: 0 }
  const [formData, setFormData] = useState(emptyForm)

  const fetchData = () => {
    fetch('/api/products/')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch')
        return r.json()
      })
      .then((res) => {
        setProducts(res.data || res)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => {
    setEditId(null)
    setFormData(emptyForm)
    setShowForm(true)
  }

  const openEdit = (p: Product) => {
    setEditId(p.id)
    setFormData({ name: p.name, sku: p.sku || '', unit: p.unit, description: p.description || '', price: Number(p.price) })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(editId ? `/api/products/${editId}` : '/api/products/', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, price: Number(formData.price) }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan produk')
      }
      setShowForm(false)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus produk ini?')) return
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menghapus produk')
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
            <h1 className="text-xl font-bold text-foreground">Produk</h1>
            <p className="text-sm text-muted-foreground">Katalog produk & jasa</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Tambah Produk
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
          <h2 className="text-xl font-bold text-foreground">{editId ? 'Edit Produk' : 'Tambah Produk'}</h2>
        )}
        {showForm && (
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nama *</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nama produk/jasa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">SKU</label>
                <input
                  type="text"
                  className="input"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="Kode produk"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Satuan</label>
                <select
                  className="input"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                >
                  {['pcs', 'unit', 'box', 'kg', 'liter', 'jam', 'lisensi', 'langganan'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Harga Jual (Rp)</label>
                <input
                  type="number"
                  min="0"
                  required
                  className="input"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">Deskripsi</label>
                <textarea
                  className="input min-h-[60px]"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Deskripsi singkat..."
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        )}

        {!showForm && (
        <>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Cari produk/SKU..."
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nama</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Satuan</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Harga</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted">
                    <td className="px-5 py-3 text-sm font-medium text-foreground">{p.name}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground font-mono">{p.sku || '-'}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{p.unit}</td>
                    <td className="px-5 py-3 text-sm text-right font-medium text-foreground">{formatCurrency(p.price)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} title="Edit" className="p-1 text-muted-foreground hover:text-primary">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(p.id)} title="Hapus" className="p-1 text-muted-foreground/70 hover:text-destructive">
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
              <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Tidak ada produk ditemukan</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Daftar kosong — buat produk pertama Anda</p>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </Layout>
  )
}