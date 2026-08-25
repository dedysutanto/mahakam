import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'

async function test() {
  const app = Fastify()
  await app.register(fastifyJwt, { secret: 'test-secret' })
  await app.ready()
  
  const token = app.jwt.sign({ test: 'data' })
  console.log('Token:', token)
  
  const decoded = app.jwt.verify(token)
  console.log('Decoded:', decoded)
  
  process.exit(0)
}

test().catch(console.error)
