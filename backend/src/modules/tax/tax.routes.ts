import { authHook, validateTenantHook, requireScope } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'

export async function taxRoutes(app: FastifyInstance) {
  // LIST TAXES
  app.get('/', {
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any

    const taxes = await prisma.tax.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    return { data: taxes }
  })

  // CREATE TAX
  app.post('/', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pajak')],
  }, async (request: any, reply: any) => {
    const { tenantId } = request.user as any
    const { name, rate, isDefault } = request.body as any

    if (!name) throw new Error('Nama pajak wajib diisi')
    if (rate == null || isNaN(Number(rate)) || Number(rate) < 0) throw new Error('Tarif pajak tidak valid')

    const result = await prisma.$transaction(async (tx: any) => {
      // Only one default per tenant
      if (isDefault) {
        await tx.tax.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } })
      }
      return tx.tax.create({
        data: { tenantId, name, rate: Number(rate), isDefault: !!isDefault },
      })
    })

    reply.code(201).send(result)
  })

  // UPDATE TAX
  app.put('/:id', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pajak')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const body = request.body as any

    const existing = await prisma.tax.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pajak tidak ditemukan')

    const allowed = (({ name, rate, isDefault }) => {
      const data: any = {}
      if (name !== undefined) data.name = name
      if (rate !== undefined) data.rate = Number(rate)
      if (isDefault !== undefined) data.isDefault = isDefault
      return data
    })(body)

    const result = await prisma.$transaction(async (tx: any) => {
      if (allowed.isDefault === true) {
        await tx.tax.updateMany({ where: { tenantId, isDefault: true, id: { not: id } }, data: { isDefault: false } })
      }
      return tx.tax.update({ where: { id }, data: allowed })
    })

    reply.send(result)
  })

  // DELETE TAX
  app.delete('/:id', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pajak')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const existing = await prisma.tax.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pajak tidak ditemukan')

    await prisma.tax.delete({ where: { id } })
    reply.send({ message: 'Pajak berhasil dihapus' })
  })
}