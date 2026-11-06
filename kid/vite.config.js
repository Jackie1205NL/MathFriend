// 孩子端单独构建：npm run kid:dev 本地开发（自带后端，存档放在系统临时目录），npm run kid:build 输出到 dist-kid 给 Netlify。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { defineConfig } from 'vite'
import { createApi } from './server/game.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const DEV_DIR = path.join(os.tmpdir(), 'shuban-kid-dev')

// 原图只保留在设计包；开发和发布共用同一份白名单，不把原始帧、提示词或题库带到站点。
function petMotionAssets() {
  const pack = path.join(root, '..', 'design', 'pet', 'gif-pack-2026-11-05')
  const { items } = JSON.parse(fs.readFileSync(path.join(pack, 'manifest.json'), 'utf8'))
  const portraits = new Set(['idle', 'think', 'proud', 'shy-encourage']), files = new Map()
  const crop = { left: 25, top: 10, width: 350, height: 350 }
  const add = (name, file, portrait = false) => {
    let cached
    files.set('/' + name, () => cached ||= (async () => {
      const bytes = await fs.promises.readFile(file)
      if (!portrait) return bytes
      const gif = name.endsWith('.gif')
      const image = sharp(bytes, { animated: gif }).extract(crop).resize(256)
      return gif ? image.gif({ effort: 3, dither: 0 }).toBuffer() : image.png().toBuffer()
    })())
  }
  for (const { id, action } of items) {
    if (!/^s[23]-[a-z]+(?:-[a-z]+)*$/.test(id) || files.has('/' + id + '.gif')) throw new Error('宠物动画清单中的动作 ID 无效或重复')
    const gif = path.join(pack, 'assets', id + '.gif'), poster = path.join(pack, 'assets', id + '-frames', '00.png')
    add(id + '.gif', gif); add(id + '.png', poster)
    if (portraits.has(action)) { add(id + '-face.gif', gif, true); add(id + '-face.png', poster, true) }
  }
  return {
    name: 'kid-pet-motion',
    configureServer(server) {
      server.middlewares.use('/pet/motion', async (req, res) => {
        const name = (req.url || '').split('?')[0], load = files.get(name)
        if (!load) { res.statusCode = 404; res.end('Not found'); return }
        if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return }
        try {
          const bytes = await load()
          res.setHeader('Content-Type', name.endsWith('.gif') ? 'image/gif' : 'image/png')
          res.setHeader('Content-Length', bytes.length)
          res.setHeader('Cache-Control', 'no-cache')
          res.end(req.method === 'HEAD' ? undefined : bytes)
        } catch (error) { server.config.logger.error(String(error)); res.statusCode = 500; res.end('宠物动画暂时无法读取') }
      })
    },
    async generateBundle() {
      for (const [name, load] of files) this.emitFile({ type: 'asset', fileName: 'pet/motion' + name, source: await load() })
    },
  }
}

// 本地开发时用文件代替 Netlify Blobs；第一个孩子账号「宝贝」密码 1234，管理员 admin 密码 9999，同步令牌 dev
function devApi() {
  fs.mkdirSync(DEV_DIR, { recursive: true })
  const file = k => path.join(DEV_DIR, encodeURIComponent(k) + '.json')
  const store = { get: async k => fs.existsSync(file(k)) ? JSON.parse(fs.readFileSync(file(k), 'utf8')) : null, set: async (k, v) => { fs.mkdirSync(DEV_DIR, { recursive: true }); fs.writeFileSync(file(k), JSON.stringify(v)) } }
  const handle = createApi(store, { KID_PIN: process.env.KID_PIN || '1234', KID_USER: process.env.KID_USER || '宝贝', ADMIN_PIN: process.env.ADMIN_PIN || '9999', SYNC_TOKEN: process.env.SYNC_TOKEN || 'dev', DEV: true })
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
  plugins: [devApi(), petMotionAssets()],
  server: { host: '0.0.0.0', port: 5175 },
  build: { outDir: path.join(root, '..', 'dist-kid'), emptyOutDir: true },
})
