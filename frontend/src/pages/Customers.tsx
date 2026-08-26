import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useFormHistory } from '../lib/useFormHistory'
import { ArrowLeft, Plus, Search, Users, Pencil, Trash2 } from 'lucide-react'
import { PROVINCES_ID, DEFAULT_COUNTRY } from '../lib/regions'

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  province?: string | null
  country?: string | null
  taxId: string
  type: string
  isActive: boolean
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  useFormHistory(showForm, () => { setShowForm(false); setEditingId(null) })
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const emptyForm = () => ({
    name: '',
    email: '',
    phone: '',
    address: '',
    province: '',
    country: DEFAULT_COUNTRY,
    taxId: '',
    type: 'customer',
  })
  const [formData, setFormData] = useState(emptyForm)

  const fetchData = () => {
    fetch('/api/customers/')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch')
        return r.json()
      })
      .then((res) => {
        setCustomers(res.data || res)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  // For now, create a simple customer page that will work with the API
  const filtered = customers.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || c.type === typeFilter
    return matchSearch && matchType
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingId ? `/api/customers/${editingId}` : '/api/customers/'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan')
      }
      setShowForm(false)
      setEditingId(null)
      setFormData(emptyForm())
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const openEdit = (c: Customer) => {
    setEditingId(c.id)
    setFormData({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '', province: c.province || '', country: c.country || DEFAULT_COUNTRY, taxId: c.taxId || '', type: c.type || 'customer' })
    setShowForm(true)
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

  if (showForm) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowForm(false); setEditingId(null) }}
              className="btn btn-secondary btn-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{editingId ? 'Edit Pelanggan/Vendor' : 'Tambah Pelanggan/Vendor'}</h1>
              <p className="text-sm text-muted-foreground">{editingId ? 'Ubah data pelanggan/vendor' : 'Isi data pelanggan/vendor baru'}</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nama</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nama perusahaan/perorangan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                <input
                  type="email"
                  className="input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@perusahaan.co.id"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Telepon</label>
                <input
                  type="text"
                  className="input"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+62 812 3456 7890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">NPWP</label>
                <input
                  type="text"
                  className="input"
                  value={formData.taxId}
                  onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  placeholder="01.234.567.8-901.000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tipe</label>
                <select
                  className="input"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="customer">Pelanggan</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Alamat</label>
                <input
                  type="text"
                  className="input"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Alamat lengkap"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Provinsi</label>
                {formData.country === DEFAULT_COUNTRY ? (
                  <select
                    className="input"
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  >
                    <option value="">Pilih provinsi...</option>
                    {PROVINCES_ID.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input"
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    placeholder="Province / State"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Negara</label>
                <input
                  type="text"
                  className="input"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder={DEFAULT_COUNTRY}
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 mt-2">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null) }}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Simpan Perubahan' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Pelanggan & Vendor</h1>
            <p className="text-sm text-muted-foreground">Kelola daftar pelanggan dan vendor</p>
          </div>
          <button onClick={() => { setEditingId(null); setFormData(emptyForm()); setShowForm(true) }} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Tambah
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Cari pelanggan/vendor..."
              className="input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-fit"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Semua</option>
            <option value="customer">Pelanggan</option>
            <option value="vendor">Vendor</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nama</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Telepon</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">NPWP</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipe</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted cursor-pointer" onClick={() => openEdit(c)}>
                    <td className="px-5 py-3 text-sm font-medium text-foreground">{c.name}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{c.email}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{c.phone}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground font-mono">{c.taxId}</td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className={`badge ${c.type === 'customer' ? 'badge-info' : 'badge-warning'}`}
                      >
                        {c.type === 'customer' ? 'Pelanggan' : 'Vendor'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(c)} title="Edit" className="p-1 text-muted-foreground hover:text-primary">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button className="p-1 text-muted-foreground/70 hover:text-destructive" onClick={(e) => { e.stopPropagation(); /* TODO: confirm delete */ }}>
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
              <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Tidak ada data pelanggan/vendor</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Daftar kosong — buat entri pertama Anda</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
