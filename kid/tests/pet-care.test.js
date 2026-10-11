import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'
import { bedtimeMinutes, petRest, needsRest, wornAccessory, GOODS, addDays } from '../../shared/contract.js'

async function fixture(time = '12:00') {
  const data = new Map(), store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }
  const api = createApi(store, { DEV: true, KID_USER: '宝贝', KID_PIN: '1234', SYNC_TOKEN: 'test' })
  let cookie = ''
  const call = async (path, body) => {
    const r = await api(new Request(`http://local/api/kid${path}`, { method: body ? 'POST' : 'GET', headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }))
    assert.equal(r.status, 200)
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0]
    return r.json()
  }
  const clock = (time, date = '2026-10-11') => call('/dev/clock', { date, time })
  await clock(time); await call('/login', { name: '宝贝', pin: '1234' }); await call('/state')
  const s = data.get('state')
  Object.assign(s, { hatched: true, name: '团团', kid: '小禾', greet: '2026-10-11', coins: 3000, own: { scarf: true, bow: true, hat: true }, toy: { ball: 4 }, gift: { date: '2026-10-11', what: null } })
  return { data, call, clock, act: body => call('/act', body) }
}

test('入睡时间在 20:30–21:30 内，同一账号同一天稳定，不同日期有变化', () => {
  const times = Array.from({ length: 90 }, (_, i) => bedtimeMinutes(addDays('2026-10-01', i), 'kid-a'))
  assert.ok(times.every(t => t >= 1230 && t <= 1290)); assert.ok(new Set(times).size > 30)
  assert.equal(bedtimeMinutes('2026-10-11', 'kid-a'), bedtimeMinutes('2026-10-11', 'kid-a'))
  assert.notDeepEqual(times, Array.from({ length: 90 }, (_, i) => bedtimeMinutes(addDays('2026-10-01', i), 'kid-b')))
})
test('北京时间睡眠边界、跨午夜和 07:00 醒来', () => {
  const b = bedtimeMinutes('2026-10-11'), ms = Date.parse('2026-10-11T00:00:00+08:00') + b * 60000
  assert.equal(petRest(ms - 1).sleeping, false); assert.equal(petRest(ms).sleeping, true)
  assert.equal(petRest(Date.parse('2026-10-12T06:59:59+08:00')).night, '2026-10-11')
  assert.equal(petRest(Date.parse('2026-10-12T06:59:59+08:00')).sleeping, true)
  assert.equal(petRest(Date.parse('2026-10-12T07:00:00+08:00')).sleeping, false)
})
test('三项必须都低于 30；任一项恢复到 30 即退出', () => {
  assert.equal(needsRest({ full: 29, mood: 29, clean: 29 }), true)
  for (const k of ['full', 'mood', 'clean']) assert.equal(needsRest({ full: 29, mood: 29, clean: 29, [k]: 30 }), false)
})
test('夜间互动每种每晚只奖励一次，重复和午夜后不会重复奖励', async () => {
  const f = await fixture('22:00')
  let r = await f.act({ kind: 'quiet', k: 'blanket' }); assert.equal(r.act, 'sleep'); assert.match(r.msg, /心情 ＋3/)
  r = await f.act({ kind: 'quiet', k: 'blanket' }); assert.doesNotMatch(r.msg, /心情 ＋3/)
  r = await f.act({ kind: 'quiet', k: 'hum' }); assert.match(r.msg, /心情 ＋3/)
  r = await f.act({ kind: 'pat' }); assert.match(r.msg, /心情 ＋3/)
  await f.clock('00:30', '2026-10-12'); r = await f.act({ kind: 'quiet', k: 'pat' }); assert.doesNotMatch(r.msg, /心情 ＋3/)
  await f.clock('22:00', '2026-10-12'); r = await f.act({ kind: 'quiet', k: 'pat' }); assert.match(r.msg, /心情 ＋3/)
})
test('睡着后活跃互动不消耗库存、不扣金币、不增加户外记录', async () => {
  const f = await fixture('22:00'), before = structuredClone(f.data.get('state'))
  for (const kind of ['food', 'soap', 'toy', 'trip', 'hide', 'cup', 'event']) {
    const r = await f.act({ kind, k: kind === 'toy' ? 'ball' : 'yard' }); assert.equal(r.act, 'sleep')
  }
  const after = f.data.get('state'); assert.deepEqual(after.bag, before.bag); assert.deepEqual(after.toy, before.toy); assert.equal(after.coins, before.coins); assert.equal(after.trip, before.trip)
})
test('白天夜间动作无奖励；三低状态喂食回应温和，数值照常恢复', async () => {
  const f = await fixture(), s = f.data.get('state'); Object.assign(s.needs, { full: 25, mood: 25, clean: 25 })
  let r = await f.act({ kind: 'quiet', k: 'hum' }); assert.doesNotMatch(r.msg, /心情 ＋3/)
  r = await f.act({ kind: 'food', k: 'rice' }); assert.match(r.msg, /慢慢恢复精神/); assert.equal(r.view.state.bag.rice, 0); assert.ok(r.view.state.needs.full >= 59); assert.equal(needsRest(r.view.state.needs), false)
})
test('三低状态夜间回应不催促立即喂食洗澡', async () => {
  const f = await fixture('22:00'); Object.assign(f.data.get('state').needs, { full: 25, mood: 25, clean: 25 })
  const r = await f.act({ kind: 'quiet', k: 'hum' }); assert.match(r.msg, /醒来再吃一点/); assert.doesNotMatch(r.msg, /难过|不理|饿坏|赶快/)
})
test('旧存档穿戴兼容，可以换领结、摘下并保留购买记录', async () => {
  const f = await fixture(); assert.equal(wornAccessory(f.data.get('state'), 'neck'), 'scarf')
  let r = await f.act({ kind: 'equip', k: 'bow' }); assert.equal(wornAccessory(r.view.state, 'neck'), 'bow'); assert.equal(r.view.state.own.scarf, true)
  r = await f.act({ kind: 'equip', k: 'bow', off: true }); assert.equal(wornAccessory(r.view.state, 'neck'), '')
  r = await f.act({ kind: 'equip', k: 'rice' }); assert.match(r.msg, /先在小卖部/)
})
test('重设计保留物品 id、价格和使用次数，购买与库存可正常使用', async () => {
  assert.equal(GOODS.find(x => x.k === 'ball').p, 50); assert.equal(GOODS.find(x => x.k === 'ball').uses, 4)
  const f = await fixture(); let r = await f.act({ kind: 'buy', k: 'ball' }); assert.equal(r.view.state.toy.ball, 8); assert.equal(r.view.state.coins, 2950)
  r = await f.act({ kind: 'toy', k: 'ball' }); assert.equal(r.view.state.toy.ball, 7)
})
