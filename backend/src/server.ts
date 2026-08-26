import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import { addAuth } from './middleware/auth'
import { authRoutes } from './modules/auth/auth.routes'
import { tenantRoutes } from './modules/tenant/tenant.routes'
import { ledgerRoutes } from './modules/ledger/ledger.routes'
import { invoiceRoutes } from './modules/invoicing/invoice.routes'
import { expenseRoutes } from './modules/expense/expense.routes'
import { reportRoutes } from './modules/report/report.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { customerRoutes } from './modules/customer/customer.routes'
import { productRoutes } from './modules/product/product.routes'
import { purchaseRoutes } from './modules/purchase/purchase.routes'
import { quotationRoutes } from './modules/quotation/quotation.routes'
import { superAdminRoutes } from './modules/superadmin/superadmin.routes'
import { taxRoutes } from './modules/tax/tax.routes'
import { join } from 'path'

const APP_VERSION = '1.3.12'

export async function createApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  })

  // Register plugins
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173'
  await app.register(cors, {
    origin: corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  })
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  await app.register(jwt, {
    secret: process.env.JWT_SECRET,
    sign: { expiresIn: '24h' },
  })
  addAuth(app)
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }) // 5MB max

  // Rate limiting - global default: 100 req/min
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // Serve uploaded files (logos)
  await app.register(fastifyStatic, {
    root: join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  })

  // Swagger
  if (process.env.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Mahakam - Sistem Keuangan API',
          description: 'Mahakam — Sistem Keuangan: Buku Besar, Faktur, Pengeluaran, Pembelian, Produk & Laporan. Supports JWT Bearer token and API key (`Bearer mk_live_...`) authentication.',
          version: APP_VERSION,
        },
        servers: [{ url: 'http://localhost:3000' }],
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              description: 'JWT token or API key (mk_live_...)',
            },
          },
        },
        security: [{ BearerAuth: [] }],
      },
    })
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list' },
    })
  }

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  }))

  // Register route modules
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(tenantRoutes, { prefix: '/api/tenants' })
  await app.register(ledgerRoutes, { prefix: '/api/ledgers' })
  await app.register(invoiceRoutes, { prefix: '/api/invoices' })
  await app.register(expenseRoutes, { prefix: '/api/expenses' })
  await app.register(reportRoutes, { prefix: '/api/reports' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  await app.register(customerRoutes, { prefix: '/api/customers' })
  await app.register(productRoutes, { prefix: '/api/products' })
  await app.register(purchaseRoutes, { prefix: '/api/purchases' })
  await app.register(quotationRoutes, { prefix: '/api/quotations' })
  await app.register(superAdminRoutes, { prefix: '/api/superadmin' })
  await app.register(taxRoutes, { prefix: '/api/taxes' })

  return app
}
