import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../utils/db'
import bcrypt from 'bcryptjs'

export function addAuth(app: FastifyInstance) {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      return reply.code(401).send({ error: 'Akses ditolak. Token tidak valid atau kadaluarsa.' })
    }
  })
}

export function authHook(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Try JWT first
    try {
      await request.jwtVerify()
      return
    } catch {
      // JWT failed, try API key
    }

    // Try API key from Authorization: Bearer mk_live_...
    const authHeader = (request.headers as any)?.authorization
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer mk_')) {
      const rawKey = authHeader.slice(7) // remove "Bearer "
      const keyPrefix = rawKey.slice(0, 14)

      const apiKey = await prisma.apiKey.findUnique({ where: { keyPrefix } })
      if (apiKey && apiKey.isActive && bcrypt.compareSync(rawKey, apiKey.keyHash)) {
        // Check expiry
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
          return reply.code(401).send({ error: 'API key sudah kedaluwarsa.' })
        }

        // Update lastUsedAt (fire-and-forget)
        prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

        // Set request.user shape to match JWT auth
        ;(request as any).user = {
          userId: 'api-key',
          tenantId: apiKey.tenantId,
          role: 'admin',
          email: `api-key:${apiKey.name}`,
          scopes: apiKey.scopes,
        }
        return
      }
    }

    return reply.code(401).send({ error: 'Akses ditolak. Token tidak valid atau kadaluarsa.' })
  }
}

export function validateTenantHook(app: FastifyInstance, opts?: { fromParams?: boolean }) {
  return async (request: any, reply: any) => {
    const { tenantId, userId } = request.user as any

    // API key auth — skip TenantUser lookup, set tenant from user shape
    if (userId === 'api-key') {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant || !tenant.isActive) {
        return reply.code(403).send({ error: 'Akses ditolak. Tenant tidak aktif.' })
      }
      request.tenant = tenant
      request.tenantRole = 'admin'
      request.tenantScopes = (request.user as any).scopes || []
      return
    }

    // JWT auth — validate TenantUser membership
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

// Per-menu scope guard (two-tier admin). owner/admin bypass; staff and API keys need the scope listed.
export function requireScope(scope: string) {
  return async (request: any, reply: any) => {
    const { role, userId } = request.user || {}
    const scopes: string[] = request.tenantScopes || []

    // API key — check scopes (NO admin bypass, even though request.user.role is set to 'admin' in authHook).
    // This must stay FIRST: the owner/admin role bypass below must never apply to API keys.
    if (userId === 'api-key') {
      if (scopes.includes(scope)) return
      return reply.code(403).send({ error: `Akses ditolak. API key butuh akses menu: ${scope}.` })
    }

    // Owner/admin bypass (JWT users only)
    if (role === 'owner' || role === 'admin') return

    // Staff — check scopes
    if (scopes.includes(scope)) return
    reply.code(403).send({ error: `Akses ditolak. Butuh akses menu: ${scope}.` })
  }
}
