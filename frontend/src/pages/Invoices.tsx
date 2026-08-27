import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useFormHistory } from '../lib/useFormHistory'
import { useAuth } from '../lib/AuthContext'
import { formatCurrency, formatDateDMY } from '../lib/utils'
import DatePicker from '../components/DatePicker'
import PeriodFilter, { matchPeriod } from '../components/PeriodFilter'
import { Plus, Search, FileText, ArrowLeft, Trash2, Eye, Pencil, Download, Wallet, Tag, CheckSquare, Square } from 'lucide-react'

interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
  lineTotal: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  customerId?: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  customerAddress?: string | null
  subtotal?: number
  taxRate?: number
  taxAmount?: number
  discount?: number
  total: number
  amountPaid: number
  status: string
  issueDate: string
  dueDate: string
  notes?: string | null
  terms?: string | null
  items: InvoiceItem[]
  customer: any
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  sent: 'Terkirim',
  partial: 'Sebagian',
  paid: 'Lunas',
  overdue: 'Jatuh Tempo',
}

const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Invoices() {
  const { user } = useAuth()
  const isStaff = user?.role === 'member'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [taxes, setTaxes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // 'view' = read-only page, 'edit' = draft editing, 'create' = new
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'view'>('create')
  const [returnToView, setReturnToView] = useState(false)
  useFormHistory(showForm, () => { setShowForm(false); setReturnToView(false) })
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [recapBusy, setRecapBusy] = useState(false)
  const [recapWizard, setRecapWizard] = useState<'client' | 'invoices' | null>(null)
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [wizardMonth, setWizardMonth] = useState('all')
  const [wizardSearch, setWizardSearch] = useState('')
  const [wizardBusy, setWizardBusy] = useState(false)
  const [wizardStatusFilter, setWizardStatusFilter] = useState('sent_partial')
  const [wizardClientSearch, setWizardClientSearch] = useState('')

  const [paying, setPaying] = useState<Invoice | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', method: 'transfer', reference: '', notes: '' })
  const [payBusy, setPayBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [period, setPeriod] = useState('all')

  // inline creation state
  const [newCustOpen, setNewCustOpen] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', email: '', phone: '' })
  const [newProdIdx, setNewProdIdx] = useState<number | null>(null)
  const DEFAULT_UNITS = ['pcs', 'unit', 'box', 'kg', 'liter', 'jam', 'lisensi', 'langganan']
  const [unitOptions, setUnitOptions] = useState<string[]>(DEFAULT_UNITS)
  const defaultUnit = () => (unitOptions.includes('pcs') ? 'pcs' : unitOptions[0] || 'pcs')
  const [newProduct, setNewProduct] = useState({ name: '', price: 0, unit: 'pcs', description: '' })

  const emptyForm = () => {
    const now = new Date()
    return {
      customerId: '',
      invoiceNumber: '',
      issueDate: toDateInput(now),
      dueDate: toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      taxId: '',
      items: [{ productId: '', description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0 }],
      notes: '',
      terms: '',
    }
  }


  const [formData, setFormData] = useState(emptyForm)

  const fetchData = () => {
    Promise.all([
      fetch('/api/invoices/').then((r) => { if (!r.ok) throw new Error('Failed to fetch'); return r.json() }),
      fetch('/api/customers/').then((r) => { if (!r.ok) throw new Error('Failed to fetch'); return r.json() }),
      fetch('/api/products/').then((r) => { if (!r.ok) throw new Error('Failed to fetch'); return r.json() }),
      fetch('/api/taxes/').then((r) => { if (!r.ok) throw new Error('Failed to fetch'); return r.json() }),
    ]).then(([invRes, custRes, prodRes, taxRes]) => {
      setInvoices(invRes.data || invRes)
      setCustomers(custRes.data || custRes)
      setProducts(prodRes.data || prodRes)
      const taxList = taxRes.data || taxRes
      setTaxes(taxList)
      // Preselect the tenant's default tax once loaded
      const def = (taxList as any[]).find((t) => t.isDefault)
      if (def) {
        setFormData((f: any) => ({ ...f, taxId: f.taxId || def.id }))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    fetch('/api/tenants/settings')
      .then((r) => r.json())
      .then((data) => {
        try {
          const parsed = JSON.parse(data.product_units || '')
          if (Array.isArray(parsed) && parsed.length > 0) setUnitOptions(parsed.map(String))
        } catch {}
      })
      .catch(() => {})
  }, [])

  // ---------- inline client/product creation ----------
  const handleCustomerSelect = (value: string) => {
    if (value === '__new__') {
      setNewCustOpen(true)
    } else {
      setFormData({ ...formData, customerId: value })
    }
  }

  const handleCreateCustomer = async () => {
    try {
      const res = await fetch('/api/customers/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCust),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal membuat pelanggan')
      }
      const created = await res.json()
      setCustomers([...customers, created])
      setFormData((f) => ({ ...f, customerId: created.id }))
      setNewCustOpen(false)
      setNewCust({ name: '', email: '', phone: '' })
    } catch (err: any) {
      alert(err.message)
    }
  }

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
    } else {
      setItem(idx, { productId: '', description: '', unitPrice: 0 })
    }
  }

  // live form totals — mirrors quotation form
  const lineNet = (it: { quantity: number; unitPrice: number; discount: number }) => {
    const pct = Math.min(Math.max(Number(it.discount || 0), 0), 100)
    return Number(it.quantity || 0) * Number(it.unitPrice || 0) * (1 - pct / 100)
  }
  const invoiceSubtotal = formData.items.reduce((s, it) => s + lineNet(it), 0)
  const selectedTax = taxes.find((t) => t.id === formData.taxId)
  const invoiceTaxAmount = Math.max(invoiceSubtotal, 0) * ((selectedTax ? Number(selectedTax.rate) : 0) / 100)
  const invoiceGrandTotal = Math.max(invoiceSubtotal, 0) + invoiceTaxAmount

  const handleCreateProduct = async () => {
    if (newProdIdx === null) return
    try {
      const res = await fetch('/api/products/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProduct.name, price: Number(newProduct.price), unit: newProduct.unit, description: newProduct.description || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal membuat produk')
      }
      const created = await res.json()
      setProducts([...products, created])
      setItem(newProdIdx, { productId: created.id, description: created.name, unitPrice: Number(created.price) })
      setNewProdIdx(null)
      setNewProduct({ name: '', price: 0, unit: defaultUnit(), description: '' })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const filtered = invoices.filter((inv) => {
    const matchSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    return matchSearch && matchStatus && matchPeriod(inv.issueDate, period)
  })

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const recapEligible = filtered.filter((inv) => inv.status !== 'draft')
  const allSelectedVisible = recapEligible.length > 0 && recapEligible.every((inv) => selectedIds.includes(inv.id))

  const toggleSelectAll = () => {
    setSelectedIds(allSelectedVisible ? [] : recapEligible.map((inv) => inv.id))
  }

  const selectedInvoices = invoices.filter((inv) => selectedIds.includes(inv.id))
  const recapClients = new Set(selectedInvoices.map((inv) => inv.customerId))
  const recapReady = selectedIds.length > 0 && recapClients.size === 1

  const openPayment = (inv: Invoice) => {
    const outstanding = Math.max(Number(inv.total) - Number(inv.amountPaid || 0), 0)
    setPaying(inv)
    setPayForm({ amount: String(outstanding), method: 'transfer', reference: '', notes: '' })
  }

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paying) return
    const amount = Number(payForm.amount)
    if (!amount || amount <= 0) return
    setPayBusy(true)
    try {
      const res = await fetch(`/api/invoices/${paying.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: payForm.method, reference: payForm.reference || undefined, notes: payForm.notes || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal mencatat pembayaran')
      setPaying(null)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setPayBusy(false)
    }
  }

  const handleRecap = async (ids?: string[]) => {
    const recapIds = ids || selectedIds
    if (recapIds.length === 0) return
    setRecapBusy(true)
    try {
      const res = await fetch('/api/invoices/recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: recapIds }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal membuat rekap')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const recapInvoice = invoices.find((i) => recapIds.includes(i.id))
      a.download = `rekap-${(recapInvoice?.customerName || 'rekap').toLowerCase().replace(/\s+/g, '-')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setRecapBusy(false)
    }
  }

  const resetWizardFilters = () => {
    setWizardStatusFilter('sent_partial')
    setWizardMonth('all')
    setWizardSearch('')
    setWizardClientSearch('')
  }

  const openRecapWizard = () => {
    resetWizardFilters()
    setRecapWizard('client')
    setSelectedClient(null)
  }

  const wizardClientInvoices = invoices.filter(
    (inv) => inv.customerId === selectedClient && inv.status !== 'draft'
  )

  const wizardMonths = Array.from(
    new Set(wizardClientInvoices.map((inv: any) => String(inv.issueDate).slice(0, 7)))
  ).sort().reverse()

  const wizardMonthLabel = (key: string) => {
    const [yy, mm] = key.split('-').map(Number)
    return new Date(yy, mm - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }

  // Filters define rekap content exactly — anything not matching is excluded (V29)
  const wizardFilteredInvoices = wizardClientInvoices.filter((inv: any) =>
    (wizardStatusFilter === 'all'
      || (wizardStatusFilter === 'sent_partial' && (inv.status === 'sent' || inv.status === 'partial'))
      || inv.status === wizardStatusFilter)
    && (wizardMonth === 'all' || String(inv.issueDate).slice(0, 7) === wizardMonth)
    && (!wizardSearch || inv.invoiceNumber.toLowerCase().includes(wizardSearch.toLowerCase()))
  )

  const wizardSelectClient = (clientId: string) => {
    setSelectedClient(clientId)
    setWizardStatusFilter('sent_partial')
    setWizardSearch('')
    setRecapWizard('invoices')

    // Compute default month: current → last → all
    const clientInvoices = invoices.filter(
      (inv) => inv.customerId === clientId && inv.status !== 'draft'
    )
    const months = Array.from(
      new Set(clientInvoices.map((inv: any) => String(inv.issueDate).slice(0, 7)))
    ).sort().reverse()
    const now = new Date()
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prev = new Date(now.getFullYear(), now.getMonth() - 1)
    const last = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

    if (months.includes(cur)) setWizardMonth(cur)
    else if (months.includes(last)) setWizardMonth(last)
    else setWizardMonth('all')
  }

  const handleWizardRecap = async () => {
    if (wizardFilteredInvoices.length === 0) return
    setWizardBusy(true)
    try {
      await handleRecap(wizardFilteredInvoices.map((i: any) => i.id))
      setRecapWizard(null)
    } finally {
      setWizardBusy(false)
    }
  }

  const openEdit = (inv: Invoice) => {
    if (inv.status !== 'draft') {
      alert('Hanya faktur berstatus draft yang bisa diedit')
      return
    }
    setEditingInvoice(inv)
    setReturnToView(false)
    setFormMode('edit')
    const rateMatch = taxes.find((t) => Number(t.rate) === Number(inv.taxRate ?? 0))
    setFormData({
      customerId: inv.customer?.id || '',
      invoiceNumber: inv.invoiceNumber,
      issueDate: toDateInput(new Date(inv.issueDate)),
      dueDate: toDateInput(new Date(inv.dueDate)),
      taxId: rateMatch?.id ?? (Number(inv.taxRate ?? 0) === 0 ? '__none__' : ''),
      items: (inv.items || []).map((it: any) => {
        const matched = products.find((p) => p.name === it.description)
        return {
          productId: matched?.id || '',
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          discount: Number(it.discount ?? 0),
          taxRate: 0,
        }
      }),
      notes: inv.notes || '',
      terms: inv.terms || '',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    // Edit yang dimulai dari Detail kembali ke Detail (perubahan dibuang)
    if (returnToView && formMode === 'edit' && editingInvoice) {
      setFormData(mapInvoiceToForm(editingInvoice))
      setFormMode('view')
      setReturnToView(false)
      return
    }
    setShowForm(false)
    setEditingInvoice(null)
    setFormMode('create')
    const def = taxes.find((t) => t.isDefault)
    setFormData({ ...emptyForm(), taxId: def?.id || '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const editing = editingInvoice
      const { taxId, ...rest } = formData
      const payload: any = {
        ...rest,
        invoiceNumber: (rest.invoiceNumber || '').trim() || undefined, // blank -> auto at save
      }
      if (taxId === '__none__') {
        payload.taxRate = 0 // explicit no-tax beats the tenant default fallback
      } else if (taxId) {
        payload.taxId = taxId
      } else if (editing && !taxId) {
        // edited invoice had a rate that matches no catalog tax: preserve as-is
        payload.taxRate = Number(editing.taxRate ?? 0)
      }
      const res = await fetch(editing ? `/api/invoices/${editing.id}` : '/api/invoices/', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || (editing ? 'Gagal menyimpan faktur' : 'Gagal membuat faktur'))
      }
      if (formMode === 'edit' && returnToView && editing) {
        // kembali ke Detail dengan data terbaru
        const updated = await res.json()
        setEditingInvoice(updated)
        setFormData(mapInvoiceToForm(updated))
        setFormMode('view')
        fetchData()
        return
      }
      closeForm()
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}/status`, {
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
    if (!confirm('Hapus faktur ini?')) return
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menghapus faktur')
      }
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const mapInvoiceToForm = (inv: any) => ({
    customerId: inv.customerId || inv.customer?.id || '',
    invoiceNumber: inv.invoiceNumber || '',
    issueDate: toDateInput(new Date(inv.issueDate)),
    dueDate: toDateInput(new Date(inv.dueDate)),
    taxId: inv.taxId
      || taxes.find((t) => Number(t.rate) === Number(inv.taxRate ?? 0))?.id
      || (Number(inv.taxRate ?? 0) === 0 ? '__none__' : ''),
    items: (inv.items || []).map((it: any) => {
      // prefer stored reference; fall back to catalog name match for legacy rows
      const pid = it.productId || products.find((p: any) => p.name === it.description)?.id || ''
      return {
        productId: pid,
        description: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        discount: Number(it.discount ?? 0),
        unit: it.product?.unit || '',
        taxRate: Number(inv.taxRate || 0),
      }
    }),
    notes: inv.notes || '',
    terms: inv.terms || '',
  })

  const openView = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal memuat faktur')
      }
      const inv = await res.json()
      setEditingInvoice(inv)
      setFormMode('view')
      setFormData(mapInvoiceToForm(inv))
      setShowForm(true)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleMarkSent = async () => {
    if (!editingInvoice) return
    try {
      const res = await fetch(`/api/invoices/${editingInvoice.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal mengubah status')
      setEditingInvoice({ ...editingInvoice, status: 'sent' })
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const startEditFromView = () => {
    if (!editingInvoice || editingInvoice.status !== 'draft') return
    setFormData(mapInvoiceToForm(editingInvoice))
    setReturnToView(true)
    setFormMode('edit')
  }

  const handleDownloadPdf = async (id: string, invoiceNumber?: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal mengunduh PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceNumber || 'faktur'}.pdf`
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

  return (
    <Layout>
      <div className="space-y-6">
        {!showForm && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Faktur</h1>
            <p className="text-sm text-muted-foreground">Kelola faktur penjualan</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingInvoice(null)
                setReturnToView(false)
                const def = taxes.find((t) => t.isDefault)
                setFormData({ ...emptyForm(), taxId: def?.id || '' })
                setShowForm(true)
              }}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4 mr-1" />
              Buat Faktur
            </button>
            <button
              onClick={openRecapWizard}
              className="btn btn-primary"
            >
              <Tag className="w-4 h-4 mr-1" /> Buat Rekap
            </button>
          </div>
        </div>
        )}

        {showForm && (
          <div className="flex items-center gap-3">
<button onClick={closeForm} className="btn btn-secondary btn-sm flex-shrink-0">
                <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
              </button>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">
                  {formMode === 'view' ? 'Detail Faktur' : formMode === 'edit' ? 'Edit Faktur' : 'Buat Faktur Baru'}
                </h1>
                {formMode !== 'create' && editingInvoice && (
                  <span className={`badge ${
                    editingInvoice.status === 'paid' ? 'badge-success'
                      : editingInvoice.status === 'overdue' ? 'badge-destructive'
                        : editingInvoice.status === 'partial' ? 'badge-warning'
                          : editingInvoice.status === 'sent' ? 'badge-info'
                            : 'badge-default'
                  }`}>
                    {statusLabels[editingInvoice.status] || editingInvoice.status}
                  </span>
                )}
              </div>
              {formMode !== 'view' && (
                <p className="text-sm text-muted-foreground">
                  {formMode === 'edit' ? `Ubah data faktur ${editingInvoice?.invoiceNumber || ''}` : 'Isi data faktur penjualan'}
                </p>
              )}
            </div>
            {formMode === 'view' && editingInvoice?.status === 'draft' && (
              <>
                <button type="button" className="btn btn-primary" onClick={handleMarkSent}>
                  Kirim
                </button>
                <button type="button" className="btn btn-secondary" onClick={startEditFromView}>
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </button>
              </>
            )}
            {formMode === 'view' && editingInvoice && (
              <>
                {editingInvoice.status !== 'draft' &&
                 Number(editingInvoice.total) - Number(editingInvoice.amountPaid || 0) > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => { setShowForm(false); openPayment(editingInvoice) }}
                  >
                    <Wallet className="w-4 h-4 mr-1" /> Catat Pembayaran
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleDownloadPdf(editingInvoice.id, editingInvoice.invoiceNumber)}
                >
                  <Download className="w-4 h-4 mr-1" /> PDF
                </button>
              </>
            )}
          </div>
        )}
        {showForm && (
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">No. Faktur</label>
                  <input
                    type="text"
                    className="input"
                    disabled={isView}
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                    placeholder="Kosongkan untuk otomatis"
                  />
                </div>
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
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="__new__">+ Buat pelanggan baru...</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Tanggal Faktur</label>
                  <div className="grid grid-cols-2 gap-3">
                    <DatePicker
                      required
                      className="input"
                      disabled={isView}
                      value={formData.issueDate}
                      onChange={(v) => setFormData({ ...formData, issueDate: v })}
                    />
                    <DatePicker
                      required
                      className="input"
                      disabled={isView}
                      placeholder="Jatuh Tempo"
                      value={formData.dueDate}
                      onChange={(v) => setFormData({ ...formData, dueDate: v })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Pajak</label>
                  <select
                    className="input"
                    disabled={isView}
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

              {newCustOpen && (
                <div className="border border-accent bg-accent/40 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">Pelanggan Baru</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nama *</label>
                      <input
                        type="text" required placeholder="cth: PT Maju Jaya" className="input"
                        value={newCust.name}
                        onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                      <input
                        type="email" placeholder="email@perusahaan.co.id" className="input"
                        value={newCust.email}
                        onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Telepon</label>
                      <input
                        type="text" placeholder="08xx xxxx xxxx" className="input"
                        value={newCust.phone}
                        onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-secondary" onClick={() => { setNewCustOpen(false); setNewCust({ name: '', email: '', phone: '' }) }}>
                      Batal
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleCreateCustomer}>
                      Simpan Pelanggan
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Item Faktur</label>
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
                            <td className="px-3 py-2 text-foreground">{item.description || '-'}</td>
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
                          className="input"
                          value={item.productId || ''}
                          onChange={(e) => handleProductPick(idx, e.target.value)}
                        >
                          <option value="">Pilih produk...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                          {!item.productId && <option value="__new__">+ Produk baru...</option>}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="input"
                          placeholder="Item bebas..."
                          title="Item tanpa produk katalog — ubah teksnya langsung"
                          value={item.description}
                          onChange={(e) => {
                            const newItems = [...formData.items]
                            newItems[idx].description = e.target.value
                            setFormData({ ...formData, items: newItems })
                          }}
                        />
                      )}
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number" min="1"
                        className="input"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...formData.items]
                          newItems[idx].quantity = Number(e.target.value)
                          setFormData({ ...formData, items: newItems })
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number" min="0"
                        className="input"
                        placeholder="Harga"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const newItems = [...formData.items]
                          newItems[idx].unitPrice = Number(e.target.value)
                          setFormData({ ...formData, items: newItems })
                        }}
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <div className="relative flex-1">
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                        <input
                          type="number" min="0" max="100"
                          className="input pr-8"
                          placeholder="0"
                          title="Diskon baris dalam persen (%)"
                          value={item.discount}
                          onChange={(e) => {
                            const newItems = [...formData.items]
                            newItems[idx].discount = Number(e.target.value)
                            setFormData({ ...formData, items: newItems })
                          }}
                        />
                      </div>
                      {formData.items.length > 1 && (
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
                {newProdIdx !== null && (
                  <div className="border border-accent bg-accent/40 rounded-lg p-3 space-y-3 mt-2">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">Produk Baru</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Nama *</label>
                        <input
                          type="text" required placeholder="cth: Jasa Instalasi" className="input"
                          value={newProduct.name}
                          onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Harga (Rp) *</label>
                        <input
                          type="number" min="0" required placeholder="0" className="input"
                          value={newProduct.price}
                          onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Satuan</label>
                        <select
                          className="input"
                          title="Satuan produk"
                          value={newProduct.unit}
                          onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                        >
                          {unitOptions.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Deskripsi</label>
                        <input
                          type="text" placeholder="Deskripsi produk (opsional)" className="input"
                          value={newProduct.description}
                          onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary" onClick={() => { setNewProdIdx(null); setNewProduct({ name: '', price: 0, unit: defaultUnit(), description: '' }) }}>
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
                  className="text-sm text-primary hover:text-primary"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      items: [...formData.items, { productId: '', description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0 }],
                    })
                  }
                >
                  + Tambah Item
                </button>
                  </>
                )}
              </div>

              <div className="flex justify-end">
                <div className="w-full sm:w-72 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(invoiceSubtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      PPN {selectedTax ? `(${Number(selectedTax.rate)}%)` : ''}
                    </span>
                    <span>{formatCurrency(invoiceTaxAmount)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(invoiceGrandTotal)}</span>
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

              {!isView && (
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  {formMode === 'edit' ? 'Simpan Perubahan' : 'Buat Faktur'}
                </button>
              </div>
              )}
            </form>
          </div>
        )}

        {!showForm && (
        <>
        {/* Period Filter */}
        <PeriodFilter value={period} onChange={setPeriod} />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Cari faktur..."
              className="input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-fit"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Semua Status</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/30 bg-accent/40 px-5 py-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{selectedIds.length} faktur dipilih</span>
              {!recapReady && (
                <span className="text-destructive ml-2">— rekap hanya untuk satu pelanggan yang sama</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedIds([])}>
                Bersihkan
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!recapReady || recapBusy}
                onClick={() => handleRecap()}
              >
                {recapBusy ? 'Membuat...' : 'Buat Rekap'}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 w-10 min-w-[40px] max-w-[40px] sticky left-0 z-20 bg-muted backdrop-blur border-r border-border">
                    <input
                      type="checkbox"
                      checked={allSelectedVisible}
                      onChange={toggleSelectAll}
                      title="Pilih semua yang terlihat"
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-36 min-w-[144px] max-w-[144px] sticky left-[40px] z-20 bg-muted backdrop-blur border-r border-border">No. Faktur</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[140px] sticky left-[184px] z-20 bg-muted backdrop-blur border-r border-border">Pelanggan</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tanggal</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jatuh Tempo</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Terbayar</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((inv) => {
                  return (
                    <tr key={inv.id} className="hover:bg-muted cursor-pointer" onClick={() => openView(inv.id)}>
                      <td className="px-4 py-3 min-w-[40px] max-w-[40px] sticky left-0 z-20 bg-card/95 backdrop-blur border-r border-border" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          disabled={inv.status === 'draft'}
                          checked={selectedIds.includes(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          title={inv.status === 'draft' ? 'Faktur draft tidak bisa direkap' : 'Pilih untuk rekap'}
                        />
                      </td>
                      <td className="px-5 py-3 min-w-[144px] max-w-[144px] sticky left-[40px] z-20 bg-card/95 backdrop-blur border-r border-border">
                        <span className="text-sm font-medium text-primary">{inv.invoiceNumber}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-foreground min-w-[140px] sticky left-[184px] z-20 bg-card/95 backdrop-blur border-r border-border">{inv.customerName}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{formatDateDMY(inv.issueDate)}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{formatDateDMY(inv.dueDate)}</td>
                      <td className="px-5 py-3 text-sm text-right font-medium text-foreground">{formatCurrency(inv.total)}</td>
                      <td className="px-5 py-3 text-sm text-right text-muted-foreground">{formatCurrency(inv.amountPaid)}</td>
                      <td className="px-5 py-3 text-center">
                        <span
                          className={`badge ${
                            inv.status === 'paid'
                              ? 'badge-success'
                              : inv.status === 'overdue'
                              ? 'badge-destructive'
                              : inv.status === 'sent'
                              ? 'badge-info'
                              : 'badge-default'
                          }`}
                        >
                          {statusLabels[inv.status] || inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {inv.status === 'draft' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(inv) }}
                              title="Edit faktur (draft)"
                              className="p-1 text-muted-foreground hover:text-primary"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); openView(inv.id) }}
                            title="Lihat detail"
                            className="p-1 text-muted-foreground hover:text-primary"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadPdf(inv.id, inv.invoiceNumber) }}
                            title="Unduh PDF"
                            className="p-1 text-muted-foreground/70 hover:text-success"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {inv.status !== 'draft' && Number(inv.total) - Number(inv.amountPaid || 0) > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openPayment(inv) }}
                              title="Catat pembayaran"
                              className="p-1 text-success hover:text-success/80"
                            >
                              <Wallet className="w-4 h-4" />
                            </button>
                          )}
                          {inv.status === 'draft' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleStatus(inv.id, 'sent') }}
                                title="Kirim faktur"
                                className="btn btn-primary btn-sm"
                              >
                                Kirim
                              </button>
                          )}
                          {!isStaff || !['paid', 'overdue'].includes(inv.status) ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(inv.id) }}
                              title="Hapus faktur"
                              className="p-1 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : null}
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
              <p className="text-muted-foreground">Tidak ada faktur ditemukan</p>
            </div>
          )}
        </div>
        </>
        )}
      </div>


      {/* Recap Wizard Modal */}
      {recapWizard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setRecapWizard(null)}
        >
          <div
            className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">
                  {recapWizard === 'client' ? 'Pilih Pelanggan' : 'Pilih Faktur'}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {recapWizard === 'client'
                    ? 'Pilih pelanggan yang fakturnya akan direkap'
                    : `${customers.find((c) => c.id === selectedClient)?.name || ''} · ${wizardClientInvoices.length} faktur non-draft`}
                </p>
              </div>
              <button
                onClick={() => setRecapWizard(null)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <span className="sr-only">Tutup</span>
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {recapWizard === 'client' && (
                <div className="space-y-3">
                  <input
                    type="text"
                    className="input text-sm"
                    placeholder="Cari nama pelanggan..."
                    value={wizardClientSearch}
                    onChange={(e) => setWizardClientSearch(e.target.value)}
                  />
                  <div className="space-y-2">
                    {customers
                      .filter((c) => {
                        const count = invoices.filter(
                          (inv) => inv.customerId === c.id && inv.status !== 'draft'
                        ).length
                        return count > 1
                      })
                      .filter((c) => !wizardClientSearch || c.name.toLowerCase().includes(wizardClientSearch.toLowerCase()))
                      .map((c) => {
                        const count = invoices.filter(
                          (inv) => inv.customerId === c.id && inv.status !== 'draft'
                        ).length
                        return (
                          <button
                            key={c.id}
                            onClick={() => wizardSelectClient(c.id)}
                            className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors"
                          >
                            <span className="text-sm font-medium text-foreground">{c.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{count} faktur</span>
                          </button>
                        )
                      })}
                    {customers.filter((c) => {
                      const count = invoices.filter(
                        (inv) => inv.customerId === c.id && inv.status !== 'draft'
                      ).length
                      return count > 1
                    }).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">Tidak ada pelanggan dengan lebih dari 1 faktur non-draft</p>
                    )}
                  </div>
                </div>
              )}

              {recapWizard === 'invoices' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      className="input text-sm"
                      value={wizardStatusFilter}
                      onChange={(e) => setWizardStatusFilter(e.target.value)}
                    >
                      <option value="all">Semua Status</option>
                      <option value="sent_partial">Terkirim & Sebagian</option>
                      {Object.entries(statusLabels)
                        .filter(([k]) => k !== 'draft')
                        .map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <select
                      className="input text-sm"
                      value={wizardMonth}
                      onChange={(e) => setWizardMonth(e.target.value)}
                    >
                      <option value="all">Semua Periode</option>
                      {wizardMonths.map((m) => (
                        <option key={m} value={m}>{wizardMonthLabel(m)}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="input text-sm"
                      placeholder="Cari nomor faktur..."
                      value={wizardSearch}
                      onChange={(e) => setWizardSearch(e.target.value)}
                    />
                  </div>
                  {wizardFilteredInvoices.map((inv: any) => {
                    const saldo = Math.max(Number(inv.total) - Number(inv.amountPaid || 0), 0)
                    return (
                      <div
                        key={inv.id}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg border border-border ${saldo === 0 ? 'opacity-75' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-primary">{inv.invoiceNumber}</span>
                            <span className={`badge badge-xs ${
                              inv.status === 'paid' ? 'badge-success'
                                : inv.status === 'overdue' ? 'badge-destructive'
                                  : inv.status === 'partial' ? 'badge-warning'
                                    : inv.status === 'sent' ? 'badge-info'
                                      : 'badge-default'
                            }`}>
                              {statusLabels[inv.status] || inv.status}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateDMY(inv.issueDate)}
                            </span>
                          </div>
                          <div className="text-sm text-foreground">{formatCurrency(inv.total)}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-muted-foreground">Sisa</div>
                          <div className="text-sm font-medium text-foreground">{formatCurrency(saldo)}</div>
                        </div>
                      </div>
                    )
                  })}
                  {wizardFilteredInvoices.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Tidak ada faktur sesuai filter</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border p-5">
              {recapWizard === 'invoices' && (
                <div className="flex items-center justify-between text-sm mb-4 px-1">
                  <span className="text-muted-foreground">
                    {wizardFilteredInvoices.length} dari {wizardClientInvoices.length} faktur akan direkap
                  </span>
                  <span className="font-semibold text-foreground">
                    Total Saldo: {formatCurrency(
                      wizardFilteredInvoices.reduce((s: number, i: any) => s + Math.max(Number(i.total) - Number(i.amountPaid || 0), 0), 0)
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRecapWizard(null)}
                >
                  Batal
                </button>
                {recapWizard === 'invoices' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={wizardFilteredInvoices.length === 0 || wizardBusy}
                    onClick={handleWizardRecap}
                  >
                    {wizardBusy ? 'Membuat...' : 'Buat Rekap PDF'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paying && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setPaying(null)}
        >
          <div
            className="bg-card rounded-xl border border-border shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-foreground">Catat Pembayaran</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {paying.invoiceNumber} · {paying.customerName}
            </p>
            <div className="mt-3 rounded-lg bg-accent/40 border border-accent px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>{formatCurrency(paying.total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Terbayar</span><span>{formatCurrency(Number(paying.amountPaid || 0))}</span></div>
              <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-border/60 mt-1">
                <span>Sisa</span><span>{formatCurrency(Math.max(Number(paying.total) - Number(paying.amountPaid || 0), 0))}</span>
              </div>
            </div>
            <form onSubmit={handlePayment} className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Jumlah (Rp) *</label>
                <input
                  type="number" min="1" required className="input" value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Metode</label>
                <select
                  className="input" value={payForm.method}
                  onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                >
                  <option value="transfer">Transfer Bank</option>
                  <option value="tunai">Tunai</option>
                  <option value="qris">QRIS</option>
                  <option value="lainnya">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Referensi</label>
                <input
                  type="text" className="input" value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                  placeholder="No. transfer / bukti"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Catatan</label>
                <input
                  type="text" className="input" value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  placeholder="Opsional"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn btn-secondary" onClick={() => setPaying(null)}>Batal</button>
                <button type="submit" disabled={payBusy} className="btn btn-primary">
                  {payBusy ? 'Menyimpan...' : 'Simpan Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

</Layout>
  )
}
