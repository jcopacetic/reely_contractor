import Fastify from 'fastify'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { env } from './env'
import { appRouter } from './trpc/router'
import { resolveApiContext, type ApiContext } from './trpc/trpc'
import { registerStripe } from './webhooks/stripe'
import { rateLimit, clientIp } from './lib/rate-limit'

const SERVICE = 'contractor-api'

async function main() {
  const app = Fastify({ logger: true })

  // CORS: service-to-service callers send no Origin (allowed); browsers restricted to Reely origins.
  const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS ?? 'https://reely.io,https://www.reely.io')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  await app.register(cors, {
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      let host = ''
      try {
        host = new URL(origin).hostname
      } catch {
        return cb(null, false)
      }
      const ok = ALLOWED_ORIGINS.includes(origin) || host.endsWith('.vercel.app') || (env.NODE_ENV !== 'production' && host === 'localhost')
      cb(null, ok)
    },
  })

  // Per-IP rate limit on the UNAUTHENTICATED surface (probe floods, webhook bombing) — defense-in-depth
  // behind the Vercel WAF. Trusted service callers (the web app) carry x-contractor-service-key and are
  // EXEMPT, so legit traffic is never throttled; /health is skipped. The browser-timer extension's own
  // traffic is per-user and well under the cap.
  const RL_MAX = Number(process.env.API_RATE_LIMIT_MAX) || 120 // requests
  const RL_WINDOW = 60_000 // per 60s, per IP
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return
    const ctx = await resolveApiContext(req.headers as Record<string, unknown>)
    if (ctx.serviceCaller) return
    const ip = clientIp(req.headers as Record<string, unknown>, req.ip)
    const verdict = rateLimit(`api:${ip}`, RL_MAX, RL_WINDOW)
    if (!verdict.ok) {
      reply.header('Retry-After', String(verdict.retryAfter))
      return reply.code(429).send({ error: 'rate_limited', retryAfter: verdict.retryAfter })
    }
  })

  const createContext = async ({ req }: { req: { headers: Record<string, unknown> } }): Promise<ApiContext> =>
    resolveApiContext(req.headers)

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  })

  await registerStripe(app)

  app.get('/health', async () => ({ status: 'ok', node: 'contractor' }))

  const port = Number(process.env.PORT) || env.API_PORT
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`${SERVICE} listening on :${port}`)
}

process.on('unhandledRejection', (err) => {
  console.error(`[${SERVICE}] unhandledRejection`, err)
})

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
