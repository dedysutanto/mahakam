import { authHook, validateTenantHook } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'
import bcrypt from 'bcryptjs'

export async function authRoutes(app: FastifyInstance) {
  // REGISTER
  app.post('/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'fullName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          fullName: { type: 'string', minLength: 2 },
          tenantName: { type: 'string', minLength: 2 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, fullName, tenantName } = request.body as any

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) throw new Error('Email sudah terdaftar')

    const passwordHash = await bcrypt.hash(password, 10)

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, fullName },
      })

      const tenant = await tx.tenant.create({
        data: { name: tenantName || `${fullName} Perusahaan` },
      })

      await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId: user.id, role: 'owner' },
      })

      await tx.ledger.createMany({
        data: [
          { tenantId: tenant.id, code: '1-1000', name: 'Kas', type: 'asset', isSystem: true },
          { tenantId: tenant.id, code: '1-1100', name: 'Bank', type: 'asset', isSystem: true },
          { tenantId: tenant.id, code: '1-1200', name: 'Piutang Usaha', type: 'asset', isSystem: true },
          { tenantId: tenant.id, code: '1-2000', name: 'Persediaan', type: 'asset', isSystem: true },
          { tenantId: tenant.id, code: '1-3000', name: 'Aset Tetap', type: 'asset', isSystem: true },
          { tenantId: tenant.id, code: '2-1000', name: 'Hutang Usaha', type: 'liability', isSystem: true },
          { tenantId: tenant.id, code: '2-2000', name: 'Utang Gaji', type: 'liability', isSystem: true },
          { tenantId: tenant.id, code: '2-3000', name: 'Utang Pajak', type: 'liability', isSystem: true },
          { tenantId: tenant.id, code: '3-1000', name: 'Modal Penyertaan', type: 'equity', isSystem: true },
          { tenantId: tenant.id, code: '3-2000', name: 'Laba Ditahan', type: 'equity', isSystem: true },
          { tenantId: tenant.id, code: '4-1000', name: 'Pendapatan Penjualan', type: 'revenue', isSystem: true },
          { tenantId: tenant.id, code: '4-2000', name: 'Pendapatan Jasa', type: 'revenue', isSystem: true },
          { tenantId: tenant.id, code: '5-1000', name: 'Harga Pokok Penjualan', type: 'expense', isSystem: true },
          { tenantId: tenant.id, code: '5-2000', name: 'Beban Gaji', type: 'expense', isSystem: true },
          { tenantId: tenant.id, code: '5-3000', name: 'Beban Sewa', type: 'expense', isSystem: true },
          { tenantId: tenant.id, code: '5-4000', name: 'Beban Listrik & Air', type: 'expense', isSystem: true },
          { tenantId: tenant.id, code: '5-5000', name: 'Beban Administrasi', type: 'expense', isSystem: true },
          { tenantId: tenant.id, code: '5-6000', name: 'Beban Penyusutan', type: 'expense', isSystem: true },
        ],
      })

      await tx.tax.create({
        data: { tenantId: tenant.id, name: 'PPN', rate: 11, isDefault: true },
      })

      return { user, tenant }
    })

    const token = app.jwt.sign({
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: 'owner',
    })

    reply.send({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
        },
      },
    })
  })

  // LOGIN
  app.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as any

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        tenantUsers: {
          include: { tenant: true },
        },
      },
    })

    if (!user || !user.isActive) throw new Error('Email atau password salah')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new Error('Email atau password salah')

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    const tenantUser = user.tenantUsers[0]
    const scopes = tenantUser?.scopes || []

    // Super admin without any company membership signs a scopeless token
    const tokenPayload: any = {
      userId: user.id,
      role: tenantUser?.role || 'member',
      email: user.email,
    }
    if (tenantUser) tokenPayload.tenantId = tenantUser.tenantId

    const token = app.jwt.sign(tokenPayload)

    reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isSuperAdmin: user.isSuperAdmin,
        scopes,
        role: tenantUser?.role || 'member',
        tenant: tenantUser ? {
          id: tenantUser.tenant.id,
          name: tenantUser.tenant.name,
        } : null,
      },
    })
  })

  // GET CURRENT USER
  app.get('/me', {
    schema: {
      tags: ['Auth'],
      summary: 'Get current user profile',
      description: 'Returns the authenticated user profile including tenant info and scopes. Works with both JWT and API key auth.',
      security: [{ BearerAuth: [] }],
      response: { 200: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, fullName: { type: 'string' }, phone: { type: 'string' }, isSuperAdmin: { type: 'boolean' }, scopes: { type: 'array', items: { type: 'string' } }, role: { type: 'string' }, tenant: { type: ['object', 'null'], properties: { id: { type: 'string' }, name: { type: 'string' } } } } } },
    },
    preValidation: [authHook(app)],
  }, async (request, reply) => {
    const { userId, tenantId, role } = request.user as any

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenantUsers: {
          where: { tenantId },
          include: { tenant: true },
        },
      },
    })

    if (!user || !user.isActive) throw new Error('Pengguna tidak ditemukan')

    const tu = user.tenantUsers[0]

    reply.send({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      isSuperAdmin: user.isSuperAdmin,
      scopes: tu?.scopes || [],
      role: tu?.role || 'member',
      tenant: tu?.tenant || null,
    })
  })

  // UPDATE OWN PROFILE (name, phone)
  app.put('/profile', {
    schema: {
      tags: ['Auth'],
      summary: 'Update own profile',
      description: 'Update the authenticated user full name and phone number.',
      security: [{ BearerAuth: [] }],
      body: { type: 'object', required: ['fullName'], properties: { fullName: { type: 'string', minLength: 2 }, phone: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
    preValidation: [authHook(app)],
  }, async (request: any) => {
    const { userId } = request.user as any
    const { fullName, phone } = request.body as any

    if (!fullName || !String(fullName).trim()) throw new Error('Nama lengkap wajib diisi')

    await prisma.user.update({
      where: { id: userId },
      data: { fullName: String(fullName).trim(), phone: phone || null },
    })

    return { message: 'Profil berhasil diperbarui' }
  })

  // CHANGE OWN PASSWORD
  app.put('/password', {
    schema: {
      tags: ['Auth'],
      summary: 'Change own password',
      description: 'Change the authenticated user password. Requires current password.',
      security: [{ BearerAuth: [] }],
      body: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 6 } } },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
    preValidation: [authHook(app)],
  }, async (request: any) => {
    const { userId } = request.user as any
    const { currentPassword, newPassword } = request.body as any

    if (!currentPassword || !newPassword) throw new Error('Password lama dan baru wajib diisi')
    if (String(newPassword).length < 6) throw new Error('Password baru minimal 6 karakter')

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('Pengguna tidak ditemukan')

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) throw new Error('Password lama salah')

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(String(newPassword), 10) },
    })

    return { message: 'Password berhasil diubah' }
  })

  // GET API KEY INFO (works with both JWT and API key auth)
  app.get('/api-key/info', {
    schema: {
      tags: ['Auth'],
      summary: 'Get auth info (tenant, scopes)',
      description: 'Returns tenant ID, tenant name, role, and scopes for the authenticated request. Works with both JWT and API key auth. Use this to discover your tenantId when using API keys.',
      security: [{ BearerAuth: [] }],
      response: { 200: { type: 'object', properties: { authType: { type: 'string', enum: ['jwt', 'api-key'] }, tenantId: { type: 'string' }, tenantName: { type: ['string', 'null'] }, role: { type: 'string' }, scopes: { type: 'array', items: { type: 'string' } } } } },
    },
    preValidation: [authHook(app)],
  }, async (request: any) => {
    const { userId, tenantId, role, scopes, email } = request.user as any

    // API key auth
    if (userId === 'api-key') {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
      return {
        authType: 'api-key',
        tenantId,
        tenantName: tenant?.name || null,
        role: 'admin',
        scopes: scopes || [],
      }
    }

    // JWT auth
    const tenantUser = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { tenant: true },
    })

    return {
      authType: 'jwt',
      tenantId,
      tenantName: tenantUser?.tenant?.name || null,
      role: tenantUser?.role || 'member',
      scopes: tenantUser?.scopes || [],
    }
  })
}
