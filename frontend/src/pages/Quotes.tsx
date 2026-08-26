import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { formatCurrency } from '../lib/utils'
import { Plus, Search, FileText, Trash2, Eye, Pencil, Download, ArrowRightCircle, ArrowLeft } from 'lucide-react'

const toDateInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

interface QuotationItem {
  id?: string
  productId?: string | null
  description: string
  quantity: number
  unitPrice: number
  discount?: number
  lineTotal?: number
}

interface Quotation {
  id: string
  quotationNumber: string
  status: string
  issueDate: string
  validUntil: string | null
  subtotal: number
  taxRate: number
  taxAmount: number
  discount: number
  total: number
  notes: string | null
  terms: string | null
  convertedInvoiceId: string | null
  customer: { id: string; name: string }
  items: QuotationItem[]
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  sent: 'Dikirim',
  accepted: 'Diterima',
  rejected: 'Ditolak',
  converted: 'Terkonversi',
}

const NEW_CUSTOMER = '__new_customer__'

export default function Quotes() {
  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [taxes, setTaxes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // 'view' = read-only form, 'edit' = editable form (draft only), 'create' = new
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'view'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingStatus, setViewingStatus] = useState('')
  const [returnToView, setReturnToView] = useState(false)
  const [search, setSearch] = useState('')
  const [converting, setConverting] = useState(false)

  const todayStr = new Date().toISOString().slice(0, 10)
  const emptyForm = () => ({
    customerId: '',
    issueDate: todayStr,
    validUntil: toDateInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
    taxId: '',
    discount: 0,
    items: [{ productId: '', description: '', quantity: 1, unitPrice: 0, discount: 0 }],
    notes: '',
    terms: '',
  })
  const [formData, setFormData] = useState(emptyForm)

  const resetForm = () => {
    setEditingId(null)
    setFormMode('create')
    const def = taxes.find((t) => t.isDefault)
    setFormData({ ...emptyForm(), taxId: def?.id || '' })
  }

  const fetchData = () => {
    Promise.all([
      fetch('/api/quotations/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
      fetch('/api/customers/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
      fetch('/api/products/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
      fetch('/api/taxes/').then((r) => { if (!r.ok) throw new Error(); return r.json() }),
    ]).then(([quoRes, custRes, prodRes, taxRes]) => {
      setQuotes(quoRes.data || quoRes)
      setCustomers(custRes.data || custRes)
      setProducts(prodRes.data || prodRes)
      setTaxes(taxRes.data || taxRes)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const filtered = quotes.filter((q) =>
    q.quotationNumber.toLowerCase().includes(search.toLowerCase()) ||
    q.customer?.name?.toLowerCase().includes(search.toLowerCase())
  )

  // ---------- form helpers ----------
  const handleCustomerSelect = (value: string) => {
    if (value === NEW_CUSTOMER) {
      const name = prompt('Nama pelanggan baru:')
      if (!name) return
      fetch('/api/customers/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'customer' }),
      }).then(async (r) => {
        if (!r.ok) throw new Error('Gagal membuat pelanggan')
        const created = await r.json()
        setCustomers([...customers, created])
        setFormData((f) => ({ ...f, customerId: created.id }))
      }).catch((err) => alert(err.message))
      return
    }
    setFormData({ ...formData, customerId: value })
  }

  const setItem = (idx: number, patch: Partial<typeof formData.items[0]>) => {
    const newItems = [...formData.items]
    Object.assign(newItems[idx], patch)
    setFormData({ ...formData, items: newItems })
  }

  const handleProductPick = (idx: number, value: string) => {
    const p = products.find((x) => x.id === value)
    if (p) {
      setItem(idx, { productId: p.id, description: p.name, unitPrice: Number(p.price) })
    }
  }

  const lineNet = (it: { quantity: number; unitPrice: number; discount?: number }) => {
    const pct = Math.min(Math.max(Number(it.discount || 0), 0), 100)
    return Number(it.quantity || 0) * Number(it.unitPrice || 0) * (1 - pct / 100)
  }
  const subtotalCalc = formData.items.reduce((s, it) => s + lineNet(it), 0)
  const disc = Number(formData.discount || 0)
  const taxableBase = Math.max(subtotalCalc - disc, 0)
  const selectedTax = taxes.find((t) => t.id === formData.taxId)
  const taxAmountCalc = taxableBase * ((selectedTax ? Number(selectedTax.rate) : 0) / 100)
  const grandTotal = taxableBase + taxAmountCalc

  // ---------- actions ----------
  const buildPayload = () => {
    const { taxId, ...rest } = formData
    const payload: any = { ...rest }
    payload.discount = Number(payload.discount || 0)
    if (taxId === '__none__') {
      payload.taxRate = 0
    } else {
      payload.taxId = taxId
    }
    return payload
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const editing = formMode === 'edit' && editingId
      const res = await fetch(editing ? `/api/quotations/${editingId}` : '/api/quotations/', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan penawaran')
      }
      if (formMode === 'edit' && returnToView && editingId) {
        const updated = await res.json()
        setFormData(mapQuoteToForm(updated))
        setViewingStatus(updated.status)
        setFormMode('view')
        fetchData()
        return
      }
      setShowForm(false)
      resetForm()
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const closeForm = () => {
    // Edit yang dimulai dari Detail kembali ke Detail (perubahan dibuang)
    if (returnToView && formMode === 'edit' && editingId) {
      loadIntoForm(editingId).then((q) => {
        setFormData((f) => ({
          ...f,
          ...mapQuoteToForm(q),
        }))
        setViewingStatus(q.status)
        setFormMode('view')
      })
      setReturnToView(false)
      return
    }
    setShowForm(false)
    resetForm()
  }

  const mapQuoteToForm = (q: any) => ({
    customerId: q.customer?.id || '',
    issueDate: new Date(q.issueDate).toISOString().slice(0, 10),
    validUntil: q.validUntil ? new Date(q.validUntil).toISOString().slice(0, 10) : '',
    taxId: q.taxId
      || taxes.find((t) => Number(t.rate) === Number(q.taxRate ?? 0))?.id
      || (Number(q.taxRate ?? 0) === 0 ? '__none__' : ''),
    discount: Number(q.discount || 0),
    items: (q.items || []).map((it: any) => {
      const pid = it.productId || products.find((p: any) => p.name === it.description)?.id || ''
      return {
        productId: pid,
        description: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        discount: Number(it.discount || 0),
        unit: it.product?.unit || '',
      }
    }),
    notes: q.notes || '',
    terms: q.terms || '',
  })

  const loadIntoForm = async (id: string) => {
    const res = await fetch(`/api/quotations/${id}`)
    if (!res.ok) throw new Error('Gagal memuat penawaran')
    return res.json()
  }

  const openEdit = async (id: string) => {
    try {
      const q = await loadIntoForm(id)
      if (q.status !== 'draft') {
        alert('Hanya penawaran berstatus draft yang bisa diedit')
        return
      }
      setEditingId(id)
      setViewingStatus(q.status)
      setReturnToView(false)
      setFormMode('edit')
      setFormData(mapQuoteToForm(q))
      setShowForm(true)
      window.scrollTo({ top: 0 })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleMarkSent = async () => {
    if (!editingId) return
    try {
      const res = await fetch(`/api/quotations/${editingId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal mengubah status')
      setViewingStatus('sent')
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const openView = async (id: string) => {
    try {
      const q = await loadIntoForm(id)
      setEditingId(id)
      setViewingStatus(q.status)
      setReturnToView(false)
      setFormMode('view')
      setFormData(mapQuoteToForm(q))
      setShowForm(true)
      window.scrollTo({ top: 0 })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/quotations/${id}/status`, {
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

  const handleConvert = async (id: string) => {
    if (!confirm('Konversi penawaran ini menjadi faktur? Penawaran akan terkunci setelah dikonversi.')) return
    setConverting(true)
    try {
      const res = await fetch(`/api/quotations/${id}/convert`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal mengonversi penawaran')
      }
      const data = await res.json()
      alert(`Penawaran berhasil dikonversi menjadi faktur ${data.invoice.invoiceNumber}`)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setConverting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus penawaran ini?')) return
    try {
      const res = await fetch(`/api/quotations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menghapus penawaran')
      }
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDownloadPdf = async (id: string, quotationNumber?: string) => {
    try {
      const res = await fetch(`/api/quotations/${id}/pdf`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal mengunduh PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${quotationNumber || 'penawaran'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const isView = formMode === 'view'

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
<button onClick={closeForm} className="btn btn-secondary btn-sm flex-shrink-0">
                <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
              </button>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">
                  {formMode === 'view' ? 'Detail Penawaran' : formMode === 'edit' ? 'Edit Penawaran' : 'Buat Penawaran Baru'}
                </h1>
                {formMode !== 'create' && (
                  <span className={`badge ${
                    viewingStatus === 'accepted' ? 'badge-success'
                      : viewingStatus === 'rejected' ? 'badge-destructive'
                        : viewingStatus === 'converted' ? 'badge-warning'
                          : viewingStatus === 'sent' ? 'badge-info'
                            : 'badge-default'
                  }`}>
                    {statusLabels[formMode === 'edit' && !viewingStatus ? 'draft' : viewingStatus] || 'Draft'}
                  </span>
                )}
              </div>
              {formMode !== 'view' && (
                <p className="text-sm text-muted-foreground">
                  {formMode === 'edit' ? 'Ubah data penawaran' : 'Buat dokumen penawaran harga'}
                </p>
              )}
            </div>
            {formMode === 'view' && viewingStatus === 'draft' && (
              <>
                <button type="button" className="btn btn-primary" onClick={handleMarkSent}>
                  Kirim
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setReturnToView(true); setFormMode('edit'); setViewingStatus('') }}
                >
                  Edit
                </button>
              </>
            )}
          </div>

          <div className="card p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Pelanggan</label>
                  <select
                    required
                    className="input"
                    disabled={isView}
                    value={formData.customerId}
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                  >
                    <option value="">Pilih pelanggan...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    {!isView && <option value={NEW_CUSTOMER}>+ Pelanggan baru...</option>}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Tanggal</label>
                    <input
                      type="date" required className="input" disabled={isView}
                      value={formData.issueDate}
                      onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Berlaku Hingga</label>
                    <input
                      type="date" className="input" disabled={isView}
                      value={formData.validUntil}
                      onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Pajak</label>
                  <select
                    className="input" disabled={isView}
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
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Diskon Global (Rp)</label>
                  <input
                    type="number" min="0" className="input" disabled={isView}
                    value={formData.discount}
                    onChange={(e) => setFormData({ ...formData, discount: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-foreground">Item Penawaran</label>
                </div>
                {isView ? (
                  <div className="border border-border rounded-lg overflow-hidden">
                    {(() => {
                      const hasDiscount = formData.items.some((item: typeof formData.items[number]) => Number(item.discount || 0) > 0)
                      return (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Item</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Qty</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Harga</th>
                          {hasDiscount && <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Diskon</th>}
                          <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {formData.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-foreground">{item.description || item.productId || '-'}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{Number(item.quantity)}{item.unit ? ' ' + item.unit : ''}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrency(Number(item.unitPrice))}</td>
                            {hasDiscount && (
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {Number(item.discount || 0) > 0 ? `${Number(item.discount)}%` : '-'}
                            </td>
                            )}
                            <td className="px-3 py-2 text-right font-medium text-foreground">
                              {formatCurrency(lineNet(item))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                      )
                    })()}
                  </div>
                ) : (
                  <>
                <div className="grid grid-cols-12 gap-2 mb-1 px-1">
                  <div className="col-span-5 text-xs font-medium text-muted-foreground">Produk</div>
                  <div className="col-span-3 text-xs font-medium text-muted-foreground text-right pr-6">Qty</div>
                  <div className="col-span-2 text-xs font-medium text-muted-foreground">Harga (Rp)</div>
                  <div className="col-span-2 text-xs font-medium text-muted-foreground">Diskon (%)</div>
                </div>
                {formData.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                    <div className="col-span-5">
                      {item.productId || !item.description ? (
                        <select
                          className="input" disabled={isView}
                          value={item.productId || ''}
                          onChange={(e) => handleProductPick(idx, e.target.value)}
                        >
                          <option value="">Pilih produk...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="input" disabled={isView}
                          placeholder="Item bebas..."
                          title="Item tanpa produk katalog — ubah teksnya langsung"
                          value={item.description}
                          onChange={(e) => setItem(idx, { description: e.target.value })}
                        />
                      )}
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number" min="1" className="input" placeholder="Qty" disabled={isView}
                        value={item.quantity}
                        onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number" min="0" className="input" placeholder="Harga" disabled={isView}
                        value={item.unitPrice}
                        onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <div className="relative flex-1">
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                        <input
                          type="number" min="0" max="100" className="input pr-8" placeholder="0" disabled={isView} title="Diskon baris dalam persen (%)"
                          value={item.discount || 0}
                          onChange={(e) => setItem(idx, { discount: Number(e.target.value) })}
                        />
                      </div>
                      {!isView && formData.items.length > 1 && (
                        <button
                          type="button"
                          className="p-2 text-muted-foreground hover:text-destructive"
                          title="Hapus baris"
                          onClick={() => setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) })}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!isView && (
                  <button
                    type="button"
                    className="text-sm text-primary hover:text-primary/80 mt-1"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        items: [...formData.items, { productId: '', description: '', quantity: 1, unitPrice: 0, discount: 0 }],
                      })
                    }
                  >
                    + Tambah Item
                  </button>
                )}
                  </>
                )}
              </div>

              <div className="flex justify-end">
                <div className="w-full sm:w-72 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotalCalc)}</span>
                  </div>
                  {disc > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Diskon</span>
                      <span>-{formatCurrency(disc)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      PPN {selectedTax ? `(${Number(selectedTax.rate)}%)` : ''}
                    </span>
                    <span>{formatCurrency(taxAmountCalc)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Catatan</label>
                <textarea
                  className="input min-h-[60px]" disabled={isView}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan tambahan..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Syarat & Ketentuan</label>
                <textarea
                  className="input min-h-[60px]" disabled={isView}
                  value={formData.terms}
                  onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                  placeholder="cth. Harga berlaku selama masa berlaku penawaran..."
                />
              </div>

              {!isView && (
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-secondary" onClick={closeForm}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {formMode === 'edit' ? 'Simpan Perubahan' : 'Buat Penawaran'}
                  </button>
                </div>
              )}
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
            <h1 className="text-xl font-bold text-foreground">Penawaran</h1>
            <p className="text-sm text-muted-foreground">Kelola penawaran harga ke pelanggan</p>
          </div>
          <button onClick={() => { setReturnToView(false); resetForm(); setShowForm(true) }} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Buat Penawaran
          </button>
        </div>

        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari penawaran/pelanggan..."
              className="input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">No. Penawaran</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pelanggan</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tanggal</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Berlaku Hingga</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((q) => {
                    return (
                      <tr key={q.id} className="hover:bg-accent cursor-pointer" onClick={() => openView(q.id)}>
                        <td className="px-5 py-3">
                          <span className="text-sm font-medium text-primary">{q.quotationNumber}</span>
                        </td>
                        <td className="px-5 py-3 text-sm text-foreground">{q.customer?.name}</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{new Date(q.issueDate).toLocaleDateString('id-ID')}</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">
                          {q.validUntil ? new Date(q.validUntil).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-5 py-3 text-sm text-right font-medium text-foreground">{formatCurrency(q.total)}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`badge ${
                            q.status === 'accepted' ? 'badge-success'
                              : q.status === 'sent' ? 'badge-info'
                                : q.status === 'rejected' ? 'badge-destructive'
                                  : q.status === 'converted' ? 'badge-warning'
                                    : 'badge-default'
                          }`}>
                            {statusLabels[q.status] || q.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openView(q.id)} title="Lihat detail" className="p-1 text-muted-foreground hover:text-primary">
                              <Eye className="w-4 h-4" />
                            </button>
                            {q.status === 'draft' && (
                              <button onClick={() => openEdit(q.id)} title="Edit (draft)" className="p-1 text-muted-foreground hover:text-primary">
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {q.status === 'draft' && (
                              <button
                                onClick={() => handleStatus(q.id, 'sent')}
                                title="Kirim penawaran"
                                className="btn btn-primary btn-sm"
                              >
                                Kirim
                              </button>
                            )}
                            {q.status === 'accepted' && !q.convertedInvoiceId && (
                              <button
                                onClick={() => handleConvert(q.id)}
                                disabled={converting}
                                title="Konversi menjadi faktur"
                                className="p-1 text-success hover:text-success/80"
                              >
                                <ArrowRightCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => handleDownloadPdf(q.id, q.quotationNumber)} title="Unduh PDF" className="p-1 text-muted-foreground hover:text-primary">
                              <Download className="w-4 h-4" />
                            </button>
                            {(q.status === 'draft' || q.status === 'rejected') && !q.convertedInvoiceId && (
                              <button onClick={() => handleDelete(q.id)} title="Hapus" className="p-1 text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">Tidak ada penawaran ditemukan</p>
              </div>
            )}
          </div>
        </>
      </div>
    </Layout>
  )
}
