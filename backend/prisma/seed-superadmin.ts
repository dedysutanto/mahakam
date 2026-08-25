// Bootstrap the first Super Admin.
// Usage: SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... SUPER_ADMIN_NAME=... npx tsx prisma/seed-superadmin.ts
import { prisma } from '../src/utils/db'
import bcrypt from 'bcryptjs'

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'super@mahakam.id'
  const password = process.env.SUPER_ADMIN_PASSWORD || 'super123'
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin'

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { isSuperAdmin: true } })
    console.log(`existing user ${email} promoted to Super Admin`)
    return
  }

  await prisma.user.create({
    data: {
      email,
      fullName: name,
      passwordHash: bcrypt.hashSync(password, 10),
      isSuperAdmin: true,
    },
  })
  console.log(`Super Admin created: ${email} (password from env or default 'super123')`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
