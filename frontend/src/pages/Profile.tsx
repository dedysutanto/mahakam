import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../lib/AuthContext'
import { UserCircle, KeyRound } from 'lucide-react'

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const [profile, setProfile] = useState({ fullName: '', phone: '' })
  const [profileMsg, setProfileMsg] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  useEffect(() => {
    if (user) {
      fetch('/api/auth/me')
        .then((r) => r.json())
        .then((me) => setProfile({ fullName: me.fullName || '', phone: me.phone || '' }))
    }
  }, [user])

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileBusy(true)
    setProfileMsg('')
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal menyimpan profil')
      setProfileMsg(data.message)
      await refreshUser()
    } catch (err: any) {
      setProfileMsg(err.message)
    } finally {
      setProfileBusy(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw.newPassword !== pw.confirm) {
      setPwMsg('Konfirmasi password tidak cocok')
      return
    }
    setPwBusy(true)
    setPwMsg('')
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Gagal mengubah password')
      setPwMsg(data.message)
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
    } catch (err: any) {
      setPwMsg(err.message)
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Profil Saya</h1>
          <p className="text-sm text-muted-foreground">Kelola informasi akun dan keamanan</p>
        </div>

        {/* Profile info */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserCircle className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Informasi Akun</h2>
          </div>
          {profileMsg && <p className="text-sm text-primary mb-3">{profileMsg}</p>}
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input type="email" className="input" value={user?.email || ''} disabled title="Email tidak dapat diubah" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nama Lengkap *</label>
              <input
                type="text" required className="input" value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Telepon</label>
              <input
                type="text" className="input" value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+62 ..."
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={profileBusy} className="btn btn-primary">
                {profileBusy ? 'Menyimpan...' : 'Simpan Profil'}
              </button>
            </div>
          </form>
        </div>

        {/* Password */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Ubah Password</h2>
          </div>
          {pwMsg && <p className="text-sm text-primary mb-3">{pwMsg}</p>}
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Password Saat Ini *</label>
              <input
                type="password" required className="input" value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Password Baru *</label>
                <input
                  type="password" required minLength={6} className="input" value={pw.newPassword}
                  onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                  placeholder="Min. 6 karakter"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Konfirmasi Baru *</label>
                <input
                  type="password" required minLength={6} className="input" value={pw.confirm}
                  onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={pwBusy} className="btn btn-primary">
                {pwBusy ? 'Menyimpan...' : 'Ubah Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  )
}
