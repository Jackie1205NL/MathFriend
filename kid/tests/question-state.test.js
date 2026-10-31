import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import * as contract from '../../shared/contract.js'
import { createApi } from '../server/game.js'

// 运行实际页面状态函数；不启动服务，DOM/计时器由此处替身接住。
const source = await fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8')
const boot = source.indexOf(';(async () => {'), afterBoot = source.indexOf('// 只更新倒计时按钮', boot)
const code = source.slice(source.indexOf('const app ='), boot) + source.slice(afterBoot)
const DATE = '2026-10-27'
const word = { id: 'word', tpl: 'word', group: 'g', format: 'word', level: '同构', kp: '01.4', err: '审题', bucket: '本周重点', price: 12,
  answer: 480, flow: ['say'], segs: [{ t: '票价是多少元？' }], ask: '答：票价', units: ['元', '人'], unit: '元', tail: '', choices: [{ t: '480', v: 480, ok: 1 }] }
const oral = { ...word, id: 'oral', tpl: 'oral', format: 'oral', text: '4 + 3', answer: 7, flow: ['fill'] }
async function fixture(t) {
  t.mock.method(Date, 'now', () => Date.parse(`${DATE}T12:00:00+08:00`))
  const data = new Map([['pack', { week: '2026-W44', groups: [{ id: 'g', name: '练习', daily: 2 }], items: [word, oral], tuning: { slow: 0 } }]])
  const api = createApi({ get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) },
    { DEV: true, KID_USER: 'test-ui', KID_PIN: '1234', ADMIN_PIN: '5678', SYNC_TOKEN: 'memory-only' })
  let cookie = ''
  const request = async (path, body) => api(new Request(`http://memory/api/kid${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))
  cookie = (await request('/login', { name: 'test-ui', pin: '1234' })).headers.get('set-cookie').split(';')[0]
  await request('/state')
  Object.assign(data.get('state'), { hatched: true, gift: { date: DATE, what: null }, greet: DATE })
  const view = await (await request('/state')).json()
  const storage = new Map(), events = {}, rendered = [], calls = [], timers = new Map()
  let timerId = 0
  let intercept = async (path, body, send) => send()
  const app = { innerHTML: '', setAttribute() {}, querySelectorAll: () => [] }
  const document = { getElementById: () => app, querySelector: () => null, addEventListener: (k, fn) => (events[k] ||= []).push(fn) }
  const context = vm.createContext({ ...contract, document, window: { addEventListener() {}, scrollTo() {} }, structuredClone, Set, Date, AbortController,
    setInterval() {}, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id }, clearTimeout(id) { timers.delete(id) }, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    ops: { start() {}, stop() {}, state() {}, act() {}, api() {} },
    fetch: async (url, opts = {}) => { const path = url.replace('/api/kid', ''), body = opts.body && JSON.parse(opts.body); calls.push({ path, body }); return intercept(path, body, () => request(path, body), opts.signal) },
    capture: q => rendered.push({ pending: q?.pending, msg: q?.msg }),
  })
  vm.runInContext(code + `
    render = () => { if (page === 'q') storeDraft(); capture(Q) }; sfx = () => {};
    globalThis.ui = {
      load(v) { V = v; Q = null; page = 'quests' },
      open() { const g = groups()[0]; startQ(g, g.items.find(it => it.id === 'word')) },
      custom(flow, i = 0, rec = []) { const g = groups()[0], it = g.items.find(it => it.id === 'word'); it.flow = flow; startQ(g, it); Q.i = i; Q.rec = rec; Q.edits = {}; enter() },
      get: () => ({ Q, V, page, busy }), edit: x => Object.assign(Q, x), enter, storeDraft, save,
      back: QA.backto, go: A.go, stepgo: QA.stepgo, recover: QA.recover, key: QA.key, unit: QA.unit,
      html: vQ, sig: sigOf, redraw: render,
      click(a, v) { const el = { dataset: { a, v }, disabled: false, classList: { contains: () => false } }; onAct({ target: { closest: () => el } }) },
    }`, context)
  const ui = context.ui
  ui.load(structuredClone(view)); ui.open()
  return { ui, data, request, storage, events, rendered, calls, timers, view, intercept: fn => { intercept = fn } }
}
const json = x => JSON.parse(JSON.stringify(x))

test('当前答句离题/刷新后保留，Set、多空、竖式格子和清空编辑均可序列化恢复', async t => {
  const f = await fixture(t), { ui } = f
  ui.edit({ input: '480', unit: '元' }); ui.go('quests'); ui.open()
  assert.equal(ui.get().Q.input, '480'); assert.equal(ui.get().Q.unit, '元')
  const cases = [
    [{ type: 'choose', mode: 'multi', opts: [{ t: '甲' }, { t: '乙' }] }, { sel: new Set([0, 1]) }],
    [{ type: 'blanks', blanks: ['□ 千米 □ 米'] }, { vals: ['0', '480'], units: ['千米', '米'], cur: 1 }],
    [{ type: 'column', a: 104, b: 3, op: '×', width: 4, carries: [1] }, { cells: { d0: '2', c1: '1', d1: '1' }, pos: 2 }],
    [{ type: 'bins', nums: ['12', '18'], bins: ['小', '大'] }, { put: [0, -1], hold: 1 }],
    [{ type: 'draw', from: 10, cm: 9 }, { mm: 48 }],
  ]
  for (const [step, values] of cases) {
    ui.custom([step]); ui.edit(values); ui.storeDraft(); ui.go('quests'); ui.open()
    for (const [k, v] of Object.entries(values)) assert.deepEqual(json(k === 'sel' ? [...ui.get().Q.sel] : ui.get().Q[k]), json(k === 'sel' ? [...v] : v))
  }
  const flow = [{ type: 'fill', text: '1 + 1' }, { type: 'build', tier: 1, chips: [{ v: 3 }, { v: 36 }] }]
  ui.custom(flow, 1, [{ v: 2 }, { expr: [3, '×', 36], chips: [0, null, 1] }])
  ui.edit({ expr: [] }); ui.back(''); ui.edit({ i: 1 }); ui.enter()
  assert.deepEqual(json(ui.get().Q.expr), [])
  assert.deepEqual(json(ui.get().Q.rec[1].expr), [3, '×', 36], '未确认编辑不得改写已确认 rec')
  ui.storeDraft(); ui.go('quests'); ui.open(); assert.deepEqual(json(ui.get().Q.expr), [])
})

test('完整flow指纹拒绝同ID换数字的草稿；旧rec结构可读，圈词服务器点评不被旧编辑覆盖', async t => {
  const { ui, storage } = await fixture(t)
  ui.edit({ input: '480' }); ui.storeDraft(); ui.go('quests')
  const old = JSON.parse(storage.get('kid-draft')); old.all.word.edits[0].input = '999'; storage.set('kid-draft', JSON.stringify(old))
  ui.custom([{ type: 'say', ask: '新题', units: ['元'], tail: '' }]); assert.equal(ui.get().Q.input, '')
  const circle = [{ type: 'circle' }, { type: 'say', ask: '答', units: ['元'] }]
  ui.custom(circle, 0, [{ sel: [1], cfb: { sel: [1], readyAt: 0 } }])
  ui.edit({ sel: new Set([0]), edits: { 0: { basis: '[]', sel: [0], input: '999' } } }); ui.enter()
  assert.deepEqual([...ui.get().Q.sel], [1]); assert.equal(ui.get().Q.input, '')
  ui.edit({ i: 1, rec: [{ sel: [1], cfb: { sel: [1], readyAt: 0 } }, { v: 0, unit: '元' }], edits: {} }); ui.enter()
  assert.equal(ui.get().Q.input, '0'); assert.equal(ui.get().Q.unit, '元')
})

test('交卷立即反馈并锁定单位/数字/导航/回退/键盘/画线，双击只发一次且请求内容不晚变', async t => {
  const f = await fixture(t), { ui } = f
  let release
  f.intercept(async (path, body, send) => path === '/answer' ? new Promise(resolve => { release = () => resolve(send()) }) : send())
  ui.edit({ input: '480', unit: null }); const pending = ui.stepgo()
  assert.match(ui.get().Q.pending, /交卷/); assert.ok(f.rendered.some(r => /交卷/.test(r.pending)))
  for (const [a, v] of [['unit', '元'], ['key', '9'], ['go', 'quests'], ['backto', '']]) ui.click(a, v)
  ui.unit('元'); ui.key('9'); ui.stepgo()
  let prevented = false
  for (const handler of f.events.keydown) handler({ key: 'Enter', preventDefault: () => { prevented = true } })
  for (const handler of f.events.pointerdown) handler({ target: { closest: () => ({}) } })
  assert.equal(prevented, true); assert.equal(ui.get().page, 'q'); assert.equal(ui.get().Q.input, '480'); assert.equal(ui.get().Q.unit, null)
  assert.equal(f.calls.filter(c => c.path === '/answer').length, 1)
  assert.equal(f.calls.find(c => c.path === '/answer').body.steps[0].unit, null)
  release(); await pending; assert.equal(ui.get().Q.pending, '')
})

test('真实API拒绝重复交卷后自动恢复已存结果；题目移出今日任务则回任务页', async t => {
  for (const gone of [false, true]) {
    const f = await fixture(t), { ui } = f
    if (gone) { const pack = f.data.get('pack'); pack.items = pack.items.filter(it => it.id !== 'word') }
    else assert.equal((await f.request('/answer', { item: 'word', ms: 20000, steps: [{ v: 480, unit: '元' }] })).status, 200)
    const refused = await f.request('/answer', { item: 'word', ms: 20000, steps: [] })
    assert.equal(refused.status, 400); assert.equal((await refused.json()).code, gone ? 'ITEM_NOT_IN_TASK' : 'ALREADY_DONE')
    ui.edit({ input: '480', unit: '元' }); await ui.stepgo()
    assert.ok(f.calls.some(c => c.path === '/state'))
    if (gone) { assert.equal(ui.get().Q, null); assert.equal(ui.get().page, 'quests') }
    else { assert.equal(ui.get().Q.fin.ok, true); assert.equal(ui.get().Q.msg, '') }
    assert.equal(JSON.parse(f.storage.get('kid-draft')).all.word, undefined)
  }
})

test('失败原因可见、重试入口保留填写；401回登录且清掉活动题状态', async t => {
  const f = await fixture(t), { ui } = f
  f.intercept(async path => { if (path === '/answer') return new Response(JSON.stringify({ error: '模拟提交失败', code: 'INVALID_ANSWER' }), { status: 400 }); throw new Error('offline') })
  ui.edit({ input: '480', unit: '元' }); await ui.stepgo()
  assert.equal(ui.get().Q.input, '480'); assert.equal(ui.get().Q.unit, '元'); assert.equal(ui.get().Q.pending, '')
  assert.match(ui.html(), /role="alert"/); assert.match(ui.html(), /模拟提交失败/); assert.match(ui.html(), /data-a="recover"/)
  f.intercept(async () => new Response(JSON.stringify({ error: '请先登录' }), { status: 401 }))
  await ui.stepgo(); assert.equal(ui.get().page, 'login'); assert.equal(ui.get().Q, null); assert.equal(ui.get().V, null)
})


test('交卷及恢复状态请求均在20秒超时后解锁；响应体超时和无效JSON不当作成功', async t => {
  const f = await fixture(t), { ui } = f
  const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' })
  f.intercept(async (path, body, send, signal) => {
    if (path === '/answer') return { status: 200, ok: true, json: () => new Promise((resolve, reject) => { if (signal.aborted) reject(abortError()); else signal.addEventListener('abort', () => reject(abortError())) }) }
    return new Promise((resolve, reject) => { if (signal.aborted) reject(abortError()); else signal.addEventListener('abort', () => reject(abortError())) })
  })
  ui.edit({ input: '480', unit: '元' }); const pending = ui.stepgo()
  const expire = async () => {
    for (let i = 0; i < 12 && ![...f.timers.values()].some(t => t.ms === 20000); i++) await Promise.resolve()
    const timer = [...f.timers.values()].find(t => t.ms === 20000)
    assert.ok(timer, '请求应设20秒上限'); timer.fn()
    for (let i = 0; i < 12; i++) await Promise.resolve()
  }
  await expire(); assert.ok(ui.get().Q.pending, '恢复状态也要等待且有独立超时')
  await expire(); await pending
  assert.equal(ui.get().Q.pending, ''); assert.equal(ui.get().Q.input, '480'); assert.equal(ui.get().Q.unit, '元')
  assert.match(ui.get().Q.msg, /等待有点久/); assert.equal(ui.get().V.week, '2026-W44')
  f.intercept(async (path, body, send) => path === '/answer' ? new Response('invalid json', { status: 200 }) : send())
  await ui.stepgo(); assert.match(ui.get().Q.msg, /没有读取完整/); assert.ok(ui.get().V); assert.equal(ui.get().Q.fin, null)
})
