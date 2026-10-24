// 孩子端操作日志：孩子在页面上做的每件事（点按、填写、滑动、停留、换页、题目之间隔了多久）。
// 攒成一批批发给后端 /api/kid/oplog，管理员导出答题记录时放在 ops 字段里一起导出，用来分析怎么改善做题体验。
// 只记「做了什么、什么时候」：不记密码，输入框里的文字只记长度。每条事件 t 是进入页面后的毫秒数，g 是和上一条隔了多久（不到 2 秒不写）。
//
// 事件 k：start 开始（屏幕大小等）、view 换页、sheet 弹层、act 点了哪个按钮（dis 是按钮灰着没起作用）、tap 手指实际点在屏幕哪里、
//        swipe 手指划动（dy < 0 是往上划）、scroll 页面滚动（y0 到 y1）、key 键盘、input 输入框、vis 切走 / 回来、api 请求花了多久、
//        q.open 打开一题（gap 是离上一题做完隔了多久）、q.step 换到这一题的第几步、q.done 这题做完（ok 是否第一次就对）、q.leave 没做完就离开、q.caught 被拦下
let on = false, sid = '', seq = 0, t0 = 0, last = 0, buf = [], inflight = null, sending = false, timer = 0
const clock = () => Math.round(performance.now())
const BATCH = 150, BIG = 400, MAX_BUF = 3000

export function log(k, d) {
  if (!on) return
  const t = clock(), g = t - last
  last = t
  buf.push({ t, k, ...(g >= 2000 ? { g } : {}), ...d })
  if (buf.length > MAX_BUF) buf.splice(0, MAX_BUF / 3)       // 一直发不出去时丢最老的
  if (buf.length >= BATCH) flush()
}

/** 孩子登录以后开始记；换人（退出）时停 */
export function start() {
  if (on) return
  on = true; sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); seq = 0; buf = []; inflight = null; last = clock()
  t0 = Date.now() - last
  sp = sq = sh = ''; ss = -1; sf = sc = false; qEnd = 0; prevQ = ''
  const vp = window.visualViewport
  log('start', { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1, touch: 'ontouchstart' in window, vw: Math.round(vp?.width || 0), ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 40) })
  timer = setInterval(() => flush(), 15000)
}
export function stop() {
  if (!on) return
  flush(true); on = false; clearInterval(timer)
}

async function flush(keep) {
  if (sending || !on && !keep) return
  if (!inflight) { if (!buf.length) return; inflight = { sid, seq: ++seq, t0, ev: buf.splice(0, keep ? BIG : BATCH) } }
  sending = true
  try {
    const r = await fetch('/api/kid/oplog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(inflight), keepalive: !!keep })
    if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) inflight = null      // 已存下，或是格式 / 登录出了问题（重发也没用），不再重发
  } catch { /* 网络不好，下次再发同一批（后端按序号去重） */ }
  sending = false
  if (inflight === null && buf.length >= BATCH) flush()
}

// ---------- 页面状态：换页、弹层、题目的打开 / 换步 / 做完 / 离开 ----------
let sp = '', sq = '', sh = '', ss = -1, sf = false, sc = false, qEnd = 0, prevQ = ''
/** 每次重绘后调用：s = { page, sheet, q, gid, step, type, n, fin, ok, caught } */
export function state(s) {
  if (!on) return
  if (s.page !== sp) { log('view', { p: s.page }); sp = s.page }
  if ((s.sheet || '') !== sh) { sh = s.sheet || ''; log('sheet', { n: sh }) }
  const q = s.q || ''
  if (q !== sq) {
    if (sq) { if (!sf) { log('q.leave', { q: sq, i: ss }); qEnd = clock() } prevQ = sq }
    if (q) { log('q.open', { q, gid: s.gid, i: s.step, n: s.n, ...(qEnd ? { gap: clock() - qEnd, prev: prevQ } : {}) }); ss = s.step; sf = false; sc = false }
    sq = q
  }
  if (!q) return
  if (s.step !== ss) { log('q.step', { q, i: s.step, b: s.type }); ss = s.step }
  if (s.caught && !sc) { sc = true; log('q.caught', { q, i: s.step }) } else if (!s.caught) sc = false
  if (s.fin && !sf) { sf = true; log('q.done', { q, ok: s.ok ? 1 : 0 }); qEnd = clock() }
}

/** 点了一个按钮（所有按钮走同一个入口）。dis：按钮灰着，点了没起作用 */
export const act = (a, v, dis) => log('act', { a, ...(v ? { v: String(v).slice(0, 24) } : {}), ...(dis ? { dis: 1 } : {}) })
/** 一次请求花了多久 */
export const api = (p, ms, s) => { if (p !== '/oplog') log('api', { p: p.slice(0, 24), ms, s }) }

// ---------- 手指和键盘 ----------
const elKey = el => el === document || el === document.documentElement || el === document.body ? 'w' : (el.id || el.className?.toString().split(' ')[0] || el.tagName || '?').slice(0, 20)
let down = null, touch = null, scroll = null, scrollTimer = 0
const endScroll = () => { if (scroll) { log('scroll', { el: scroll.el, y0: scroll.y0, y1: scroll.y1, d: clock() - scroll.t }); scroll = null } }

document.addEventListener('pointerdown', e => { if (on) down = { x: e.clientX, y: e.clientY, t: clock() } }, { capture: true, passive: true })
document.addEventListener('pointerup', e => {
  if (!on || !down) return
  const a = e.target.closest?.('[data-a]')
  log('tap', { x: Math.round(e.clientX), y: Math.round(e.clientY), d: clock() - down.t, ...(a ? { a: a.dataset.a } : { miss: 1 }) })
  down = null
}, { capture: true, passive: true })
// 手指划动：触摸时浏览器会把 pointer 事件取消，用 touch 事件记划动方向和快慢
document.addEventListener('touchstart', e => { if (on) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: clock() } }, { capture: true, passive: true })
document.addEventListener('touchend', e => {
  if (!on || !touch) return
  const c = e.changedTouches[0], dx = Math.round(c.clientX - touch.x), dy = Math.round(c.clientY - touch.y)
  if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) log('swipe', { dx, dy, d: clock() - touch.t })
  touch = null
}, { capture: true, passive: true })
// 滚动：连续的滚动合成一条（停下 250 毫秒算一条）
document.addEventListener('scroll', e => {
  if (!on) return
  const el = elKey(e.target), y = Math.round(e.target === document ? window.scrollY : e.target.scrollTop)
  if (scroll && scroll.el !== el) endScroll()
  scroll ||= { el, y0: y, t: clock() }
  scroll.y1 = y
  clearTimeout(scrollTimer); scrollTimer = setTimeout(endScroll, 250)
}, { capture: true, passive: true })
document.addEventListener('keydown', e => {
  if (!on || e.target.matches?.('input,textarea')) return      // 输入框里的按键不记（可能是密码或名字）
  log('key', { key: /^(\d|Backspace|Enter|Escape|Tab)$/.test(e.key) ? e.key : 'other' })
}, { capture: true, passive: true })
document.addEventListener('input', e => { if (on) log('input', { id: (e.target.id || e.target.tagName).slice(0, 20), len: String(e.target.value ?? '').length }) }, { capture: true, passive: true })
document.addEventListener('visibilitychange', () => { if (!on) return; log('vis', { v: document.visibilityState }); if (document.visibilityState === 'hidden') flush(true) })
window.addEventListener('pagehide', () => { if (on) { log('vis', { v: 'pagehide' }); flush(true) } })
