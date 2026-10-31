import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'
import { stageOf, SEASON, NEED_FLOOR } from '../../shared/contract.js'

const oral = (id, group = 'daily') => ({ id, tpl: id, group, format: 'oral', text: '4 + 3', answer: 7, price: 12, kp: '计算', err: '计算失误', level: '综合', bucket: '本周重点' })
async function fixture(t, date = '2026-10-30', pack = null) {
  let time = Date.parse(`${date}T12:00:00+08:00`)
  t.mock.method(Date, 'now', () => time)
  const data = new Map(), api = createApi({ get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }, { DEV: true, KID_USER: '规则测试', KID_PIN: '1234', SYNC_TOKEN: 'rules-test' })
  let cookie = ''
  const call = async (path, body, status = 200) => {
    const response = await api(new Request(`http://local/api/kid${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result
  }
  await call('/login', { name: '规则测试', pin: '1234' }); await call('/state')
  Object.assign(data.get('state'), { hatched: true, name: '团团', kid: '测试', days: 6, coins: 1000, gift: { date, what: null }, greet: date })
  data.set('pack', pack || { week: '2026-W44', groups: [{ id: 'daily', name: '普通练习', daily: 1 }], items: Array.from({ length: 40 }, (_, i) => oral(`q-${i}`)), tuning: { slow: 0 } })
  const state = () => data.get('state')
  const clock = next => { date = next; time = Date.parse(`${next}T12:00:00+08:00`); const s = state(); s.needs.at = time; s.gift = { date, what: null }; s.greet = date }
  const view = () => call('/state')
  const answer = (id, correct = true, status = 200) => call('/answer', { item: id, ms: 30000, steps: [{ v: correct ? 7 : 8 }] }, status)
  const ordinary = async () => { const v = await view(); for (const g of v.today.filter(x => !x.friday)) for (const it of g.items.filter(x => !x.done)) await answer(it.id) }
  return { data, call, state, clock, view, answer, ordinary, advance: ms => { time += ms } }
}

test('成长天数为 6 / 16 / 25，仍受开放日期限制，旧存档不降级', () => {
  for (const [days, expected] of [[5, 1], [6, 2], [15, 2], [16, 3], [24, 3], [25, 4]]) assert.equal(stageOf({ hatched: true, days }, '2026-12-26'), expected)
  for (const [date, expected] of [['2026-10-23', 1], ['2026-10-24', 2], ['2026-11-20', 2], ['2026-11-21', 3], ['2026-12-25', 3], ['2026-12-26', 4]]) assert.equal(stageOf({ hatched: true, days: 25 }, date), expected)
  assert.equal(stageOf({ hatched: true, days: 0, minStage: 4 }, '2026-12-26'), 4)
})

test('周五失败后当天不能再打，周六可重试；本周通关后周日或换题库也不重开', async t => {
  const f = await fixture(t)
  for (const [date, win] of [['2026-10-30', false], ['2026-10-31', true]]) {
    f.clock(date); await f.ordinary()
    const v = await f.view(), g = v.today.find(g => g.friday)
    assert.equal(g.items.filter(x => !x.done).length, 4)
    let result
    for (const it of g.items) result = (await f.answer(it.id, win)).fin.boss || result
    assert.equal(result.pass, win)
    const after = await f.view(), copy = structuredClone(f.state().chal)
    assert.ok(!after.today.find(g => g.friday)?.items.some(x => !x.done))
    await f.answer(g.items[0].id, win, 400)
    assert.deepEqual(f.state().chal, copy)
  }
  f.clock('2026-11-01'); assert.ok(!(await f.view()).today.find(g => g.friday)?.items.some(x => !x.done))
  const story = f.state().story, coins = f.state().coins
  f.data.set('pack', { ...f.data.get('pack'), items: Array.from({ length: 40 }, (_, i) => oral(`replacement-${i}`)) })
  const replaced = await f.view()
  assert.ok(!replaced.today.find(g => g.friday)?.items.some(x => !x.done)); assert.equal(f.state().story, story); assert.equal(f.state().coins, coins)
  f.clock('2026-11-06'); await f.ordinary(); assert.equal((await f.view()).today.find(g => g.friday).items.filter(x => !x.done).length, 4)
})

test('未完成挑战跨日接着做，结算日占当天次数，失败后下一天才重试', async t => {
  const f = await fixture(t); await f.ordinary()
  const fri = (await f.view()).today.find(g => g.friday), ids = fri.items.map(it => it.id)
  await f.answer(ids[0], false)
  f.clock('2026-10-31'); await f.ordinary()
  const sat = (await f.view()).today.find(g => g.friday)
  assert.deepEqual(sat.items.map(it => it.id), ids); assert.ok(sat.items[0].done)
  for (const id of ids.slice(1)) await f.answer(id, false)
  assert.equal(f.state().chal.result.pass, false)
  assert.ok(!(await f.view()).today.find(g => g.friday)?.items.some(it => !it.done))
  f.clock('2026-11-01'); await f.ordinary()
  const sun = (await f.view()).today.find(g => g.friday)
  assert.equal(sun.items.filter(it => !it.done).length, 4)
  assert.notDeepEqual(sun.items.map(it => it.id), ids)
})

test('挑战中途换题库保留已答成绩，只补未答题；旧题和通关奖励都不重复发放', async t => {
  const f = await fixture(t); await f.ordinary()
  const original = (await f.view()).today.find(g => g.friday).items.map(it => it.id), done = original[0]
  await f.answer(done); const coins = f.state().coins
  f.data.set('pack', { ...f.data.get('pack'), week: '2026-W45', items: Array.from({ length: 40 }, (_, i) => oral(`new-${i}`)) })
  const refreshed = await f.view(), pending = refreshed.today.find(g => g.friday).items.filter(it => !it.done)
  assert.equal(pending.length, 3); assert.equal(f.state().chal.recs[done].ok, true); assert.equal(f.state().coins, coins)
  assert.ok(pending.every(it => it.id.startsWith('new-')))
  await f.answer(done, true, 400); assert.equal(f.state().coins, coins)
  await f.ordinary(); const before = f.state().coins
  let sum = 0, result
  for (const [i, it] of pending.entries()) { const { fin } = await f.answer(it.id, i !== 2); sum += fin.c; result = fin.boss || result }
  assert.equal(result.okN, 3); assert.equal(result.pass, true); assert.equal(f.state().coins, before + sum + result.coins)
  const log = [...(f.data.get('log:2026-W44') || []), ...(f.data.get('log:2026-W45') || [])]
  assert.equal(log.filter(r => r.item === done).length, 1)
  const paid = f.state().coins; await f.answer(pending.at(-1).id, false, 400); await f.view(); assert.equal(f.state().coins, paid)
})

test('换包后替补不足时安全缩减并结算，已答旧题移出新包也不卡住、不重复领金币', async t => {
  for (const [count, firstOk] of [[3, true], [1, true], [1, false]]) {
    const f = await fixture(t); await f.ordinary()
    const old = (await f.view()).today.find(g => g.friday).items[0].id
    await f.answer(old, firstOk); const before = f.state().coins
    f.data.set('pack', { ...f.data.get('pack'), week: '2026-W45', items: Array.from({ length: count }, (_, i) => oral(`small-${i}`)) })
    const v = await f.view(), pending = v.today.find(g => g.friday)?.items.filter(it => !it.done) || []
    assert.ok(f.state().chal.items.every(id => f.state().chal.recs[id] || f.data.get('pack').items.some(it => it.id === id)))
    if (count === 3) {
      assert.equal(pending.length, 2); assert.equal(f.state().chal.items.length, 3); assert.equal(f.state().coins, before)
      await f.ordinary(); const base = f.state().coins; let rewards = 0, result
      for (const it of pending) { const { fin } = await f.answer(it.id); rewards += fin.c; result = fin.boss || result }
      assert.equal(result.pass, true); assert.equal(f.state().coins, base + rewards + result.coins)
    } else {
      assert.equal(f.state().chal.items.length, 1); assert.equal(f.state().chal.done, true); assert.equal(f.state().chal.result.pass, firstOk)
      assert.equal(f.state().coins, before + f.state().chal.result.coins)
    }
    const paid = f.state().coins; await f.view(); await f.view(); assert.equal(f.state().coins, paid)
    assert.ok(!(await f.view()).today.find(g => g.friday)?.items.some(it => !it.done))
    await f.answer(old, firstOk, 400); assert.equal(f.state().coins, paid)
    const logs = [...(f.data.get('log:2026-W44') || []), ...(f.data.get('log:2026-W45') || [])]
    assert.equal(logs.filter(r => r.item === old).length, 1)
  }
})

const plan = {
  ...oral('plan-1'), format: 'plan', text: '有4个红球和3个蓝球，一共有几个？', answer: 7, ask: '一共有', unit: '个', units: ['个'], tail: '',
  goals: [{ t: '一共有几个球', ok: true }], choices: [{ t: '4 + 3', ok: true }], traps: [],
  segs: [{ t: '4个红球', k: 2 }, { t: '3个蓝球', k: 2 }, { t: '一共有几个', k: 2 }, { t: '今天晴天', n: true }, { t: '操场很大', n: true }, { t: '书包是绿色', n: true }],
}
const planPack = { week: '2026-W44', groups: [{ id: 'daily', name: '应用题', daily: 1 }], items: [plan], tuning: { slow: 0 } }
test('无关词圈 3 处起只取消过程奖；2 处边界、基础奖励和漏核心处罚保持独立', async t => {
  for (const [extra, missing, bonus, penalty] of [[0, false, 2, 0], [2, false, 2, 0], [3, false, 0, 0], [3, true, 0, 3]]) {
    const f = await fixture(t, '2026-10-29', structuredClone(planPack)), before = f.state().coins
    if (extra === 0) Object.assign(f.state().needs, { full: 0, mood: 0, clean: 80 })
    await f.view()
    const sel = [...(missing ? [1, 2] : [0, 1, 2]), ...[3, 4, 5].slice(0, extra)]
    const first = await f.call('/act', { kind: 'circle', item: plan.id, sel })
    if (missing) f.advance(5000)
    const { fin } = await f.call('/answer', { item: plan.id, ms: 30000, steps: [{ sel }, { i: 0 }, { i: 0 }, { lines: [{ k: 1, v: 7 }] }, { v: 7, unit: '个' }] })
    assert.equal(first.circle.extra.length, extra); assert.equal(fin.ok, true); assert.equal(fin.extraKeywords, extra); assert.equal(fin.processDenied, extra >= 3)
    assert.equal(fin.pb, bonus); assert.equal(fin.keywordPenalty, penalty); assert.equal(fin.c, 12 + bonus - penalty); assert.equal(f.state().coins, before + fin.c)
    if (extra === 0) assert.ok(f.state().away, '出走中也能圈词、交卷赚钱')
  }
})

test('两项归零才出走，找回费用 300 / 320 / 340 且幂等；出走中能做题赚钱和买东西', async t => {
  const f = await fixture(t, '2026-10-29'); assert.equal(NEED_FLOOR, 0)
  Object.assign(f.state().needs, { full: 0, mood: 1, clean: 80 })
  assert.ok(!(await f.view()).state.away)
  Object.assign(f.state().needs, { full: 0, mood: 0, clean: 80 }); f.state().coins = 100
  let v = await f.view(); assert.equal(v.state.away.cost, 300); assert.equal(v.state.away.count, 1); assert.equal(v.state.escapeCount, 1)
  assert.deepEqual((await f.view()).state.away, v.state.away)
  const blocked = await f.call('/act', { kind: 'findPet' }); assert.equal(blocked.view.state.coins, 100); assert.equal(blocked.view.state.away.cost, 300)
  f.state().toy.ball = 4
  const bag = structuredClone(f.state().bag), needs = structuredClone(f.state().needs)
  for (const body of [{ kind: 'food', k: 'rice' }, { kind: 'soap' }, { kind: 'pat' }, { kind: 'toy', k: 'ball' }, { kind: 'trip', k: 'yard' }]) {
    const r = await f.call('/act', body); assert.ok(r.view.state.away); assert.deepEqual(r.view.state.bag, bag); assert.equal(r.view.state.coins, 100); assert.deepEqual(r.view.state.needs, needs); assert.equal(r.view.state.toy.ball, 4)
  }
  const ordinary = (await f.view()).today.find(g => !g.friday).items[0]
  const earned = await f.answer(ordinary.id); assert.ok(earned.fin.c > 0); assert.ok(earned.view.state.away)
  const bought = await f.call('/act', { kind: 'buy', k: 'cookie' }); assert.equal(bought.view.state.bag.cookie, (bag.cookie || 0) + 1); assert.ok(bought.view.state.away)
  for (const [count, cost] of [[1, 300], [2, 320], [3, 340]]) {
    if (count > 1) Object.assign(f.state().needs, { full: 0, mood: 0, clean: 20 })
    f.state().coins = cost + 7; v = await f.view(); assert.equal(v.state.away.count, count); assert.equal(v.state.away.cost, cost)
    const found = await f.call('/act', { kind: 'findPet' }); assert.equal(found.view.state.coins, 7); assert.ok(!found.view.state.away); assert.equal(found.view.state.escapeCount, count)
    assert.ok(['full', 'mood', 'clean'].every(k => found.view.state.needs[k] >= 50))
    const repeated = await f.call('/act', { kind: 'findPet' }); assert.equal(repeated.view.state.coins, 7); assert.equal(repeated.view.state.escapeCount, count); assert.ok(!repeated.view.state.away)
  }
  f.state().season = '旧学期'
  const nextSeason = await f.view(); assert.equal(nextSeason.state.escapeCount, 3); assert.equal(nextSeason.state.hatched, false); assert.ok(!nextSeason.state.away)
  f.state().hatched = true; f.state().coins = 400; Object.assign(f.state().needs, { full: 0, clean: 0, mood: 60 })
  assert.equal((await f.view()).state.away.cost, 360)
})

test('自然衰减最低到 0；未孵化不出走，长期闲置后首题醒来仍能留在小屋', async t => {
  const f = await fixture(t, '2026-10-29')
  Object.assign(f.state().needs, { full: 1, mood: 1, clean: 80, at: Date.now() - 2 * 86400000 })
  const decayed = await f.view(); assert.equal(decayed.state.needs.full, 0); assert.equal(decayed.state.needs.mood, 0); assert.ok(decayed.state.away)
  const g = await fixture(t, '2026-10-29'); Object.assign(g.state(), { hatched: false, escapeCount: 0, away: null }); Object.assign(g.state().needs, { full: 0, mood: 0, clean: 0 })
  const before = await g.view(); assert.ok(!before.state.away)
  const id = before.today.find(x => !x.friday).items[0].id
  const wake = await g.answer(id); assert.equal(wake.view.state.hatched, true); assert.ok(!wake.view.state.away)
  assert.ok(!(await g.view()).state.away); assert.equal(g.state().escapeCount, 0)
})
