import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'

const DATE = '2026-10-15'
const SEGMENTS = [
  { t: '这些数', k: 2 }, { t: '超过', k: 2 }, { t: '10', k: 2 }, { t: '有几个', k: 2 },
  { t: '请仔细观察', k: 1 }, { t: '今天晴天', n: true },
]
async function fixture(t, price = 12) {
  let time = Date.parse(`${DATE}T12:00:00+08:00`)
  t.mock.method(Date, 'now', () => time)
  const data = new Map(), store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }
  const item = { id: 'count-1', tpl: 'count', group: 'count', format: 'data', kp: '读题', err: '审题', level: '同构', bucket: '本周重点', price, segs: SEGMENTS,
    kind: 'over', over: 10, nums: [9, 10, 11], answer: 1, ask: '符合条件的有', unit: '个', units: ['个'], explain: '11 超过 10。' }
  data.set('pack', { week: '2026-W42', groups: [{ id: 'count', name: '圈出条件', daily: 1 }], items: [item], tuning: { slow: 0 } })
  const api = createApi(store, { DEV: true, KID_USER: '甲', KID_PIN: '1234', ADMIN_PIN: '5678', SYNC_TOKEN: 'fixture-only' })
  const request = async (path, body, cookie = '', status = 200) => {
    const response = await api(new Request(`http://local/api/kid${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))
    const result = await response.json()
    assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`)
    return { result, response }
  }
  const login = async (name, pin) => (await request('/login', { name, pin })).response.headers.get('set-cookie').split(';')[0]
  const childCookie = await login('甲', '1234'), adminCookie = await login('admin', '5678')
  const call = async (path, body, status = 200) => (await request(path, body, childCookie, status)).result
  const admin = async (path, body, status = 200) => (await request(path, body, adminCookie, status)).result
  await call('/state')
  Object.assign(data.get('state'), { hatched: true, gift: { date: DATE, what: null }, greet: DATE })
  return { data, request, login, call, admin, item, advance: ms => { time += ms }, circle: sel => call('/act', { kind: 'circle', item: item.id, sel }),
    answer: (sel = [0, 1, 2, 3, 4], status = 200) => call('/answer', { item: item.id, ms: 30000, steps: [{ sel }, { sel: [2], v: 1, unit: '个' }] }, status)  }
}

test('首次圈选固定，漏圈等待恰为 5 秒；刷新与重复点评保留原选择和截止时间', async t => {
  const f = await fixture(t)
  await f.answer(undefined, 409)
  const first = (await f.circle([0, 1, 2, 2, -1, 99])).circle
  assert.deepEqual(first.sel, [0, 1, 2]); assert.equal(first.penalty, 3)
  assert.equal(first.readyAt, Date.now() + 5000)
  f.advance(1000)
  const repeated = (await f.circle([0, 1, 2, 3, 4])).circle
  assert.deepEqual(repeated, first)
  const refreshed = (await f.call('/state')).today[0].items[0].circle
  assert.deepEqual(refreshed, first)
  f.advance(3999); await f.answer(undefined, 409)
  f.advance(1)
  const result = await f.answer()
  assert.equal(result.fin.keywordPenalty, 3); assert.equal(result.fin.c, 9)
  assert.deepEqual(f.data.get(`day:${DATE}`).items[f.item.id].circle, [0, 1, 2])
})

test('漏 1/2/3/4 个核心词扣 3/4/5/5 金币，余额和流水只记实际奖励；重复交卷不再扣分', async t => {
  for (const [missing, penalty] of [[1, 3], [2, 4], [3, 5], [4, 5]]) {
    const f = await fixture(t), before = f.data.get('state').coins
    const review = await f.circle([0, 1, 2, 3].slice(missing))
    assert.equal(review.circle.penalty, penalty)
    f.advance(5000)
    const { fin } = await f.answer()
    assert.equal(fin.ok, true); assert.equal(fin.keywordPenalty, penalty); assert.equal(fin.penaltyApplied, penalty); assert.equal(fin.c, 12 - penalty)
    assert.equal(f.data.get('state').coins, before + fin.c)
    const log = f.data.get('log:2026-W42')
    assert.equal(log.length, 1); assert.equal(log[0].coins, fin.c); assert.equal(log[0].keyword_penalty, penalty); assert.equal(log[0].penalty_applied, penalty)
    await f.answer(undefined, 400)
    assert.equal(f.data.get('state').coins, before + fin.c); assert.equal(f.data.get('log:2026-W42').length, 1)
  }
})

test('奖励不足时最低为 0，不扣已有金币；只漏辅助词或多圈干扰句不触发扣分等待', async t => {
  const f = await fixture(t, 2), before = f.data.get('state').coins
  await f.circle([]); f.advance(5000)
  const { fin } = await f.answer()
  assert.equal(fin.keywordPenalty, 5); assert.equal(fin.penaltyApplied, 2); assert.equal(fin.c, 0); assert.equal(fin.core, 0)
  assert.equal(f.data.get('state').coins, before)
  for (const sel of [[0, 1, 2, 3], [0, 1, 2, 3, 4, 5]]) {
    const g = await fixture(t), review = (await g.circle(sel)).circle
    assert.equal(review.penalty, 0); assert.equal(review.readyAt, 0)
    assert.equal((await g.answer()).fin.c, 12)
  }
})
