import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Memulai seeding...')

  const passwordHash = await bcrypt.hash('admin123', 10)

  // Create demo company
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant' },
    update: {},
    create: {
      id: 'demo-tenant',
      name: 'PT Maju Sejahtera',
      plan: 'premium',
      subdomain: 'maju-sejahtera',
    },
  })

  // Create admin user
  const user = await prisma.user.upsert({
    where: { email: 'admin@majusejahtera.id' },
    update: {},
    create: {
      id: 'demo-user',
      email: 'admin@majusejahtera.id',
      passwordHash,
      fullName: 'Administrator',
      phone: '+62 812 3456 7890',
    },
  })

  // Link user to tenant
  await prisma.tenantUser.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: user.id },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'owner',
    },
  })

  // Create another user
  const user2 = await prisma.user.upsert({
    where: { email: 'akun@majusejahtera.id' },
    update: {},
    create: {
      id: 'demo-user-2',
      email: 'akun@majusejahtera.id',
      passwordHash,
      fullName: 'Staff Akuntansi',
      phone: '+62 813 9876 5432',
    },
  })

  await prisma.tenantUser.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: user2.id },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: user2.id,
      role: 'member',
    },
  })

  // Create customers
  const customers = await Promise.all([
    prisma.customer.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'techcorp@example.co.id' } },
      update: {},
      create: {
        id: 'demo-customer-1',
        tenantId: tenant.id,
        name: 'PT Teknologi Indonesia',
        email: 'techcorp@example.co.id',
        phone: '+62 21 555 1234',
        address: 'Jl. Sudirman No. 100, Jakarta Selatan',
        taxId: '01.234.567.8-901.000',
        type: 'customer',
      },
    }),
    prisma.customer.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'globaltrade@example.co.id' } },
      update: {},
      create: {
        id: 'demo-customer-2',
        tenantId: tenant.id,
        name: 'CV Global Trade',
        email: 'globaltrade@example.co.id',
        phone: '+62 21 555 5678',
        address: 'Jl. Gatot Subroto No. 50, Jakarta Pusat',
        taxId: '02.345.678.9-012.000',
        type: 'customer',
      },
    }),
    prisma.customer.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'supplier@vendor.co.id' } },
      update: {},
      create: {
        id: 'demo-vendor-1',
        tenantId: tenant.id,
        name: 'PT Vendor Supplies',
        email: 'supplier@vendor.co.id',
        phone: '+62 21 555 9012',
        address: 'Jl. Kuningan No. 25, Jakarta Selatan',
        taxId: '03.456.789.0-123.000',
        type: 'customer',
      },
    }),
  ])

  // Create default chart of accounts (ledger)
  const ledgers = [
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

  for (const ledger of ledgers) {
    await prisma.ledger.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: ledger.code } },
      update: {},
      create: { ...ledger, tenantId: tenant.id, isSystem: true },
    })
  }

  console.log('✅ Seeding selesai!')
  console.log('')
  console.log('📧 Login credentials:')
  console.log('   Email: admin@majusejahtera.id')
  console.log('   Password: admin123')
  console.log('')
  console.log('   Email: akun@majusejahtera.id')
  console.log('   Password: admin123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
