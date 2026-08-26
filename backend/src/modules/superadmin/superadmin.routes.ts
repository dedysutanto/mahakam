import { authHook } from '../../middleware/auth'
import bcrypt from 'bcryptjs'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'

async function assertSuperAdmin(request: any) {
  const user = await prisma.user.findUnique({ where: { id: request.user.userId } })
  if (!user?.isSuperAdmin) throw Object.assign(new Error('Akses ditolak. Khusus Super Admin.'), { statusCode: 403 })
}

export async function superAdminRoutes(app: FastifyInstance) {
  // LIST COMPANIES
  app.get('/tenants', {
    schema: { tags: ['Super Admin'], summary: 'List all companies', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app)],
  }, async (request: any) => {
    await assertSuperAdmin(request)

    const tenants = await prisma.tenant.findMany({
      include: {
        users: { where: { role: { in: ['owner', 'admin'] }, isActive: true }, include: { user: true } },
        _count: { select: { users: true, invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return tenants.map((t: typeof tenants[number]) => ({
      id: t.id,
      name: t.name,
      plan: t.plan,
      isActive: t.isActive,
      createdAt: t.createdAt,
      memberCount: t._count.users,
      invoiceCount: t._count.invoices,
      admins: t.users.map((tu: typeof t.users[number]) => ({ email: tu.user.email, fullName: tu.user.fullName, role: tu.role })),
    }))
  })

  // CREATE COMPANY + ASSIGN ADMIN
  app.post('/tenants', {
    schema: { tags: ['Super Admin'], summary: 'Create a new company', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app)],
  }, async (request: any, reply: any) => {
    await assertSuperAdmin(request)
    const { name, adminMode = 'new', adminEmail, adminPassword, adminFullName } = request.body as any

    if (!name) throw new Error('Nama perusahaan wajib diisi')

    let adminUser
    if (adminMode === 'existing') {
      if (!adminEmail) throw new Error('Email admin wajib diisi')
      adminUser = await prisma.user.findUnique({ where: { email: adminEmail } })
      if (!adminUser) throw new Error('Pengguna dengan email tersebut tidak ditemukan')
    } else {
      if (!adminEmail || !adminPassword || !adminFullName) {
        throw new Error('Nama, email, dan password admin wajib diisi')
      }
      if (String(adminPassword).length < 6) throw new Error('Password admin minimal 6 karakter')
      const exists = await prisma.user.findUnique({ where: { email: adminEmail } })
      if (exists) throw new Error('Email sudah terdaftar — gunakan mode pengguna existing')
      adminUser = await prisma.user.create({
        data: {
          email: adminEmail,
          fullName: adminFullName,
          passwordHash: bcrypt.hashSync(String(adminPassword), 10),
        },
      })
    }

    const tenant = await prisma.tenant.create({ data: { name } })

    // Seed default ledgers + PPN 11% (same as registration)
    const LEDGERS = [
      { code: '1-1000', name: 'Kas', type: 'asset' },
      { code: '1-1100', name: 'Bank', type: 'asset' },
      { code: '1-1200', name: 'Piutang Usaha', type: 'asset' },
      { code: '1-2000', name: 'Persediaan', type: 'asset' },
      { code: '1-3000', name: 'Aset Tetap', type: 'asset' },
      { code: '2-1000', name: 'Hutang Usaha', type: 'liability' },
      { code: '2-2000', name: 'Utang Gaji', type: 'liability' },
      { code: '2-3000', name: 'Utang Pajak', type: 'liability' },
      { code: '3-1000', name: 'Modal Penyertaan', type: 'equity' },
      { code: '3-2000', name: 'Laba Ditahan', type: 'equity' },
      { code: '4-1000', name: 'Pendapatan Penjualan', type: 'revenue' },
      { code: '4-2000', name: 'Pendapatan Jasa', type: 'revenue' },
      { code: '5-1000', name: 'Harga Pokok Penjualan', type: 'expense' },
      { code: '5-2000', name: 'Beban Gaji', type: 'expense' },
      { code: '5-3000', name: 'Beban Sewa', type: 'expense' },
      { code: '5-4000', name: 'Beban Listrik & Air', type: 'expense' },
      { code: '5-5000', name: 'Beban Administrasi', type: 'expense' },
      { code: '5-6000', name: 'Beban Penyusutan', type: 'expense' },
    ]
    await prisma.ledger.createMany({ data: LEDGERS.map((l) => ({ ...l, tenantId: tenant.id })) })
    await prisma.tax.create({
      data: { tenantId: tenant.id, id: `seed-tax-ppn11-${tenant.id.slice(-6)}`, name: 'PPN', rate: 11, isDefault: true },
    })

    const membership = await prisma.tenantUser.create({
      data: { tenantId: tenant.id, userId: adminUser.id, role: 'owner', scopes: [] },
    })

    reply.code(201).send({
      message: `Perusahaan ${name} berhasil dibuat`,
      tenant: { id: tenant.id, name: tenant.name },
      admin: { userId: adminUser.id, email: adminUser.email, fullName: adminUser.fullName, role: membership.role },
    })
  })

  // EDIT COMPANY — rename and/or (re)assign admin
  app.put('/tenants/:id', {
    schema: { tags: ['Super Admin'], summary: 'Update a company', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app)],
  }, async (request: any, reply: any) => {
    await assertSuperAdmin(request)
    const { id } = request.params as any
    const { name, adminMode = 'new', adminEmail, adminPassword, adminFullName } = request.body as any

    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) throw new Error('Perusahaan tidak ditemukan')

    const data: any = {}
    if (name !== undefined) {
      if (!String(name).trim()) throw new Error('Nama perusahaan tidak boleh kosong')
      data.name = String(name).trim()
    }
    await prisma.tenant.update({ where: { id }, data })

    let assignedAdmin = null
    if (adminEmail) {
      let adminUser = await prisma.user.findUnique({ where: { email: adminEmail } })

      if (!adminUser) {
        if (adminMode === 'existing') throw new Error('Pengguna dengan email tersebut tidak ditemukan')
        if (!adminPassword || String(adminPassword).length < 6) throw new Error('Password admin minimal 6 karakter')
        if (!adminFullName) throw new Error('Nama lengkap admin wajib diisi')
        const bcrypt = (await import('bcryptjs')).default ?? (await import('bcryptjs'))
        adminUser = await prisma.user.create({
          data: {
            email: adminEmail,
            fullName: adminFullName,
            passwordHash: bcrypt.hashSync(String(adminPassword), 10),
          },
        })
      }

      const membership = await prisma.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId: id, userId: adminUser.id } },
      })
      if (membership) {
        await prisma.tenantUser.update({
          where: { tenantId_userId: { tenantId: id, userId: adminUser.id } },
          data: { role: 'owner', isActive: true },
        })
      } else {
        await prisma.tenantUser.create({
          data: { tenantId: id, userId: adminUser.id, role: 'owner', scopes: [] },
        })
      }
      assignedAdmin = { userId: adminUser.id, email: adminUser.email, fullName: adminUser.fullName }
    }

    reply.send({
      message: 'Perusahaan berhasil diperbarui',
      ...(assignedAdmin ? { admin: assignedAdmin } : {}),
    })
  })

  // TOGGLE COMPANY ACTIVE
  app.put('/tenants/:id/status', {
    schema: { tags: ['Super Admin'], summary: 'Toggle company active status', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app)],
  }, async (request: any) => {
    await assertSuperAdmin(request)
    const { id } = request.params as any
    const { isActive } = request.body as any

    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) throw new Error('Perusahaan tidak ditemukan')

    const updated = await prisma.tenant.update({ where: { id }, data: { isActive: Boolean(isActive) } })
    return { message: `Perusahaan ${updated.isActive ? 'diaktifkan' : 'dinonaktifkan'}`, isActive: updated.isActive }
  })

  // PROMOTE AN EXISTING USER AS SUPER ADMIN
  app.post('/promote', {
    schema: { tags: ['Super Admin'], summary: 'Promote user to super admin', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app)],
  }, async (request: any, reply: any) => {
    await assertSuperAdmin(request)
    const { email } = request.body as any

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) throw new Error('Pengguna tidak ditemukan')

    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } })
    reply.send({ message: `${user.email} sekarang menjadi Super Admin` })
  })
}
