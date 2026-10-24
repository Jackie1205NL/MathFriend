import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'
import { buildPack } from '../../shared/contract.js'

const DATE = '2026-10-24', WEEK = '2026-W43'
const base = { group: 'g1', level: '综合', knowledge_point: 'EX.01', error_type: '策略缺失' }
const TEMPLATES = [
  { ...base, id: 'plan', format: 'plan', slots: { per: [3, 9], g: [4, 10], n: '={g}*3', pay: '={g}*2', total: '={g}*2*{per}' },
    text: '水果店的橙子买两个送一个。爸爸拿了 {n} 个橙子，一共付了 {total} 元。一个橙子多少元？',
    segs: [{ t: '水果店的橙子' }, { t: '买两个送一个。', k: 2 }, { t: '爸爸拿了' }, { t: ' {n} 个橙子，', k: 2 }, { t: '一共付了 {total} 元。', k: 2 }, { t: '一个橙子', k: 1 }, { t: '多少元？', k: 2 }],
    goals: [{ t: '实际付了几个橙子的钱', ok: 1 }, { t: '一共拿了几个橙子' }, { t: '送了几个橙子' }],
    choices: [{ e: '{total}÷({n}÷3×2)', ok: 1 }, { e: '{total}÷{n}' }, { e: '{total}÷({n}÷2)' }], ask: '答：一个橙子', unit: '元', units: ['元', '个'], hint: '三个一组。', explain: '先算组数。' },
  { ...base, id: 'multi', format: 'multistep', slots: { a: [32, 49], n: [2, 4] }, text: '图书馆上午借出 {a} 本书，下午借出的是上午的 {n} 倍。这一天一共借出多少本书？',
    segs: [{ t: '图书馆' }, { t: '上午借出', k: 1 }, { t: ' {a} 本书，', k: 2 }, { t: '下午', k: 1 }, { t: '借出的是' }, { t: '上午的 {n} 倍。', k: 2 }, { t: '这' }, { t: '一天一共', k: 2 }, { t: '借出' }, { t: '多少本书？', k: 2 }],
    goals: [{ t: '下午借出多少本', ok: 1 }, { t: '一共借出多少本' }, { t: '上午比下午少借多少本' }],
    steps: [{ ask: '下午借出多少本', e: '{a}*{n}', pre: '下午借出', unit: '本', units: ['本', '倍'] }, { ask: '一共借出多少本', e: '{a}+{s1}', pre: '一共借出', unit: '本', units: ['本', '倍'] }],
    ask: '答：这一天一共借出', hint: '先求下午。', explain: '先算下午。' },
]

async function fixture(t) {
  t.mock.method(Date, 'now', () => Date.parse(`${DATE}T12:00:00+08:00`))
  const { pack } = buildPack({ groups: [{ id: 'g1', name: '应用题', bucket: '本周重点', daily: 14 }], templates: TEMPLATES, tuning: {} }, WEEK)
  const data = new Map(), store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }
  data.set('pack', pack)
  const api = createApi(store, { DEV: true, KID_USER: '甲', KID_PIN: '1234', ADMIN_PIN: '5678', SYNC_TOKEN: 'fixture-only' })
  const call = async (path, body, cookie, status = 200) => {
    const res = await api(new Request(`http://local/api/kid${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie: cookie || '', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))
    const out = await res.json(); assert.equal(res.status, status, `${path}: ${JSON.stringify(out)}`)
    return out
  }
  const cookie = (await (async () => { const res = await api(new Request('http://local/api/kid/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '甲', pin: '1234' }) })); return res.headers.get('set-cookie').split(';')[0] })())
  await call('/state', undefined, cookie)
  Object.assign(data.get('state'), { hatched: true, gift: { date: DATE, what: null }, greet: DATE })
  const state = await call('/state', undefined, cookie)
  const snap = new Map([...data].map(([k, v]) => [k, structuredClone(v)]))
  // 每次从同一份存档开始：先把圈关键词做掉（全圈），再交这一题
  const answer = async (it, steps) => {
    data.clear(); for (const [k, v] of snap) data.set(k, structuredClone(v))
    await call('/act', { kind: 'circle', item: it.id, sel: it.segs.map((_, j) => j) }, cookie)
    return call('/answer', { item: it.id, ms: 20000, steps }, cookie)
  }
  return { state, data, answer, items: state.today.flatMap(g => g.items) }
}
const stepsAt = (it, at, step) => it.flow.map((_, j) => (j === at ? step : {}))

test('选项打乱以后，页面上点第几个，后端就按第几个判（先求什么、选算式）', async t => {
  const f = await fixture(t)
  let n = 0
  for (const it of f.items) for (const [type, key] of [['goal', 'opts'], ['build', 'choices']]) {
    const at = it.flow.findIndex(b => b.type === type && b[key]); if (at < 0) continue
    for (let k = 0; k < it.flow[at][key].length; k++) {
      const out = await f.answer(it, stepsAt(it, at, { i: k }))
      const msg = out.fin.items.find(x => x.i === at).msg.replace(/\s/g, '')
      assert.ok(msg.includes(it.flow[at][key][k].replace(/\s/g, '')), `${it.id} ${type} 第 ${k + 1} 个「${it.flow[at][key][k]}」被判成：${msg}`)
      n++
    }
  }
  assert.ok(n >= 18, `只检查了 ${n} 个选项`)
})

test('页面发来第几个和点的字对不上时，以点的字为准，并在记录里留下 idx_fix', async t => {
  const f = await fixture(t)
  const it = f.items.find(x => x.flow.some(b => b.type === 'goal')), at = it.flow.findIndex(b => b.type === 'goal')
  const opts = it.flow[at].opts, right = opts.findIndex(o => f.data.get('pack').items.find(x => x.id === it.id).goals.find(g => g.t === o).ok)
  const wrong = opts.findIndex((_, k) => k !== right)
  // 页面（旧的、没刷新的）说点的是第 wrong 个，但那个按钮上写的是正确的选项
  const out = await f.answer(it, stepsAt(it, at, { i: wrong, t: opts[right] }))
  assert.equal(out.fin.items.find(x => x.i === at).good, 'y')
  assert.equal(f.data.get('log:' + WEEK).at(-1).idx_fix, 1)
  // 字和下标对得上的，照常判
  const same = await f.answer(it, stepsAt(it, at, { i: wrong, t: opts[wrong] }))
  assert.equal(same.fin.items.find(x => x.i === at).good, 'n')
  assert.equal(f.data.get('log:' + WEEK).at(-1).idx_fix, undefined)
})

test('分步应用题选了「先求什么」以后，页面不能把正确的第一步直接写出来', async t => {
  const f = await fixture(t)
  const it = f.items.find(x => x.format === 'multistep'), right = f.data.get('pack').items.find(x => x.id === it.id).goals.find(g => g.ok).t
  const heads = it.flow.filter(b => b.type === 'build').map(b => b.head)
  assert.equal(heads[0], '第一步')
  assert.ok(!JSON.stringify(it.flow.filter(b => b.type !== 'goal')).includes(right), '除了「先求什么」的选项，别处不能出现正确的第一步')
})
