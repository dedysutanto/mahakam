import { authHook, validateTenantHook } from '../../middleware/auth'
import bcrypt from 'bcryptjs'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { randomBytes } from 'crypto'

export async function tenantRoutes(app: FastifyInstance) {
  app.decorate('validateTenant', async (request: any, reply: any) => {
    const { tenantId, userId, role } = request.user as any

    const tenantUser = await prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: { tenantId, userId },
      },
      include: { tenant: true },
    })

    if (!tenantUser || !tenantUser.isActive) {
      reply.code(403)
      return reply.send({ error: 'Akses ditolak. Anda bukan anggota tenant ini.' })
    }

    request.tenant = tenantUser.tenant
    request.tenantRole = tenantUser.role
  })

  // LIST TENANTS FOR USER
  app.get('/', {
    schema: {
      tags: ['Perusahaan'],
      summary: 'List user companies',
      description: 'List all companies (tenants) the authenticated user belongs to.',
      security: [{ BearerAuth: [] }],
    },
    preValidation: [authHook(app)],
  }, async (request: any) => {
    const { userId } = request.user as any

    const tenantUsers = await prisma.tenantUser.findMany({
      where: { userId },
      include: { tenant: true },
    })

    return tenantUsers.map((tu: any) => ({
      id: tu.tenant.id,
      name: tu.tenant.name,
      plan: tu.tenant.plan,
      role: tu.role,
      isActive: tu.tenant.isActive,
      subdomain: tu.tenant.subdomain,
    }))
  })

  // LIST MEMBERS
  app.get('/:id/members', {
    schema: {
      tags: ['Pengguna & Akses'],
      summary: 'List company members',
      description: 'List all members of a company with their roles and scopes. Admin only.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any) => {
    const { id } = request.params as any
    const { role } = request.user as any

    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Akses ditolak')
    }

    const members = await prisma.tenantUser.findMany({
      where: { tenantId: id },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })

    return members.map((tu: any) => ({
      id: tu.id,
      userId: tu.userId,
      email: tu.user.email,
      fullName: tu.user.fullName,
      phone: tu.user.phone,
      role: tu.role,
      scopes: tu.scopes || [],
      isActive: tu.isActive,
    }))
  })

  const isAdminRole = (r: string) => r === 'owner' || r === 'admin'

  async function assertNotLastActiveAdmin(tenantId: string, targetUserId: string) {
    const members = await prisma.tenantUser.findMany({ where: { tenantId } })
    const activeAdmins = members.filter((m: any) => isAdminRole(m.role) && m.isActive && m.userId !== targetUserId)
    if (activeAdmins.length === 0) {
      throw new Error('Perusahaan harus memiliki minimal satu admin aktif')
    }
  }

  // ADD MEMBER — attaches an existing user by email, or creates a brand-new staff user
  app.post('/:id/members', {
    schema: {
      tags: ['Pengguna & Akses'],
      summary: 'Add company member',
      description: 'Add a member to the company. If email exists, attaches existing user. If not, creates new user with the given password. Admin only.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6, description: 'Required for new users' },
          fullName: { type: 'string', description: 'Required for new users' },
          role: { type: 'string', enum: ['owner', 'admin', 'member'], default: 'member' },
          scopes: { type: 'array', items: { type: 'string' }, description: 'Module scopes for staff role' },
        },
      },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { role: myRole } = request.user as any
    if (!isAdminRole(myRole)) throw new Error('Hanya admin perusahaan yang dapat menambah pengguna')

    const { email, password, fullName, role = 'member', scopes = [] } = request.body as any
    if (!['owner', 'admin', 'member'].includes(role)) throw new Error('Peran tidak valid')

    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      if (!password || String(password).length < 6) throw new Error('Password minimal 6 karakter untuk pengguna baru')
      if (!fullName) throw new Error('Nama lengkap wajib untuk pengguna baru')
      user = await prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash: bcrypt.hashSync(String(password), 10),
        },
      })
    }

    const existing = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: id, userId: user.id } },
    })
    if (existing) throw new Error('Pengguna sudah menjadi anggota')

    const tu = await prisma.tenantUser.create({
      data: {
        tenantId: id,
        userId: user.id,
        role,
        scopes: role === 'member' ? (Array.isArray(scopes) ? scopes : []) : [],
      },
    })

    reply.code(201).send({
      message: 'Anggota berhasil ditambahkan',
      member: {
        userId: tu.userId,
        email: user.email,
        fullName: user.fullName,
        role: tu.role,
        scopes: tu.scopes,
        isActive: tu.isActive,
      },
    })
  })

  // UPDATE MEMBER (role / scopes / isActive)
  app.put('/:id/members/:userId', {
    schema: {
      tags: ['Pengguna & Akses'],
      summary: 'Update member role, scopes, or status',
      description: 'Update a member role, scopes, active status, or reset their password. Admin can only edit staff members.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' }, userId: { type: 'string' } }, required: ['id', 'userId'] },
      body: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['owner', 'admin', 'member'] },
          scopes: { type: 'array', items: { type: 'string' } },
          isActive: { type: 'boolean' },
          newPassword: { type: 'string', minLength: 6, description: 'Reset member password' },
        },
      },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any, reply: any) => {
    const { id, userId } = request.params as any
    const { role: myRole } = request.user as any
    if (!isAdminRole(myRole)) throw new Error('Hanya admin perusahaan yang dapat mengubah pengguna')

    const body = request.body as any
    const target = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: id, userId } },
    })
    if (!target) throw new Error('Anggota tidak ditemukan')
    if (target.role !== 'member') throw new Error('Admin hanya dapat mengedit pengguna staf')

    const data: any = {}
    if (body.role !== undefined) {
      if (!['owner', 'admin', 'member'].includes(body.role)) throw new Error('Peran tidak valid')
      data.role = body.role
    }
    if (body.scopes !== undefined) data.scopes = Array.isArray(body.scopes) ? body.scopes : []
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

    const tu = await prisma.tenantUser.update({
      where: { tenantId_userId: { tenantId: id, userId } },
      data,
    })

    // Admin may reset a staff member's password directly
    let passwordReset = false
    if (body.newPassword !== undefined && body.newPassword !== '') {
      if (String(body.newPassword).length < 6) throw new Error('Password baru minimal 6 karakter')
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: bcrypt.hashSync(String(body.newPassword), 10) },
      })
      passwordReset = true
    }

    reply.send({
      message: passwordReset ? 'Anggota diperbarui — password sudah direset' : 'Anggota diperbarui',
      member: { role: tu.role, scopes: tu.scopes, isActive: tu.isActive },
    })
  })

  // REMOVE MEMBER
  app.delete('/:id/members/:userId', {
    schema: {
      tags: ['Pengguna & Akses'],
      summary: 'Remove member from company',
      description: 'Remove a member from the company. Prevents removing the last active admin.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' }, userId: { type: 'string' } }, required: ['id', 'userId'] },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any, reply: any) => {
    const { id, userId } = request.params as any
    const { role: myRole } = request.user as any
    if (!isAdminRole(myRole)) throw new Error('Hanya admin perusahaan yang dapat menghapus pengguna')

    const target = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: id, userId } },
    })
    if (!target) throw new Error('Anggota tidak ditemukan')
    if (isAdminRole(target.role)) await assertNotLastActiveAdmin(id, userId)

    await prisma.tenantUser.delete({
      where: {
        tenantId_userId: { tenantId: id, userId },
      },
    })

    reply.send({ message: 'Anggota berhasil dihapus' })
  })

  // GET TENANT SETTINGS
  app.get('/settings', {
    schema: {
      tags: ['Pengaturan'],
      summary: 'Get company settings',
      description: 'Get all settings key-value pairs for the current company.',
      security: [{ BearerAuth: [] }],
    },
    preValidation: [authHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const settings = await prisma.setting.findMany({
      where: { tenantId },
      select: { key: true, value: true },
    })
    const result: Record<string, string> = {}
    for (const s of settings) result[s.key] = s.value
    return result
  })

  // SAVE TENANT SETTINGS (bulk upsert)
  app.put('/settings', {
    schema: {
      tags: ['Pengaturan'],
      summary: 'Save company settings',
      description: 'Bulk upsert settings key-value pairs. Accepts any object with string keys and values.',
      security: [{ BearerAuth: [] }],
      body: { type: 'object', additionalProperties: { type: 'string' } },
    },
    preValidation: [authHook(app)],
  }, async (request: any, reply: any) => {
    const { tenantId } = request.user as any
    const entries = request.body as Record<string, string>
    if (!entries || typeof entries !== 'object') throw new Error('Data tidak valid')

    for (const [key, value] of Object.entries(entries)) {
      await prisma.setting.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: { value: String(value) },
        create: { tenantId, key, value: String(value) },
      })
    }

    reply.send({ message: 'Pengaturan berhasil disimpan' })
  })

  // UPLOAD TENANT LOGO
  app.post('/:id/logo', {
    schema: {
      tags: ['Pengaturan'],
      summary: 'Upload company logo',
      description: 'Upload a PNG or JPEG logo for the company. Max 5MB.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { role } = request.user as any

    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Hanya owner/admin yang dapat mengunggah logo')
    }

    const data = await request.file()
    if (!data) throw new Error('File tidak ditemukan')

    const allowed = ['image/png', 'image/jpeg']
    if (!allowed.includes(data.mimetype)) {
      throw new Error('Format logo harus PNG atau JPEG')
    }

    const ext = data.mimetype === 'image/png' ? 'png' : 'jpg'
    const filename = `${id}.${ext}`
    const logosDir = join(process.cwd(), 'uploads', 'logos')
    const filePath = join(logosDir, filename)
    const { mkdirSync } = await import('fs')
    mkdirSync(logosDir, { recursive: true })

    await pipeline(data.file, createWriteStream(filePath))

    await prisma.tenant.update({
      where: { id },
      data: { logoPath: filename },
    })

    reply.send({ message: 'Logo berhasil diunggah', logoPath: filename })
  })

  // UPDATE TENANT
  app.put('/:id', {
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { name, subdomain } = request.body as any

    await prisma.tenant.update({
      where: { id },
      data: { name, subdomain },
    })

    reply.send({ message: 'Tenant berhasil diperbarui' })
  })

  // ==========================================
  // API KEYS (admin-only)
  // ==========================================

  // LIST API KEYS
  app.get('/:id/api-keys', {
    schema: {
      tags: ['API Keys'],
      summary: 'List API keys',
      description: 'List all API keys for the tenant. Admin only. Returns key prefix (never full key), scopes, status, and last used timestamp.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any) => {
    const { id } = request.params as any
    const { role } = request.user as any
    if (!isAdminRole(role)) throw new Error('Akses ditolak')

    const keys = await prisma.apiKey.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
    })

    return keys.map((k: any) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes || [],
      isActive: k.isActive,
      expiresAt: k.expiresAt?.toISOString() || null,
      lastUsedAt: k.lastUsedAt?.toISOString() || null,
      createdAt: k.createdAt.toISOString(),
    }))
  })

  // CREATE API KEY
  app.post('/:id/api-keys', {
    schema: {
      tags: ['API Keys'],
      summary: 'Create API key',
      description: 'Create a new API key. The full key is only shown once in the response. Use tenantId from /api-key/info for integration.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, description: 'Descriptive name for this API key' },
          scopes: { type: 'array', items: { type: 'string', enum: ['faktur', 'produk', 'pelanggan', 'suplier', 'pembelian', 'biaya', 'buku-besar', 'pelaporan', 'pengaturan', 'pengguna'] }, description: 'Module access scopes (optional, defaults to all)' },
          expiresIn: { type: 'string', enum: ['30d', '90d', '180d', '1y', 'never'], description: 'Expiry duration (optional, defaults to never)' },
        },
      },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { role } = request.user as any
    if (!isAdminRole(role)) throw new Error('Akses ditolak')

    const { name, scopes = [], expiresIn } = request.body as any
    if (!name || !String(name).trim()) throw new Error('Nama API key wajib diisi')

    const rawKey = 'mk_live_' + randomBytes(20).toString('hex')
    const keyPrefix = rawKey.slice(0, 14)
    const keyHash = bcrypt.hashSync(rawKey, 10)

    let expiresAt: Date | null = null
    if (expiresIn && expiresIn !== 'never') {
      const now = new Date()
      const map: Record<string, number> = {
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000,
        '180d': 180 * 24 * 60 * 60 * 1000,
        '1y': 365 * 24 * 60 * 60 * 1000,
      }
      if (map[expiresIn]) expiresAt = new Date(now.getTime() + map[expiresIn])
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId: id,
        name: String(name).trim(),
        keyPrefix,
        keyHash,
        scopes: Array.isArray(scopes) ? scopes : [],
        expiresAt,
      },
    })

    reply.code(201).send({
      message: 'API key berhasil dibuat — simpan key ini sekarang, hanya ditampilkan sekali.',
      apiKey: {
        id: apiKey.id,
        tenantId: apiKey.tenantId,
        name: apiKey.name,
        key: rawKey,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt?.toISOString() || null,
        createdAt: apiKey.createdAt.toISOString(),
      },
    })
  })

  // REVOKE (DELETE) API KEY
  app.delete('/:id/api-keys/:keyId', {
    schema: {
      tags: ['API Keys'],
      summary: 'Delete API key',
      description: 'Permanently delete an API key. This cannot be undone.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' }, keyId: { type: 'string' } }, required: ['id', 'keyId'] },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any, reply: any) => {
    const { id, keyId } = request.params as any
    const { role } = request.user as any
    if (!isAdminRole(role)) throw new Error('Akses ditolak')

    const key = await prisma.apiKey.findFirst({ where: { id: keyId, tenantId: id } })
    if (!key) throw new Error('API key tidak ditemukan')

    await prisma.apiKey.delete({ where: { id: keyId } })

    reply.send({ message: 'API key berhasil dihapus' })
  })

  // TOGGLE API KEY ACTIVE STATUS
  app.put('/:id/api-keys/:keyId', {
    schema: {
      tags: ['API Keys'],
      summary: 'Toggle API key active status',
      description: 'Enable or disable an API key without deleting it. Disabled keys cannot authenticate.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' }, keyId: { type: 'string' } }, required: ['id', 'keyId'] },
      body: { type: 'object', required: ['isActive'], properties: { isActive: { type: 'boolean' } } },
    },
    preValidation: [authHook(app), validateTenantHook(app, { fromParams: true })],
  }, async (request: any, reply: any) => {
    const { id, keyId } = request.params as any
    const { role } = request.user as any
    if (!isAdminRole(role)) throw new Error('Akses ditolak')

    const { isActive } = request.body as any
    const key = await prisma.apiKey.findFirst({ where: { id: keyId, tenantId: id } })
    if (!key) throw new Error('API key tidak ditemukan')

    const updated = await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: Boolean(isActive) },
    })

    reply.send({ message: `API key ${updated.isActive ? 'diaktifkan' : 'dinonaktifkan'}`, isActive: updated.isActive })
  })
}
