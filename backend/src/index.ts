import { createApp } from './server'

const app = await createApp()
await app.listen({ port: 3000, host: '0.0.0.0' })
console.log('Server running on http://localhost:3000')
