import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { Settings, Upload, Building2, Hash, FileText, MapPin } from 'lucide-react'
import { PROVINCES_ID, DEFAULT_COUNTRY } from '../lib/regions'
import { useAuth } from '../lib/AuthContext'
import { UserPlus, Power, Pencil, Trash2, Key, Package } from 'lucide-react'

const KINDS = [
  { key: 'invoice', label: 'Faktur', defaultPrefix: 'INV' },
  { key: 'quotation', label: 'Penawaran', defaultPrefix: 'QUO' },
  { key: 'expense', label: 'Pengeluaran', defaultPrefix: 'EXP' },
  { key: 'purchase', label: 'Pembelian', defaultPrefix: 'PUR' },
]

const SCOPE_OPTIONS = [
  { key: 'buku-besar', label: 'Buku Besar' },
  { key: 'faktur', label: 'Faktur' },
  { key: 'penawaran', label: 'Penawaran' },
  { key: 'pembelian', label: 'Pembelian' },
  { key: 'pengeluaran', label: 'Pengeluaran' },
  { key: 'produk', label: 'Produk' },
  { key: 'pelanggan', label: 'Pelanggan & Vendor' },
  { key: 'pajak', label: 'Pajak' },
  { key: 'laporan', label: 'Laporan' },
  { key: 'pengaturan', label: 'Pengaturan' },
]

export default function SettingsPage() {
  const [tenantName, setTenantName] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Numbering config
  const [numbering, setNumbering] = useState<Record<string, Record<string, string>>>({})
  const [numberingDirty, setNumberingDirty] = useState(false)

  // Template notes
  const [templateNote, setTemplateNote] = useState('')
  const [templateTerms, setTemplateTerms] = useState('')
  const [templateDirty, setTemplateDirty] = useState(false)

  // Company info
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyCity, setCompanyCity] = useState('')
  const [companyProvince, setCompanyProvince] = useState('')
  const [companyCountry, setCompanyCountry] = useState(DEFAULT_COUNTRY)
  const [bankName, setBankName] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [bankAccountHolder, setBankAccountHolder] = useState('')
  const [companyNpwp, setCompanyNpwp] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [companyDirty, setCompanyDirty] = useState(false)

  // PDF design
  const [pdfDesign, setPdfDesign] = useState('professional')
  const [pdfDirty, setPdfDirty] = useState(false)

  // Product units
  const DEFAULT_UNITS = ['pcs', 'unit', 'box', 'kg', 'liter', 'jam', 'lisensi', 'langganan']
  const [unitList, setUnitList] = useState<string[]>(DEFAULT_UNITS)
  const [newUnit, setNewUnit] = useState('')

  const [tenantId, setTenantId] = useState<string | null>(null)
  const { user } = useAuth()
  const isAdminUser = user?.role === 'owner' || user?.role === 'admin'

  interface Member { userId: string; email: string; fullName: string; role: string; scopes: string[]; isActive: boolean }
  const [members, setMembers] = useState<Member[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberMsg, setMemberMsg] = useState('')
  const [newMember, setNewMember] = useState({
    mode: 'new' as 'new' | 'existing',
    fullName: '', email: '', password: '', role: 'member',
    scopes: ['faktur'] as string[],
  })

  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editMember, setEditMember] = useState({ role: 'member', scopes: [] as string[] })
  const [resetPw, setResetPw] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  // API Keys state
  interface ApiKey { id: string; name: string; keyPrefix: string; scopes: string[]; isActive: boolean; expiresAt: string | null; lastUsedAt: string | null; createdAt: string }
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [showAddApiKey, setShowAddApiKey] = useState(false)
  const [apiKeyMsg, setApiKeyMsg] = useState('')
  const [newApiKey, setNewApiKey] = useState({ name: '', scopes: ['faktur'] as string[], expiresIn: 'never' })
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null)

  const fetchApiKeys = () => {
    if (!tenantId || !isAdminUser) return
    fetch(`/api/tenants/${tenantId}/api-keys`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Gagal memuat API key'))))
      .then(setApiKeys)
      .catch((e) => setApiKeyMsg(e.message))
  }

  useEffect(() => { fetchApiKeys() }, [tenantId])

  const toggleApiKeyScope = (scope: string) => {
    setNewApiKey((k) => ({
      ...k,
      scopes: k.scopes.includes(scope) ? k.scopes.filter((x) => x !== scope) : [...k.scopes, scope],
    }))
  }

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiKeyMsg('')
    try {
      const res = await fetch(`/api/tenants/${tenantId}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newApiKey),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal membuat API key')
      setCreatedApiKey(data.apiKey.key)
      setApiKeyMsg('API key berhasil dibuat — salin sekarang!')
      setNewApiKey({ name: '', scopes: ['faktur'], expiresIn: 'never' })
      setShowAddApiKey(false)
      fetchApiKeys()
    } catch (err: any) {
      setApiKeyMsg(err.message)
    }
  }

  const handleToggleApiKey = async (keyId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}/api-keys/${keyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal mengubah status')
      setApiKeyMsg(data.message)
      fetchApiKeys()
    } catch (err: any) {
      setApiKeyMsg(err.message)
    }
  }

  const handleDeleteApiKey = async (keyId: string, name: string) => {
    if (!confirm(`Hapus API key "${name}"? Aksi ini tidak dapat dibatalkan.`)) return
    try {
      const res = await fetch(`/api/tenants/${tenantId}/api-keys/${keyId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal menghapus API key')
      setApiKeyMsg(data.message)
      fetchApiKeys()
    } catch (err: any) {
      setApiKeyMsg(err.message)
    }
  }

  const fetchMembers = () => {
    if (!tenantId || !isAdminUser) return
    fetch(`/api/tenants/${tenantId}/members`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Gagal memuat pengguna'))))
      .then(setMembers)
      .catch((e) => setMemberMsg(e.message))
  }

  useEffect(() => { fetchMembers() }, [tenantId])

  const toggleMemberScope = (scope: string) => {
    setNewMember((m) => ({
      ...m,
      scopes: m.scopes.includes(scope) ? m.scopes.filter((x) => x !== scope) : [...m.scopes, scope],
    }))
  }

  const startEditMember = (m: Member) => {
    if (m.role !== 'member') return // admin can edit staff only
    setEditingUserId(m.userId)
    setEditMember({ role: m.role, scopes: m.scopes || [] })
    setResetPw(false)
    setNewPassword('')
    setMemberMsg('')
  }

  const toggleEditMemberScope = (scope: string) => {
    setEditMember((m) => ({
      ...m,
      scopes: m.scopes.includes(scope) ? m.scopes.filter((x) => x !== scope) : [...m.scopes, scope],
    }))
  }

  const handleSaveMemberEdit = async (userId: string) => {
    try {
      if (resetPw && newPassword.length < 6) {
        throw new Error('Password baru minimal 6 karakter')
      }
      const res = await fetch(`/api/tenants/${tenantId}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editMember,
          ...(resetPw ? { newPassword } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal menyimpan')
      setMemberMsg(data.message)
      setEditingUserId(null)
      fetchMembers()
    } catch (err: any) {
      setMemberMsg(err.message)
    }
  }

  const handleDeleteMember = async (m: Member) => {
    if (!confirm(`Hapus pengguna ${m.fullName}? Akses ke perusahaan ini akan dicabut.`)) return
    try {
      const res = await fetch(`/api/tenants/${tenantId}/members/${m.userId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal menghapus pengguna')
      setMemberMsg(data.message)
      fetchMembers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setMemberMsg('')
    try {
      const res = await fetch(`/api/tenants/${tenantId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newMember.email,
          role: newMember.role,
          scopes: newMember.scopes,
          ...(newMember.mode === 'new'
            ? { password: newMember.password, fullName: newMember.fullName }
            : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal menambah pengguna')
      setMemberMsg(data.message)
      setShowAddMember(false)
      setNewMember({ mode: 'new', fullName: '', email: '', password: '', role: 'member', scopes: ['faktur'] })
      fetchMembers()
    } catch (err: any) {
      setMemberMsg(err.message)
    }
  }

  const toggleMemberActive = async (m: Member) => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}/members/${m.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !m.isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal mengubah status')
      fetchMembers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  useEffect(() => {
    fetch('/api/tenants/')
      .then((r) => r.json())
      .then((data) => {
        const tenant = data[0]
        if (tenant) {
          setTenantId(tenant.id)
          setTenantName(tenant.name || '')
          setLogoPreview(`/uploads/logos/${tenant.id}.png`)
        }
      })
      .catch(() => {})

    fetch('/api/tenants/settings')
      .then((r) => r.json())
      .then((data) => {
        const n: Record<string, Record<string, string>> = {}
        for (const k of KINDS) {
          n[k.key] = {
            prefix: data[`numbering_${k.key}_prefix`] || k.defaultPrefix,
            year: data[`numbering_${k.key}_year`] ?? 'true',
            digits: data[`numbering_${k.key}_digits`] || '4',
          }
        }
        setNumbering(n)
        setTemplateNote(data.invoice_template_note || '')
        setTemplateTerms(data.invoice_template_terms || '')
        setCompanyAddress(data.company_address || '')
        setCompanyCity(data.company_city || '')
        setCompanyProvince(data.company_province || '')
        setCompanyCountry(data.company_country || DEFAULT_COUNTRY)
        setBankName(data.bank_name || '')
        setBankAccountNumber(data.bank_account_number || '')
        setBankAccountHolder(data.bank_account_holder || '')
        setCompanyNpwp(data.company_npwp || '')
        setCompanyPhone(data.company_phone || '')
        setCompanyEmail(data.company_email || '')
        setPdfDesign(data.invoice_pdf_design || 'professional')
        try {
          const parsedUnits = JSON.parse(data.product_units || '')
          if (Array.isArray(parsedUnits) && parsedUnits.length > 0) setUnitList(parsedUnits.map(String))
        } catch {}
      })
      .catch(() => {})
   }, [])

  const addUnit = () => {
    const u = newUnit.trim()
    if (!u) return
    if (u.length > 20) { setMsg('Satuan maksimal 20 karakter'); return }
    if (unitList.includes(u)) { setMsg('Satuan sudah ada dalam daftar'); return }
    setUnitList([...unitList, u])
    setNewUnit('')
    setMsg('')
  }

  const removeUnit = (u: string) => {
    if (unitList.length <= 1) { setMsg('Minimal satu satuan harus tersisa'); return }
    setUnitList(unitList.filter((x) => x !== u))
    setMsg('')
  }

  const handleUnitsSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/tenants/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_units: JSON.stringify(unitList) }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan')
      }
      setMsg('Daftar satuan berhasil disimpan!')
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleUpload = async () => {
    if (!logoFile) return
    setSaving(true)
    setMsg('')
    try {
      if (!tenantId) throw new Error('Tenant tidak ditemukan')
      const formData = new FormData()
      formData.append('file', logoFile)
      const res = await fetch(`/api/tenants/${tenantId}/logo`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal mengunggah logo')
      }
      setMsg('Logo berhasil diunggah!')
      sessionStorage.removeItem('logo_ok')
      localStorage.setItem('logo_bust', String(Date.now()))
      window.location.reload() // refresh sidebar logo + favicon
      setLogoFile(null)
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleNameSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      if (!tenantId) throw new Error('Tenant tidak ditemukan')
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tenantName }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan')
      }
      setMsg('Nama perusahaan berhasil diperbarui!')
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleNumberingSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const payload: Record<string, string> = {}
      for (const k of KINDS) {
        const n = numbering[k.key]
        if (!n) continue
        payload[`numbering_${k.key}_prefix`] = n.prefix.trim() || k.defaultPrefix
        payload[`numbering_${k.key}_year`] = n.year
        payload[`numbering_${k.key}_digits`] = n.digits
      }
      const res = await fetch('/api/tenants/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan')
      }
      setMsg('Format nomor dokumen berhasil disimpan!')
      setNumberingDirty(false)
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTemplateSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/tenants/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_template_note: templateNote,
          invoice_template_terms: templateTerms,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan')
      }
      setMsg('Template catatan faktur berhasil disimpan!')
      setTemplateDirty(false)
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCompanySave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/tenants/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_address: companyAddress,
          company_city: companyCity,
          company_province: companyProvince,
          company_country: companyCountry,
          bank_name: bankName,
          bank_account_number: bankAccountNumber,
          bank_account_holder: bankAccountHolder,
          company_npwp: companyNpwp,
          company_phone: companyPhone,
          company_email: companyEmail,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan')
      }
      setMsg('Informasi perusahaan berhasil disimpan!')
      setCompanyDirty(false)
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDesignSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/tenants/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_pdf_design: pdfDesign }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Gagal menyimpan')
      }
      setMsg('Desain PDF berhasil disimpan!')
      setPdfDirty(false)
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const updateNumbering = (kind: string, field: string, value: string) => {
    setNumbering((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [field]: value },
    }))
    setNumberingDirty(true)
  }

  const previewNumber = (kind: string) => {
    const n = numbering[kind]
    if (!n) return '...'
    const prefix = n.prefix.trim() || KINDS.find((k) => k.key === kind)?.defaultPrefix || 'DOC'
    const yearPart = n.year === 'true' ? `${new Date().getFullYear()}-` : ''
    const digits = parseInt(n.digits) || 4
    const seq = '1'.padStart(digits, '0')
    return `${prefix}-${yearPart}${seq}`
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Pengaturan</h1>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm ${msg.includes('berhasil') ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
            {msg}
          </div>
        )}

        {/* Company Name */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Nama Perusahaan</h2>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Nama perusahaan Anda"
            />
            <button
              onClick={handleNameSave}
              disabled={saving || !tenantName.trim()}
              className="btn btn-primary"
            >
              Simpan
            </button>
          </div>
        </div>

        {/* Logo Upload */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Logo Perusahaan</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Logo akan muncul di header faktur PDF. Format: PNG, JPEG, atau SVG (maks 5MB).
          </p>

          {logoPreview && (
            <div className="mb-4">
              <img
                src={logoPreview}
                alt="Logo preview"
                className="h-20 object-contain border border-border rounded-lg p-2 bg-card"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="btn btn-secondary cursor-pointer">
              <Upload className="w-4 h-4" />
              Pilih File
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={handleLogoSelect}
              />
            </label>
            {logoFile && (
              <button
                onClick={handleUpload}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? 'Mengunggah...' : 'Unggah Logo'}
              </button>
            )}
          </div>
        </div>

        {/* Users & Access (company admin only) */}
        {isAdminUser && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Pengguna & Akses</h2>
              </div>
              <button onClick={() => setShowAddMember(!showAddMember)} className="btn btn-primary btn-sm">
                + Tambah Pengguna
              </button>
            </div>
            {memberMsg && <p className="text-sm text-primary">{memberMsg}</p>}

            {showAddMember && (
              <form onSubmit={handleAddMember} className="border border-border rounded-lg p-4 space-y-3 bg-muted/40">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Mode</label>
                    <select
                      className="input"
                      value={newMember.mode}
                      onChange={(e) => setNewMember({ ...newMember, mode: e.target.value as 'new' | 'existing' })}
                    >
                      <option value="new">Pengguna baru</option>
                      <option value="existing">Email sudah terdaftar</option>
                    </select>
                  </div>
                  {newMember.mode === 'new' && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nama Lengkap *</label>
                      <input
                        type="text" required className="input" value={newMember.fullName}
                        onChange={(e) => setNewMember({ ...newMember, fullName: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Email *</label>
                    <input
                      type="email" required className="input" value={newMember.email}
                      onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    />
                  </div>
                  {newMember.mode === 'new' && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Password *</label>
                      <input
                        type="password" required minLength={6} className="input" value={newMember.password}
                        onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                        placeholder="Min. 6 karakter"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Peran</label>
                    <select
                      className="input" value={newMember.role}
                      onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                    >
                      <option value="member">Staf (pilih menu)</option>
                      <option value="admin">Admin (semua akses)</option>
                    </select>
                  </div>
                </div>

                {newMember.role === 'member' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Akses Menu</label>
                    <div className="flex flex-wrap gap-2">
                      {SCOPE_OPTIONS.map((sc) => (
                        <button
                          key={sc.key} type="button"
                          onClick={() => toggleMemberScope(sc.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            newMember.scopes.includes(sc.key)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-muted-foreground border-border hover:bg-muted'
                          }`}
                        >
                          {sc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)}>Batal</button>
                  <button type="submit" className="btn btn-primary">Simpan Pengguna</button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Pengguna</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Peran</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Akses Menu</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((m) => (
                    <>
                    <tr key={m.userId}>
                      <td className="px-3 py-2">
                        <p className="text-sm font-medium text-foreground">{m.fullName}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`badge ${m.role === 'owner' || m.role === 'admin' ? 'badge-info' : 'badge-default'}`}>
                          {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Staf'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {m.role === 'owner' || m.role === 'admin' ? (
                          <span className="text-xs text-muted-foreground">Semua menu</span>
                        ) : m.scopes.length ? (
                          <div className="flex flex-wrap gap-1">
                            {m.scopes.map((sc) => (
                              <span key={sc} className="badge badge-default text-[10px]">{sc}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-destructive">Tanpa akses</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`badge ${m.isActive ? 'badge-success' : 'badge-destructive'}`}>
                          {m.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {m.role === 'member' && editingUserId !== m.userId && (
                            <button
                              onClick={() => startEditMember(m)}
                              title="Edit peran & akses"
                              className="p-1 text-muted-foreground hover:text-primary"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {m.role === 'member' && editingUserId !== m.userId && (
                            <button
                              onClick={() => toggleMemberActive(m)}
                              title={m.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              className={`p-1 ${m.isActive ? 'text-muted-foreground hover:text-destructive' : 'text-muted-foreground hover:text-success'}`}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          )}
                          {m.role === 'member' && editingUserId !== m.userId && (
                            <button
                              onClick={() => handleDeleteMember(m)}
                              title="Hapus dari perusahaan"
                              className="p-1 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editingUserId === m.userId && (
                      <tr key={`${m.userId}-edit`}>
                        <td colSpan={5} className="px-3 py-3 bg-muted/40 border-b border-border">
                          <div className="flex flex-col md:flex-row md:items-start gap-3">
                            <div className="md:w-40 flex-shrink-0">
                              <label className="block text-xs font-medium text-muted-foreground mb-1">Peran</label>
                              <select
                                className="input"
                                value={editMember.role}
                                onChange={(e) => setEditMember({ ...editMember, role: e.target.value })}
                              >
                                <option value="member">Staf (pilih menu)</option>
                                <option value="admin">Admin (semua akses)</option>
                              </select>
                            </div>
                            {editMember.role === 'member' && (
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Akses Menu</label>
                                <div className="flex flex-wrap gap-2">
                                  {SCOPE_OPTIONS.map((sc) => (
                                    <button
                                      key={sc.key} type="button"
                                      onClick={() => toggleEditMemberScope(sc.key)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                        editMember.scopes.includes(sc.key)
                                          ? 'bg-primary text-primary-foreground border-primary'
                                          : 'bg-card text-muted-foreground border-border hover:bg-muted'
                                      }`}
                                    >
                                      {sc.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="md:w-56">
                              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer mb-1">
                                <input
                                  type="checkbox"
                                  checked={resetPw}
                                  onChange={(e) => { setResetPw(e.target.checked); setNewPassword('') }}
                                />
                                Reset password staf
                              </label>
                              {resetPw && (
                                <input
                                  type="password"
                                  className="input h-9 text-sm"
                                  placeholder="Password baru (min. 6)"
                                  value={newPassword}
                                  required
                                  onChange={(e) => setNewPassword(e.target.value)}
                                />
                              )}
                            </div>
                            <div className="flex items-end gap-2 md:ml-auto">
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingUserId(null)}>
                                Batal
                              </button>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSaveMemberEdit(m.userId)}>
                                Simpan
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* API Keys (company admin only) */}
        {isAdminUser && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">API Keys</h2>
              </div>
              <button onClick={() => setShowAddApiKey(!showAddApiKey)} className="btn btn-primary btn-sm">
                + Buat API Key
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              API key untuk akses programatik ke data perusahaan. Gunakan header <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Authorization: Bearer mk_live_...</code>
            </p>

            {tenantId && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <span>Tenant ID:</span>
                <code className="font-mono text-foreground">{tenantId}</code>
                <button onClick={() => navigator.clipboard.writeText(tenantId)} className="text-primary hover:underline">Salin</button>
              </div>
            )}

            {apiKeyMsg && <p className="text-sm text-primary">{apiKeyMsg}</p>}

            {createdApiKey && (
              <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
                <p className="text-sm font-medium text-success mb-2">API Key (salin sekarang — hanya ditampilkan sekali):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-card border border-border rounded text-sm font-mono break-all">{createdApiKey}</code>
                  <button onClick={() => { navigator.clipboard.writeText(createdApiKey) }} className="btn btn-secondary btn-sm whitespace-nowrap">Salin</button>
                </div>
                <button onClick={() => setCreatedApiKey(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Tutup</button>
              </div>
            )}

            {showAddApiKey && (
              <form onSubmit={handleCreateApiKey} className="border border-border rounded-lg p-4 space-y-3 bg-muted/40">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Nama *</label>
                    <input
                      type="text" required className="input" value={newApiKey.name}
                      onChange={(e) => setNewApiKey({ ...newApiKey, name: e.target.value })}
                      placeholder="Contoh: MCP Integration"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Kedaluwarsa</label>
                    <select
                      className="input" value={newApiKey.expiresIn}
                      onChange={(e) => setNewApiKey({ ...newApiKey, expiresIn: e.target.value })}
                    >
                      <option value="never">Tanpa batas</option>
                      <option value="30d">30 hari</option>
                      <option value="90d">90 hari</option>
                      <option value="180d">180 hari</option>
                      <option value="1y">1 tahun</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Akses Menu</label>
                  <div className="flex flex-wrap gap-2">
                    {SCOPE_OPTIONS.filter((sc) => sc.key !== 'pengaturan').map((sc) => (
                      <button
                        key={sc.key} type="button"
                        onClick={() => toggleApiKeyScope(sc.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          newApiKey.scopes.includes(sc.key)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddApiKey(false)}>Batal</button>
                  <button type="submit" className="btn btn-primary">Buat API Key</button>
                </div>
              </form>
            )}

            {apiKeys.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 font-medium">Nama</th>
                      <th className="py-2 font-medium">Prefix</th>
                      <th className="py-2 font-medium">Akses</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Terakhir Dipakai</th>
                      <th className="py-2 font-medium">Kedaluwarsa</th>
                      <th className="py-2 font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((k) => (
                      <tr key={k.id} className="border-b border-border/50">
                        <td className="py-2 font-medium">{k.name}</td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">{k.keyPrefix}...</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {k.scopes.map((s) => (
                              <span key={s} className="px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">{SCOPE_OPTIONS.find((o) => o.key === s)?.label || s}</span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${k.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                            {k.isActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('id-ID') : 'Belum pernah'}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('id-ID') : 'Selamanya'}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleToggleApiKey(k.id, k.isActive)}
                              className={`min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg transition-colors ${k.isActive ? 'text-warning hover:bg-warning/10' : 'text-success hover:bg-success/10'}`}
                              title={k.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteApiKey(k.id, k.name)}
                              className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Hapus"
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
            )}
          </div>
        )}

        {/* Company Info */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Informasi Perusahaan</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Alamat</label>
              <input className="input" value={companyAddress} onChange={(e) => { setCompanyAddress(e.target.value); setCompanyDirty(true) }} placeholder="Jl. Contoh No. 123" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Kota</label>
              <input className="input" value={companyCity} onChange={(e) => { setCompanyCity(e.target.value); setCompanyDirty(true) }} placeholder="Jakarta" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Provinsi</label>
              {companyCountry === DEFAULT_COUNTRY ? (
                <select className="input" value={companyProvince} onChange={(e) => { setCompanyProvince(e.target.value); setCompanyDirty(true) }}>
                  <option value="">Pilih provinsi...</option>
                  {PROVINCES_ID.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <input className="input" value={companyProvince} onChange={(e) => { setCompanyProvince(e.target.value); setCompanyDirty(true) }} placeholder="Province / State" />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Negara</label>
              <input className="input" value={companyCountry} onChange={(e) => { setCompanyCountry(e.target.value); setCompanyDirty(true) }} placeholder={DEFAULT_COUNTRY} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nama Bank</label>
              <input className="input" value={bankName} onChange={(e) => { setBankName(e.target.value); setCompanyDirty(true) }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">No. Rekening</label>
              <input className="input" value={bankAccountNumber} onChange={(e) => { setBankAccountNumber(e.target.value); setCompanyDirty(true) }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Atas Nama</label>
              <input className="input" value={bankAccountHolder} onChange={(e) => { setBankAccountHolder(e.target.value); setCompanyDirty(true) }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">NPWP</label>
              <input className="input" value={companyNpwp} onChange={(e) => { setCompanyNpwp(e.target.value); setCompanyDirty(true) }} placeholder="00.000.000.0-000.000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Telepon</label>
              <input className="input" value={companyPhone} onChange={(e) => { setCompanyPhone(e.target.value); setCompanyDirty(true) }} placeholder="021-1234567" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input className="input" value={companyEmail} onChange={(e) => { setCompanyEmail(e.target.value); setCompanyDirty(true) }} placeholder="info@perusahaan.com" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCompanySave}
              disabled={saving || !companyDirty}
              className="btn btn-primary"
            >
              {saving ? 'Menyimpan...' : 'Simpan Informasi'}
            </button>
          </div>
        </div>

        {/* Numbering Format */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Format Nomor Dokumen</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Atur prefix, format tahun, dan jumlah digit untuk nomor dokumen otomatis.
          </p>

          <div className="space-y-4">
            {KINDS.map((k) => (
              <div key={k.key} className="border border-border rounded-lg p-4">
                <div className="text-sm font-medium text-foreground mb-3">{k.label}</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Prefix</label>
                    <input
                      type="text"
                      className="input text-sm"
                      value={numbering[k.key]?.prefix ?? k.defaultPrefix}
                      onChange={(e) => updateNumbering(k.key, 'prefix', e.target.value)}
                      placeholder={k.defaultPrefix}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Sertakan Tahun</label>
                    <select
                      className="input text-sm"
                      value={numbering[k.key]?.year ?? 'true'}
                      onChange={(e) => updateNumbering(k.key, 'year', e.target.value)}
                    >
                      <option value="true">Ya (2026)</option>
                      <option value="false">Tidak</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Digit</label>
                    <select
                      className="input text-sm"
                      value={numbering[k.key]?.digits ?? '4'}
                      onChange={(e) => updateNumbering(k.key, 'digits', e.target.value)}
                    >
                      <option value="3">3 (001)</option>
                      <option value="4">4 (0001)</option>
                      <option value="5">5 (00001)</option>
                      <option value="6">6 (000001)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground/70">
                  Contoh: <span className="font-mono text-muted-foreground">{previewNumber(k.key)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleNumberingSave}
              disabled={saving || !numberingDirty}
              className="btn btn-primary"
            >
              {saving ? 'Menyimpan...' : 'Simpan Format'}
            </button>
          </div>
        </div>

        {/* Product Units */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Satuan Produk</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Daftar satuan yang tersedia pada dropdown produk dan tercetak di faktur. Minimal satu satuan.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {unitList.map((u) => (
              <span key={u} className="inline-flex items-center gap-1 border border-border rounded-full pl-3 pr-1.5 py-1 text-sm bg-muted">
                {u}
                <button onClick={() => removeUnit(u)} title={`Hapus ${u}`} className="w-4 h-4 rounded-full text-muted-foreground hover:text-destructive flex items-center justify-center">
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 max-w-xs">
            <input
              type="text"
              className="input text-sm"
              value={newUnit}
              maxLength={20}
              placeholder="Satuan baru..."
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUnit() } }}
            />
            <button type="button" onClick={addUnit} className="btn btn-secondary btn-sm">Tambah</button>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={handleUnitsSave} disabled={saving} className="btn btn-primary">
              {saving ? 'Menyimpan...' : 'Simpan Satuan'}
            </button>
          </div>
        </div>

        {/* Template Notes */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Template Catatan Faktur</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Catatan dan syarat ini akan otomatis muncul di setiap faktur PDF yang dicetak.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Catatan Default</label>
              <textarea
                className="input min-h-[80px]"
                value={templateNote}
                onChange={(e) => { setTemplateNote(e.target.value); setTemplateDirty(true) }}
                placeholder="Contoh: Terima kasih atas kerjasama Anda."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Syarat & Ketentuan Default</label>
              <textarea
                className="input min-h-[80px]"
                value={templateTerms}
                onChange={(e) => { setTemplateTerms(e.target.value); setTemplateDirty(true) }}
                placeholder="Contoh: Pembayaran harus dilakukan dalam 30 hari."
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleTemplateSave}
              disabled={saving || !templateDirty}
              className="btn btn-primary"
            >
              {saving ? 'Menyimpan...' : 'Simpan Template'}
            </button>
          </div>
        </div>

        {/* PDF Design */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Desain PDF Faktur</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Pilih gaya tampilan untuk PDF faktur yang dicetak.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { key: 'clean', name: 'Clean', desc: 'Minimalis, garis tipis, tanpa warna blok' },
              { key: 'professional', name: 'Professional', desc: 'Header tabel gelap, baris belang, korporat' },
              { key: 'elegant', name: 'Elegant', desc: 'Klasik serif dengan aksen emas' },
            ].map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => { setPdfDesign(d.key); setPdfDirty(true) }}
                className={`text-left rounded-xl border-2 p-4 transition-colors ${
                  pdfDesign === d.key
                    ? 'border-primary bg-accent/40'
                    : 'border-border hover:border-ring'
                }`}
              >
                <p className={`font-semibold text-sm ${pdfDesign === d.key ? 'text-primary' : 'text-foreground'}`}>{d.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{d.desc}</p>
                {pdfDesign === d.key && (
                  <span className="inline-block mt-2 text-xs font-medium text-primary">✓ Dipilih</span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleDesignSave}
              disabled={saving || !pdfDirty}
              className="btn btn-primary"
            >
              {saving ? 'Menyimpan...' : 'Simpan Desain'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}