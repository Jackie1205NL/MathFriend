// 孩子端单独构建：npm run kid:dev 本地开发（自带后端，存档放在系统临时目录），npm run kid:build 输出到 dist-kid 给 Netlify。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { createApi } from './server/game.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const DEV_DIR = path.join(os.tmpdir(), 'shuban-kid-dev')

// 本地开发时用文件代替 Netlify Blobs；口令 1234，同步令牌 dev
function devApi() {
  fs.mkdirSync(DEV_DIR, { recursive: true })
  const file = k => path.join(DEV_DIR, encodeURIComponent(k) + '.json')
  const store = { get: async k => fs.existsSync(file(k)) ? JSON.parse(fs.readFileSync(file(k), 'utf8')) : null, set: async (k, v) => { fs.mkdirSync(DEV_DIR, { recursive: true }); fs.writeFileSync(file(k), JSON.stringify(v)) } }
  const handle = createApi(store, { KID_PIN: process.env.KID_PIN || '1234', SYNC_TOKEN: process.env.SYNC_TOKEN || 'dev', DEV: true })
  return {
    name: 'kid-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/kid', async (req, res) => {
        const chunks = []; for await (const c of req) chunks.push(c)
        const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
        try {
          const r = await handle(new Request(`http://localhost/api/kid${req.url}`, { method: req.method, headers: req.headers, body }))
          res.statusCode = r.status
          r.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await r.arrayBuffer()))
        } catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ error: '后端出错：' + e.message })) }
      })
    },
  }
}

export default defineConfig({
  root,
  plugins: [devApi()],
  server: { host: '0.0.0.0', port: 5175 },
  build: { outDir: path.join(root, '..', 'dist-kid'), emptyOutDir: true },
})
