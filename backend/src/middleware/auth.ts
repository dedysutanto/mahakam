import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../utils/db'

export function addAuth(app: FastifyInstance) {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.code(401).send({ error: 'Akses ditolak. Token tidak valid atau kadaluarsa.' })
    }
  })
}

export function authHook(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.code(401).send({ error: 'Akses ditolak. Token tidak valid atau kadaluarsa.' })
    }
  }
}

export function validateTenantHook(app: FastifyInstance, opts?: { fromParams?: boolean }) {
  return async (request: any, reply: any) => {
    const { tenantId, userId } = request.user as any
    // Only trust a route param as tenantId on routes where :id IS the tenant id
    // (e.g. /api/tenants/:id/members). Resource routes like /api/invoices/:id
    // must validate against the JWT tenant instead.
    const checkId = opts?.fromParams ? ((request.params as any)?.id || tenantId) : tenantId

    const tenantUser = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: checkId, userId } },
      include: { tenant: true },
    })

    if (!tenantUser || !tenantUser.isActive) {
      reply.code(403).send({ error: 'Akses ditolak. Anda bukan anggota tenant ini.' })
      return
    }

    request.tenant = tenantUser.tenant
    request.tenantRole = tenantUser.role
    request.tenantScopes = tenantUser.scopes || []
  }
}

// Per-menu scope guard (two-tier admin). owner/admin bypass; staff need the scope listed.
export function requireScope(scope: string) {
  return async (request: any, reply: any) => {
    const role = request.tenantRole
    const scopes: string[] = request.tenantScopes || []
    if (role === 'owner' || role === 'admin' || scopes.includes(scope)) return
    reply.code(403).send({ error: `Akses ditolak. Butuh akses menu: ${scope}.` })
  }
}
