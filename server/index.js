// 家庭内网服务：简单密码 + JSON API + 静态页面。启动：npm run server
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import * as store from './store.js'
import { buildSheet, plan } from './sheet.js'

const PORT = Number(process.env.PORT || 5174)
const app = express()
app.use(express.json())
store.ensureDirs()

// ---------- 登录（PRD 5.9：单一家庭密码） ----------
const token = () => { const s = store.loadSettings(); return store.sha256(`${s.secret}:${s.password}`).slice(0, 32) }
const cookie = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')))
// 公网暴露（Cloudflare Tunnel）时限制暴力猜密码：连错 5 次锁 5 分钟
let fail = { n: 0, until: 0 }
app.post('/api/login', (req, res) => {
  if (Date.now() < fail.until) return res.status(429).json({ error: '尝试过多，请 5 分钟后再试' })
  if (req.body?.password !== store.loadSettings().password) {
    fail = { n: fail.n + 1, until: fail.n + 1 >= 5 ? Date.now() + 300000 : 0 }
    if (fail.until) fail.n = 0
    return res.status(401).json({ error: '密码不对' })
  }
  fail = { n: 0, until: 0 }
  res.setHeader('Set-Cookie', `sb=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 90}`)
  res.json({ ok: true })
})
app.use('/api', (req, res, next) => cookie(req).sb === token() ? next() : res.status(401).json({ error: '请先登录' }))
// 路径参数只允许 周 与 三位编号，防止 ..%2f 穿越
app.param('week', (req, res, next, v) => /^\d{4}-W\d{2}$/.test(v) ? next() : res.status(400).json({ error: '周格式不对' }))
app.param('id', (req, res, next, v) => /^\d{3}$/.test(v) ? next() : res.status(400).json({ error: '编号格式不对' }))

// ---------- 状态 ----------
app.get('/api/state', (req, res) => {
  const weeks = store.listWeeks()
  const week = req.query.week || weeks.at(-1) || store.isoWeek()
  const knowledge = store.readKnowledge()
  const data = store.readWeek(week)
  const { password: _pw, secret: _s, ...settings } = store.loadSettings()
  res.json({
    week, weeks, current: store.isoWeek(), knowledge, data,
    all: weeks.map(store.readWeek),
    progress: store.computeProgress(weeks.filter(w => w <= week), knowledge),
    focus: plan(week).focus.map(({ entries, ...r }) => ({ ...r, entries: entries.map(e => e.id) })),
    originals: store.listOriginals(),
    inbox: fs.readdirSync(store.DIRS.inbox).filter(f => !f.startsWith('.')),
    sheet: fs.existsSync(path.join(store.DIRS.sheets, `${week}.pdf`)),
    settings,
  })
})

// 归集与出题不在页面上触发：家长把文件放进 inbox 后，在 Claude Code 里运行 /weekly（见 .claude/skills/weekly）。

// ---------- 错题截图 ----------
app.get('/api/image/:week/:id', (req, res) => {
  const f = path.join(store.DIRS.mistakes, req.params.week, `${req.params.id}.png`)
  fs.existsSync(f) ? res.sendFile(f) : res.status(404).end()
})

// ---------- 辅导单 ----------
app.post('/api/sheet/:week', async (req, res) => {
  try { await buildSheet(req.params.week); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/api/sheet/:week.pdf', (req, res) => {
  const f = path.join(store.DIRS.sheets, `${req.params.week}.pdf`)
  fs.existsSync(f) ? res.sendFile(f) : res.status(404).end()
})

// ---------- 设置与原件 ----------
app.put('/api/settings', (req, res) => {
  const allowed = ['password']
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k, v]) => allowed.includes(k) && v !== '' && v != null))
  const { password: _pw, secret: _s, ...rest } = store.saveSettings(patch)
  if (patch.password) res.setHeader('Set-Cookie', `sb=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 90}`)
  res.json(rest)
})
app.post('/api/keep/:file', (req, res) => {
  const s = store.loadSettings()
  const keep = s.keep.includes(req.params.file) ? s.keep.filter(f => f !== req.params.file) : [...s.keep, req.params.file]
  store.saveSettings({ keep }); res.json({ keep })
})

// ---------- 静态页面 ----------
const dist = path.join(process.cwd(), 'dist')
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('/{*path}', (_, res) => res.sendFile(path.join(dist, 'index.html'))) }

// 到期清理（F1-5）：启动时和每天一次
const purge = () => { const r = store.purgeExpired(); if (r.length) console.log('已删除到期原件：', r.join(', ')) }
purge(); setInterval(purge, 86400000)

app.listen(PORT, '0.0.0.0', () => console.log(`数伴服务已启动 http://localhost:${PORT}  数据目录 ${store.ROOT}`))
