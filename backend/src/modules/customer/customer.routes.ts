import { authHook, validateTenantHook, requireScope } from '../../middleware/auth'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../utils/db'

export async function customerRoutes(app: FastifyInstance) {
  // LIST CUSTOMERS
  app.get('/', {
    schema: { tags: ['Pelanggan'], summary: 'List all customers', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { tenantId } = request.user as any
    const { page = '1', limit = '20', search, type } = request.query as any

    const where: any = { tenantId }
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ]
    }
    if (type) where.type = type

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const take = parseInt(limit as string)

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      prisma.customer.count({ where }),
    ])

    return {
      data: customers,
      pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) },
    }
  })

  // GET SINGLE CUSTOMER
  app.get('/:id', {
    schema: { tags: ['Pelanggan'], summary: 'Get a customer by ID', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app)],
  }, async (request: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId },
      include: { invoices: true },
    })

    if (!customer) throw new Error('Pelanggan tidak ditemukan')

    return customer
  })

  // CREATE CUSTOMER
  app.post('/', {
    schema: { tags: ['Pelanggan'], summary: 'Create a new customer', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pelanggan')],
  }, async (request: any, reply: any) => {
    const { tenantId } = request.user as any
    const { name, email, phone, address, province, country, taxId, type } = request.body as any

    if (!name) throw new Error('Nama wajib diisi')

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        province: province || null,
        country: country || null,
        taxId: taxId || null,
        type: type || 'customer',
      },
    })

    reply.code(201).send(customer)
  })

  // UPDATE CUSTOMER
  app.put('/:id', {
    schema: { tags: ['Pelanggan'], summary: 'Update a customer', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pelanggan')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any
    const body = request.body as any

    const existing = await prisma.customer.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pelanggan tidak ditemukan')

    const allowed = (({ name, email, phone, address, province, country, taxId, type }) =>
      ({ name, email, phone, address, province, country, taxId, type }))(body)

    const customer = await prisma.customer.update({
      where: { id },
      data: allowed,
    })

    reply.send(customer)
  })

  // DELETE CUSTOMER
  app.delete('/:id', {
    schema: { tags: ['Pelanggan'], summary: 'Delete a customer', security: [{ BearerAuth: [] }] },
    preValidation: [authHook(app), validateTenantHook(app), requireScope('pelanggan')],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const { tenantId } = request.user as any

    const existing = await prisma.customer.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error('Pelanggan tidak ditemukan')

    await prisma.customer.delete({ where: { id } })
    reply.send({ message: 'Pelanggan berhasil dihapus' })
  })
}