import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'
import { buildPack, checkPack, instantiate } from '../../shared/contract.js'

const DATE = '2026-10-24', WEEK = '2026-W43'
const base = { group: 'g1', level: '同构', knowledge_point: '04.2 长度单位', error_type: '概念不清' }
const TEMPLATES = [
  { ...base, id: 'read', format: 'multi', text: '读一读，铅笔长多少？', slots: { cm: [3, 9], mm: [1, 9], f: [1, 2] }, fig: { kind: 'ruler', from: '{f}*10', to: '{f}*10+{cm}*10+{mm}', obj: 'pencil' }, blanks: [{ t: '长 □ 厘米 □ 毫米', e: ['{cm}', '{mm}'] }] },
  { ...base, id: 'draw', format: 'draw', text: '画一条 {cm} 厘米 {mm} 毫米的线段', slots: { cm: [2, 9], mm: [1, 9] }, len: '{cm}*10+{mm}' },
  { ...base, id: 'cmp', format: 'choice', mode: 'compare', slots: { k: [2, 40] }, compare: { l: '{k} 千米', r: '{k}000 米', lv: '{k}*1000', rv: '{k}000' } },
  { ...base, id: 'one', format: 'choice', mode: 'one', text: '量一支铅笔的长度，用什么单位合适？', opts: [{ t: '厘米', ok: 1 }, { t: '千米', say: '千米太大了' }, { t: '米' }] },
  { ...base, id: 'many', format: 'choice', mode: 'multi', text: '选出所有比 1 米短的', opts: [{ t: '课桌高', ok: 1 }, { t: '操场长', say: '操场有几十米' }, { t: '铅笔', ok: 1 }, { t: '教室长' }] },
  { ...base, id: 'sort', format: 'bins', mode: 'sort', nums: { n: 10, min: 14, max: 30, dec: 1, edge: 3 }, bins: [{ t: '低于 18.5', hi: 18.4 }, { t: '18.5～23.9', lo: 18.5, hi: 23.9 }, { t: '24.0 及以上', lo: 24 }] },
  { ...base, id: 'count', format: 'bins', mode: 'count', nums: { n: 12, min: 120, max: 160, dec: 0, edge: 2 }, bins: [{ t: '120～129', lo: 120, hi: 129 }, { t: '130～139', lo: 130, hi: 139 }, { t: '140 及以上', lo: 140 }] },
]

test('新题型：模板生成的题库包通过检查，小数 / 端点 / 选项乱序都符合约定', () => {
  const { pack, report } = buildPack({ groups: [{ id: 'g1', name: '新题型', bucket: '本周重点' }], templates: TEMPLATES, tuning: {} }, WEEK)
  assert.deepEqual(checkPack(pack), [])
  for (const r of report) if (!['one', 'many'].includes(r.id)) assert.ok(r.made >= 20, `${r.id} 只出了 ${r.made} 道`)
  const sort = pack.items.filter(it => it.tpl === 'sort')
  for (const it of sort) {
    assert.equal(it.nums.length, 10); assert.ok(it.nums.every(x => /^\d+\.\d$/.test(x)))
    assert.ok(it.nums.filter(x => ['18.4', '18.5', '23.9', '24.0'].includes(x)).length >= 2, '端点的数要出现')
    it.nums.forEach((x, j) => assert.equal(it.binOf[j], +x <= 18.4 ? 0 : +x <= 23.9 ? 1 : 2))
  }
  const cmp = pack.items.filter(it => it.tpl === 'cmp')
  assert.ok(cmp.every(it => it.opts.map(o => o.t).join('') === '＞＜＝' && it.opts[it.answer].t === '＝'))
  const bad = instantiate({ ...TEMPLATES[5], bins: [{ t: 'a', hi: 18 }, { t: 'b', lo: 24 }] }, { id: 'g1' }, WEEK, 0, 30)
  assert.ok(Object.keys(bad.problems).some(k => k.includes('落不进')))
  const svg = instantiate({ ...TEMPLATES[3], opts: [{ t: 'a', ok: 1, svg: '<svg onload="x()"></svg>' }, { t: 'b' }] }, { id: 'g1' }, WEEK, 0, 3)
  assert.equal(svg.items.length, 0)
})

async function fixture(t) {
  t.mock.method(Date, 'now', () => Date.parse(`${DATE}T12:00:00+08:00`))
  const { pack } = buildPack({ groups: [{ id: 'g1', name: '新题型', bucket: '本周重点', daily: 14 }], templates: TEMPLATES, tuning: {} }, WEEK)
  pack.tuning.daily_total = 40
  const data = new Map(), store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }
  data.set('pack', pack)
  const api = createApi(store, { DEV: true, KID_USER: '甲', KID_PIN: '1234', ADMIN_PIN: '5678', SYNC_TOKEN: 'fixture-only' })
  const call = async (path, body, cookie, status = 200) => {
    const res = await api(new Request(`http://local/api/kid${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie: cookie || '', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))
    const out = await res.json(); assert.equal(res.status, status, `${path}: ${JSON.stringify(out)}`)
    return { out, res }
  }
  const cookie = (await call('/login', { name: '甲', pin: '1234' })).res.headers.get('set-cookie').split(';')[0]
  await call('/state', undefined, cookie)
  Object.assign(data.get('state'), { hatched: true, gift: { date: DATE, what: null }, greet: DATE })
  const state = (await call('/state', undefined, cookie)).out
  const todayIds = state.today.flatMap(g => g.items.map(it => it.id))
  const server = tpl => { const it = pack.items.find(x => x.tpl === tpl && todayIds.includes(x.id)); assert.ok(it, `今天的题里没有 ${tpl}`); return it }
  const publicOf = id => state.today.flatMap(g => g.items).find(x => x.id === id)
  return { server, publicOf, state, answer: async (it, steps) => (await call('/answer', { item: it.id, ms: 20000, steps }, cookie)).out.fin }
}

test('新题型：发给页面的题目里没有答案', async t => {
  const f = await fixture(t)
  const text = JSON.stringify(f.state.today)
  assert.ok(!text.includes('binOf') && !text.includes('"ok":1') && !text.includes('"say"'), '页面拿到的题目不能带答案或提示')
  const one = f.publicOf(f.server('one').id)
  assert.equal(one.flow[0].type, 'choose'); assert.ok(one.flow[0].opts.every(o => Object.keys(o).join() === 't'))
})

test('尺子读数和画线段：对 / 错 / 没从 0 开始 / 差整厘米 / 差几毫米 / 没画', async t => {
  const f = await fixture(t)
  const r = f.server('read'), [cm, mm] = r.blanks[0].a
  assert.ok(r.fig.from > 0)
  assert.equal((await f.answer(r, [{ vals: [cm, mm] }])).ok, true)
  const r2 = f.server('read'); assert.equal(r2.id, r.id)
  const d = f.server('draw'), good = d.answer
  assert.equal((await f.answer(d, [{ mm: good }])).ok, true)
})

test('尺子读数：把终点读数当长度，得到专门的提示', async t => {
  const f = await fixture(t)
  const r = f.server('read'), to = r.fig.to
  const fin = await f.answer(r, [{ vals: [Math.floor(to / 10), to % 10] }])
  assert.equal(fin.ok, false)
  assert.ok(fin.items.some(x => x.msg.includes('没有从 0 开始')), JSON.stringify(fin.items))
})

test('画线段：差整厘米、差毫米、没画都不算对，提示说得清楚', async t => {
  const cases = [[d => d.answer + 10, '整厘米数错了 1 厘米'], [d => d.answer + 3, '毫米差了 3 毫米'], [d => d.from, '线段还没画'], [() => null, '线段还没画']]
  for (const [wrong, msg] of cases) {
    const f = await fixture(t), d = f.server('draw'), fin = await f.answer(d, [{ mm: wrong(d) }])
    assert.equal(fin.ok, false); assert.ok(fin.items.some(x => x.msg.includes(msg)), `${msg}：${JSON.stringify(fin.items)}`)
  }
})

test('选择题和比大小：单选、多选（漏选 / 多选）、＞＜＝', async t => {
  const f = await fixture(t)
  const one = f.server('one'), right = one.opts.findIndex(o => o.ok), wrong = one.opts.findIndex(o => o.say)
  assert.equal(right, one.answer)
  const bad = await f.answer(one, [{ i: wrong }])
  assert.equal(bad.ok, false); assert.ok(bad.items.some(x => x.msg.includes('千米太大了')))
  const f2 = await fixture(t), one2 = f2.server('one'); assert.equal((await f2.answer(one2, [{ i: one2.answer }])).ok, true)
  const many = f.server('many'), ok = many.opts.flatMap((o, k) => o.ok ? [k] : []), over = many.opts.findIndex(o => o.say)
  const f3 = await fixture(t), m3 = f3.server('many'); assert.equal((await f3.answer(m3, [{ sel: ok }])).ok, true)
  const f4 = await fixture(t), m4 = f4.server('many'), fin4 = await f4.answer(m4, [{ sel: [...ok, over] }])
  assert.equal(fin4.ok, false); assert.ok(fin4.items.some(x => x.msg.includes('多选了「操场长」：操场有几十米')))
  const f5 = await fixture(t), m5 = f5.server('many'), fin5 = await f5.answer(m5, [{ sel: [ok[0]] }])
  assert.equal(fin5.ok, false); assert.ok(fin5.items.some(x => x.msg.includes('漏选了')))
  const f6 = await fixture(t), c = f6.server('cmp'), fin6 = await f6.answer(c, [{ i: c.opts.findIndex(o => !o.ok) }])
  assert.equal(fin6.ok, false); assert.ok(fin6.items.some(x => x.msg.includes('应该是 ＝')))
  const f7 = await fixture(t), c7 = f7.server('cmp'); assert.equal((await f7.answer(c7, [{ i: c7.answer }])).ok, true)
})

test('分段分类：放对 / 放错 / 漏放；数一数模式按栏填个数', async t => {
  const f = await fixture(t), s = f.server('sort')
  assert.equal((await f.answer(s, [{ put: s.binOf }])).ok, true)
  const f2 = await fixture(t), s2 = f2.server('sort'), put = [...s2.binOf]; put[0] = (put[0] + 1) % 3; put[1] = -1
  const fin = await f2.answer(s2, [{ put }])
  assert.equal(fin.ok, false)
  assert.ok(fin.items.some(x => x.msg.includes('应该放在')) && fin.items.some(x => x.msg.includes('没放进栏里')), JSON.stringify(fin.items))
  const f3 = await fixture(t), c = f3.server('count'); assert.equal((await f3.answer(c, [{ vals: c.blanks.map(b => b.a) }])).ok, true)
  const f4 = await fixture(t), c4 = f4.server('count'), vals = c4.blanks.map(b => b.a); vals[1] += 1
  assert.equal((await f4.answer(c4, [{ vals }])).ok, false)
})
