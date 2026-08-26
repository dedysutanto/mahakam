import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useFormHistory } from '../lib/useFormHistory'
import { formatCurrency } from '../lib/utils'
import { ArrowLeft, Plus, Search, ShoppingCart, Trash2, Eye, Pencil } from 'lucide-react'

interface PurchaseItem {
  id: string
  productId?: string | null
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

interface Purchase {
  id: string
  purchaseNumber: string
  status: string
  orderDate: string
  total: number
  notes: string | null
  vendor: { id: string; name: string; email?: string; phone?: string }
  items: PurchaseItem[]
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  ordered: 'Dipesan',
  received: 'Diterima',
}

const NEW_VENDOR = '__new_vendor__'

export default function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [taxes, setTaxes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // 'view' = read-only form, 'edit' = editable form (draft only), 'create' = new
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'view'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  useFormHistory(showForm, () => { setShowForm(false); resetForm() })
  const [search, setSearch] = useState('')

  const todayStr = new Date().toISOString().slice(0, 10)
  const [formData, setFormData] = useState({
    vendorId: '',
    orderDate: todayStr,
    taxId: '',
    items: [{ productId: '', description: '', quantity: 1, unitPrice: 0 }],
    notes: '',
  })

  const [newVendorOpen, setNewVendorOpen] = useState(false)
  const emptyNewVendor = { name: '', email: '', phone: '' }
  const [newVendor, setNewVendor] = useState(emptyNewVendor)

  const [newProdIdx, setNewProdIdx] = useState<number | null>(null)
  const [newProduct, setNewProduct] = useState({ name: '', price: 0 })

  const fetchData = () => {
    Promise.all([
      fetch('/api/purchases/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
      fetch('/api/customers/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
      fetch('/api/products/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
      fetch('/api/taxes/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
    ]).then(([purRes, custRes, prodRes, taxRes]) => {
      setPurchases(purRes.data || purRes)
      setVendors(custRes.data || custRes)
      setProducts(prodRes.data || prodRes)
      const taxList = taxRes.data || taxRes
      setTaxes(taxList)
      const def = (taxList as any[]).find((t) => t.isDefault)
      if (def) {
        setFormData((f) => ({ ...f, taxId: f.taxId || def.id }))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const filtered = purchases.filter((p) =>
    p.purchaseNumber.toLowerCase().includes(search.toLowerCase()) ||
    p.vendor?.name.toLowerCase().includes(search.toLowerCase())
  )

  // ---------- inline vendor creation ----------
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

  // ---------- item rows ----------
  const setItem = (idx: number, patch: Partial<typeof formData.items[0]>) => {
    const newItems = [...formData.items]
    Object.assign(newItems[idx], patch)
    setFormData({ ...formData, items: newItems })
  }

  const handleProductPick = (idx: number, value: string) => {
    if (value === '__new__') {
      setNewProdIdx(idx)
      return
    }
    setNewProdIdx(null)
    const p = products.find((x) => x.id === value)
    if (p) {
      setItem(idx, { productId: p.id, description: p.name, unitPrice: Number(p.price) })
    }
  }

  const handleCreateProduct = async () => {
    if (newProdIdx === null) return
    try {
      const res = await fetch('/api/products/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProduct.name, price: Number(newProduct.price), unit: 'pcs' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal membuat produk')
      }
      const created = await res.json()
      setProducts([...products, created])
      setItem(newProdIdx, { productId: created.id, description: created.name, unitPrice: Number(created.price) })
      setNewProdIdx(null)
      setNewProduct({ name: '', price: 0 })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const formTotal = formData.items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitPrice || 0), 0)

  const emptyForm = () => ({
    vendorId: '',
    orderDate: todayStr,
    taxId: '',
    items: [{ productId: '', description: '', quantity: 1, unitPrice: 0 }],
    notes: '',
  })

  const resetForm = () => {
    setEditingId(null)
    setFormMode('create')
    const def = taxes.find((t) => t.isDefault)
    setFormData({ ...emptyForm(), taxId: def?.id || '' })
  }

  // ---------- actions ----------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { taxId, ...rest } = formData
      const payload: any = { ...rest }
      if (taxId === '__none__') {
        payload.taxRate = 0 // explicit no-tax beats the tenant default fallback
      } else {
        payload.taxId = taxId
      }
      const editing = formMode === 'edit' && editingId
      const res = await fetch(editing ? `/api/purchases/${editingId}` : '/api/purchases/', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan pembelian')
      }
      setShowForm(false)
      resetForm()
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const closeForm = () => {
    setShowForm(false)
    resetForm()
  }

  const handleStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/purchases/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal mengubah status')
      }
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus pembelian ini?')) return
    try {
      const res = await fetch(`/api/purchases/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menghapus pembelian')
      }
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const loadIntoForm = async (id: string) => {
    const res = await fetch(`/api/purchases/${id}`)
    if (!res.ok) throw new Error('Gagal memuat pembelian')
    return res.json()
  }

  const openEdit = async (id: string) => {
    try {
      const p = await loadIntoForm(id)
      if (p.status !== 'draft') {
        alert('Hanya pembelian berstatus draft yang bisa diedit')
        return
      }
      setEditingId(id)
      setFormMode('edit')
      setFormData({
        vendorId: p.vendor?.id || '',
        orderDate: new Date(p.orderDate).toISOString().slice(0, 10),
        taxId: '__none__',
        items: (p.items || []).map((it: any) => ({
          productId: it.productId || '',
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
        notes: p.notes || '',
      })
      setShowForm(true)
      window.scrollTo({ top: 0 })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const openView = async (id: string) => {
    try {
      const p = await loadIntoForm(id)
      setEditingId(id)
      setFormMode('view')
      setFormData({
        vendorId: p.vendor?.id || '',
        orderDate: new Date(p.orderDate).toISOString().slice(0, 10),
        taxId: '__none__',
        items: (p.items || []).map((it: any) => ({
          productId: it.productId || '',
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
        notes: p.notes || '',
      })
      setShowForm(true)
      window.scrollTo({ top: 0 })
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
            <h1 className="text-xl font-bold text-foreground">Pembelian</h1>
            <p className="text-sm text-muted-foreground">Kelola pembelian dari vendor</p>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Buat Pembelian
          </button>
        </div>
        )}

{showForm && (
          <button
            type="button"
            onClick={closeForm}
            className="btn btn-secondary btn-sm flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
          </button>
        )}
        {showForm && (
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">
              {formMode === 'view' ? 'Detail Pembelian' : formMode === 'edit' ? 'Edit Pembelian' : 'Buat Pembelian Baru'}
            </h2>
            {formMode !== 'create' && (
              <span className={`badge ${formMode === 'edit' ? 'badge-warning' : 'badge-info'}`}>
                {formMode === 'edit' ? 'Dapat diedit (draft)' : 'Hanya lihat'}
              </span>
            )}
          </div>
        )}
        {showForm && (
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Vendor</label>
                  <select
                    required
                    className="input"
                    disabled={formMode === 'view'}
                    value={formData.vendorId}
                    onChange={(e) => handleVendorSelect(e.target.value)}
                  >
                    <option value="">Pilih vendor...</option>
                    {vendors.filter((v) => v.type === 'vendor').map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                    {!formMode || formMode !== 'view' ? <option value={NEW_VENDOR}>+ Buat vendor baru...</option> : null}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    className="input"
                    disabled={formMode === 'view'}
                    value={formData.orderDate}
                    onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Pajak</label>
                  <select
                    className="input"
                    disabled={formMode === 'view'}
                    value={formData.taxId || ''}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  >
                    <option value="__none__">Tanpa pajak</option>
                    {taxes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {Number(t.rate)}%{t.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {newVendorOpen && (
                <div className="border border-accent bg-accent/40 rounded-lg p-3 space-y-3">
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-foreground">Item Pembelian</label>
                  <span className="text-sm font-semibold text-foreground">Total: {formatCurrency(formTotal)}</span>
                </div>
                {formData.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                    <div className="col-span-4">
                      <select
                        className="input"
                        value={item.productId}
                        onChange={(e) => handleProductPick(idx, e.target.value)}
                      >
                        <option value="">Pilih produk...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        <option value="__new__">+ Produk baru...</option>
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        required
                        className="input"
                        placeholder="Deskripsi"
                        value={item.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })}
                      />
                    </div>
                    <div className="col-span-1">
                      <input
                        type="number" min="1" className="input" placeholder="Qty" title="Qty"
                        value={item.quantity}
                        onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number" min="0" className="input" placeholder="Harga" title="Harga"
                        value={item.unitPrice}
                        onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          className="p-2 text-muted-foreground/70 hover:text-destructive"
                          title="Hapus baris"
                          onClick={() => setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) })}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {newProdIdx !== null && (
                  <div className="border border-accent bg-accent/40 rounded-lg p-3 space-y-3 mt-2">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">Produk Baru</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        type="text" required placeholder="Nama produk *" className="input md:col-span-2"
                        value={newProduct.name}
                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                      />
                      <input
                        type="number" min="0" required placeholder="Harga beli *" className="input"
                        value={newProduct.price}
                        onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary" onClick={() => { setNewProdIdx(null); setNewProduct({ name: '', price: 0 }) }}>
                        Batal
                      </button>
                      <button type="button" className="btn btn-primary" onClick={handleCreateProduct}>
                        Simpan Produk
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="text-sm text-primary hover:text-primary mt-1"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      items: [...formData.items, { productId: '', description: '', quantity: 1, unitPrice: 0 }],
                    })
                  }
                >
                  + Tambah Item
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Catatan</label>
                <textarea
                  className="input min-h-[60px]"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan tambahan..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Buat Pembelian
                </button>
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
            placeholder="Cari pembelian/vendor..."
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
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">No. Pembelian</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tanggal</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted">
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-primary">{p.purchaseNumber}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-foreground">{p.vendor?.name}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{new Date(p.orderDate).toLocaleDateString('id-ID')}</td>
                    <td className="px-5 py-3 text-sm text-right font-medium text-foreground">{formatCurrency(p.total)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`badge ${p.status === 'received' ? 'badge-success' : p.status === 'ordered' ? 'badge-info' : 'badge-default'}`}>
                        {statusLabels[p.status] || p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openView(p.id)} title="Lihat detail" className="p-1 text-muted-foreground hover:text-primary">
                          <Eye className="w-4 h-4" />
                        </button>
                        {p.status === 'draft' && (
                          <button onClick={() => openEdit(p.id)} title="Edit (draft)" className="p-1 text-muted-foreground hover:text-primary">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {(() => {
                          const flow = ['draft', 'ordered', 'received']
                          const nexts = flow.slice(flow.indexOf(p.status) + 1)
                          if (nexts.length === 0) return null
                          return (
                            <select
                              value=""
                              onChange={(e) => e.target.value && handleStatus(p.id, e.target.value)}
                              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground hover:border-ring focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                            >
                              <option value="">{statusLabels[p.status] || p.status} ▸</option>
                              {nexts.map((s) => (
                                <option key={s} value={s}>{statusLabels[s]}</option>
                              ))}
                            </select>
                          )
                        })()}
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }} title="Hapus" className="p-1 text-muted-foreground/70 hover:text-destructive">
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
              <ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Tidak ada pembelian ditemukan</p>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </Layout>
  )
}