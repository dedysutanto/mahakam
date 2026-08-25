import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../lib/AuthContext'
import { Building2, Plus, ShieldCheck, Power, Pencil } from 'lucide-react'

interface Company {
  id: string
  name: string
  plan: string
  isActive: boolean
  createdAt: string
  memberCount: number
  invoiceCount: number
  admins: { email: string; fullName: string; role: string }[]
}

export default function SuperAdmin() {
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const [form, setForm] = useState({
    name: '',
    adminMode: 'new' as 'new' | 'existing',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [changeAdmin, setChangeAdmin] = useState(false)
  const [editAdmin, setEditAdmin] = useState({
    adminMode: 'new' as 'new' | 'existing',
    adminFullName: '', adminEmail: '', adminPassword: '',
  })

  const fetchCompanies = () => {
    fetch('/api/superadmin/tenants')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Gagal memuat'))))
      .then(setCompanies)
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCompanies() }, [])

  // Guard AFTER all hooks: super admin only
  if (!user?.isSuperAdmin) {
    return (
      <Layout>
        <div className="text-center text-muted-foreground py-16">
          Akses ditolak. Halaman ini khusus Super Admin.
        </div>
      </Layout>
    )
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/superadmin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          adminMode: form.adminMode,
          adminEmail: form.adminEmail,
          adminPassword: form.adminMode === 'new' ? form.adminPassword : undefined,
          adminFullName: form.adminMode === 'new' ? form.adminFullName : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal membuat perusahaan')
      setMsg(data.message)
      setShowForm(false)
      setForm({ name: '', adminMode: 'new', adminFullName: '', adminEmail: '', adminPassword: '' })
      fetchCompanies()
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (c: Company) => {
    setEditingId(c.id)
    setEditName(c.name)
    setChangeAdmin(false)
    setEditAdmin({ adminMode: 'new', adminFullName: '', adminEmail: '', adminPassword: '' })
    setMsg('')
  }

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/superadmin/tenants/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          ...(changeAdmin ? {
            adminMode: editAdmin.adminMode,
            adminEmail: editAdmin.adminEmail,
            adminPassword: editAdmin.adminMode === 'new' ? editAdmin.adminPassword : undefined,
            adminFullName: editAdmin.adminMode === 'new' ? editAdmin.adminFullName : undefined,
          } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal menyimpan')
      setMsg(data.message)
      setEditingId(null)
      fetchCompanies()
    } catch (err: any) {
      setMsg(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (c: Company) => {
    try {
      const res = await fetch(`/api/superadmin/tenants/${c.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !c.isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal mengubah status')
      fetchCompanies()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Admin Sistem
            </h1>
            <p className="text-sm text-muted-foreground">Kelola perusahaan & admin (khusus Super Admin)</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Buat Perusahaan
          </button>
        </div>

        {msg && <div className="card p-3 text-sm text-foreground border-primary/30">{msg}</div>}

        {showForm && (
          <form onSubmit={handleCreate} className="card p-5 space-y-4">
            <h3 className="font-semibold text-foreground">Perusahaan Baru</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nama Perusahaan *</label>
                <input
                  type="text" required className="input" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="PT Maju Sejahtera"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Mode Admin</label>
                <select
                  className="input" value={form.adminMode}
                  onChange={(e) => setForm({ ...form, adminMode: e.target.value as 'new' | 'existing' })}
                >
                  <option value="new">Buat pengguna baru</option>
                  <option value="existing">Gunakan pengguna existing</option>
                </select>
              </div>
              {form.adminMode === 'new' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Nama Admin *</label>
                  <input
                    type="text" required className="input" value={form.adminFullName}
                    onChange={(e) => setForm({ ...form, adminFullName: e.target.value })}
                    placeholder="Nama lengkap admin"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Email Admin *</label>
                <input
                  type="email" required className="input" value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  placeholder="admin@perusahaan.com"
                />
              </div>
              {form.adminMode === 'new' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Password Admin *</label>
                  <input
                    type="password" required minLength={6} className="input" value={form.adminPassword}
                    onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                    placeholder="Minimal 6 karakter"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Perusahaan otomatis mendapat akun standar (Buku Besar default + PPN 11%).
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? 'Membuat...' : 'Buat Perusahaan'}
              </button>
            </div>
          </form>
        )}

        {editingId && (
          <form onSubmit={handleEditSave} className="card p-5 space-y-4 border-primary/30">
            <h3 className="font-semibold text-foreground">Edit Perusahaan</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nama Perusahaan *</label>
                <input
                  type="text" required className="input" value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={changeAdmin}
                    onChange={(e) => setChangeAdmin(e.target.checked)}
                  />
                  Ganti / tambah admin
                </label>
              </div>
              {changeAdmin && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Mode Admin</label>
                    <select
                      className="input" value={editAdmin.adminMode}
                      onChange={(e) => setEditAdmin({ ...editAdmin, adminMode: e.target.value as 'new' | 'existing' })}
                    >
                      <option value="new">Buat pengguna baru</option>
                      <option value="existing">Gunakan pengguna existing</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Email Admin *</label>
                    <input
                      type="email" required className="input" value={editAdmin.adminEmail}
                      onChange={(e) => setEditAdmin({ ...editAdmin, adminEmail: e.target.value })}
                    />
                  </div>
                  {editAdmin.adminMode === 'new' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Nama Admin *</label>
                        <input
                          type="text" required className="input" value={editAdmin.adminFullName}
                          onChange={(e) => setEditAdmin({ ...editAdmin, adminFullName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Password Admin *</label>
                        <input
                          type="password" required minLength={6} className="input" value={editAdmin.adminPassword}
                          onChange={(e) => setEditAdmin({ ...editAdmin, adminPassword: e.target.value })}
                          placeholder="Min. 6 karakter"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>Batal</button>
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        )}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Perusahaan</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pengguna</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Faktur</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {companies.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{c.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Sejak {new Date(c.createdAt).toLocaleDateString('id-ID')}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      {c.admins.length > 0 ? (
                        <>
                          <p className="text-foreground">{c.admins[0].fullName}</p>
                          <p className="text-xs text-muted-foreground">{c.admins[0].email}</p>
                        </>
                      ) : (
                        <span className="text-destructive text-xs">Belum ada admin</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-center text-foreground">{c.memberCount}</td>
                    <td className="px-5 py-3 text-sm text-center text-foreground">{c.invoiceCount}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`badge ${c.isActive ? 'badge-success' : 'badge-destructive'}`}>
                        {c.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => openEdit(c)}
                        title="Edit perusahaan"
                        className="p-1 mr-1 text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        title={c.isActive ? 'Nonaktifkan perusahaan' : 'Aktifkan perusahaan'}
                        className={`p-1 ${c.isActive ? 'text-muted-foreground hover:text-destructive' : 'text-muted-foreground hover:text-success'}`}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {companies.length === 0 && !loading && (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Belum ada perusahaan</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
