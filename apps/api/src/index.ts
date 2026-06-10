import Fastify from 'fastify'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { env } from './env'
import { appRouter } from './trpc/router'
import { resolveApiContext, type ApiContext } from './trpc/trpc'

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

  const createContext = async ({ req }: { req: { headers: Record<string, unknown> } }): Promise<ApiContext> =>
    resolveApiContext(req.headers)

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  })

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
