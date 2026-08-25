import { authHook, validateTenantHook, requireScope } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'

export async function productRoutes(app: FastifyInstance) {
  // LIST PRODUCTS
  app.get('/', {
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { page = '1', limit = '100', search } = request.query as any

    const where: any = { tenantId }
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { sku: { contains: search as string, mode: 'insensitive' } },
      ]
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const take = parseInt(limit as string)

    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      prisma.product.count({ where }),
    ])

    return {
      data: products,
      pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) },
    }
  })

  // GET SINGLE PRODUCT
  app.get('/:id', {
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const product = await prisma.product.findFirst({ where: { id, tenantId } })
    if (!product) throw new Error('Produk tidak ditemukan')

    return product
  })

  // CREATE PRODUCT
  app.post('/', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('produk')],
  }, async (request: any, reply: any) => {
    const { tenantId } = request.user as any
    const { name, sku, unit, description, price } = request.body as any

    if (!name) throw new Error('Nama produk wajib diisi')

    const product = await prisma.product.create({
      data: {
        tenantId,
        name,
        sku: sku || null,
        unit: unit || 'pcs',
        description: description || null,
        price: price ?? 0,
      },
    })

    reply.code(201).send(product)
  })

  // UPDATE PRODUCT
  app.put('/:id', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('produk')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const data = request.body as any

    const existing = await prisma.product.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Produk tidak ditemukan')

    const product = await prisma.product.update({ where: { id }, data })
    reply.send(product)
  })

  // DELETE PRODUCT
  app.delete('/:id', {
    preValidation: [authHook(app), validateTenantHook(app), requireScope('produk')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const existing = await prisma.product.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Produk tidak ditemukan')

    await prisma.product.delete({ where: { id } })
    reply.send({ message: 'Produk berhasil dihapus' })
  })
}