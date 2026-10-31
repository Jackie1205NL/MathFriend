import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'

const DATE = '2026-10-29', WEEK = '2026-W44'
const oral = id => ({ id, tpl: id, group: 'g', format: 'oral', level: '同构', kp: '02.2', err: '审题', text: '174 + 148', answer: 322, price: 12 })
const word = id => ({ ...oral(id), format: 'word', kp: '01.4', text: '每箱12盒牛奶，4箱共有多少盒？', answer: 48,
  flow: ['build', 'chain', 'say'], choices: [{ t: '12 × 4', ok: 1 }], ask: '答：共有', unit: '盒', units: ['本', '盒', '个'], segs: [{ t: '每箱12盒，4箱共有多少盒？', k: 2 }] })
const stat = id => ({ ...oral(id), format: 'stat', kp: '03.1', title: '喜爱的活动', cats: ['唱歌', '舞蹈'], vals: [7, 4], answer: 11, record: 'check', unit: '人', asks: [], flow: ['table'], parts: [0] })
const wordSteps = unit => [{ expr: [12, '×', 4] }, { lines: [{ k: 1, v: 48 }] }, { v: 48, unit }]
async function fixture(t, items = [oral('one')]) {
  t.mock.method(Date, 'now', () => Date.parse(`${DATE}T12:00:00+08:00`))
  const data = new Map([['pack', { week: WEEK, groups: [{ id: 'g', name: '练习', daily: items.length }], items, tuning: { sections: 0, daily_total: items.length, slow: 0 } }]])
  let failKey = null
  const store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => { if (k === failKey) { failKey = null; throw new Error('injected write failure') } data.set(k, structuredClone(v)) } }
  const token = crypto.randomUUID(), env = { DEV: true, KID_USER: 'test-review', KID_PIN: '1234', ADMIN_PIN: '9999', SYNC_TOKEN: token }
  const api = createApi(store, env)
  let cookie = ''
  async function call(path, body, status = 200, headers = {}) {
    const r = await api(new Request(`http://memory/api/kid${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }))
    const out = await r.json(); assert.equal(r.status, status, `${path}: ${JSON.stringify(out)}`)
    return { out, response: r }
  }
  cookie = (await call('/login', { name: 'test-review', pin: '1234' })).response.headers.get('set-cookie').split(';')[0]
  await call('/state')
  Object.assign(data.get('state'), { hatched: true, greet: DATE, gift: { date: DATE, what: null } })
  const day = data.get(`day:${DATE}`); day.groups = [{ id: 'g', items: items.map(it => it.id) }]
  const answer = async (item, steps) => (await call('/answer', { item, steps, ms: 30000 })).out
  const send = async (item, action, value, request_id = crypto.randomUUID(), status = 200) => {
    const review_id = data.get(`day:${DATE}`).items[item].fin.review?.id
    return (await call('/review', { item, review_id, action, value, request_id }, status)).out
  }
  const snapshot = () => {
    const s = data.get('state')
    return structuredClone({ log: data.get(`log:${WEEK}`), coins: s.coins, grow: s.grow, ladder: s.ladder, tiers: s.tiers, qn: s.qn, daily: s.daily, months: s.months })
  }
  return { data, call, answer, send, snapshot, token, env, store, failOnce: key => { failKey = key } }
}

test('单位只错一处才分配；投影不含答案，复盘不改首答、金币、阶梯，完成及解析请求幂等', async t => {
  const f = await fixture(t, [word('unit')]), a = await f.answer('unit', wordSteps('本')), r = a.fin.review
  assert.equal(a.fin.ok, false); assert.equal(r.kind, 'unit'); assert.equal(r.input.prefix, '48'); assert.ok(r.input.units.length >= 2)
  for (const key of ['expected', 'answer', 'corrected', 'hint', 'demo', 'solution', 'source']) assert.equal(r[key], undefined)
  const before = f.snapshot(), good = await f.send('unit', 'check', '盒', 'same-request')
  assert.equal(good.fin.review.outcome, 'independent'); assert.equal(good.fin.review.corrected, '48 盒')
  await f.send('unit', 'check', '盒', 'same-request'); await f.send('unit', 'skip')
  assert.deepEqual(f.snapshot(), before); assert.equal(f.data.get(`reviews:${WEEK}`).length, 1)
  await f.send('unit', 'solution'); await f.send('unit', 'solution')
  const row = f.data.get(`reviews:${WEEK}`)[0]
  assert.equal(row.outcome, 'independent'); assert.equal(row.solution, true); assert.equal(row.completedExposure.solution, false)
  assert.equal(row.events.filter(e => e.action === 'solution').length, 1)
})

test('计数按每日已分配上限2，跳过/重导包不释放，正确题与不适合题不占名额', async t => {
  const bad = { ...word('method'), flow: ['build', 'say'] }, items = [bad, oral('correct'), oral('a'), oral('b'), oral('c')]
  const f = await fixture(t, items)
  assert.equal((await f.answer('method', [{ expr: [12, '+', 4] }, { v: 16, unit: '盒' }])).fin.review, undefined)
  assert.equal((await f.answer('correct', [{ v: 322 }])).fin.review, undefined)
  assert.ok((await f.answer('a', [{ v: 332 }])).fin.review)
  await f.send('a', 'skip')
  assert.ok((await f.answer('b', [{ v: 332 }])).fin.review)
  assert.equal((await f.answer('c', [{ v: 332 }])).fin.review, undefined)
  assert.equal(f.data.get(`review-day:${DATE}`).ids.length, 2)
  f.data.get('pack').week = '2026-W45'; await f.call('/state')
  assert.equal((await f.answer('a', [{ v: 332 }])).fin.review, undefined, '换题库周也不能重置当天额度')
})

test('第一错误数值可传播，微复盘只重算那个二元步骤；算序错或两次独立算错fallback', async t => {
  const item = id => ({ ...oral(id), format: 'steps', text: '100 + 20 × 4', answer: 180 })
  const f = await fixture(t, ['safe', 'order', 'twice'].map(item))
  const good = await f.answer('safe', [{ lines: [{ k: 3, v: 90 }, { k: 1, v: 190 }] }])
  assert.equal(good.fin.review.kind, 'calc'); assert.equal(good.fin.review.expression, '20 × 4')
  const wrong = await f.send('safe', 'check', '180', 'wrong-final'); assert.equal(wrong.fin.review.status, 'pending')
  assert.equal((await f.send('safe', 'check', '80', 'micro-correct')).fin.review.status, 'done')
  assert.equal((await f.answer('order', [{ lines: [{ k: 1, v: 120 }, { k: 1, v: 480 }] }])).fin.review, undefined)
  assert.equal((await f.answer('twice', [{ lines: [{ k: 3, v: 90 }, { k: 1, v: 195 }] }])).fin.review, undefined)
})

test('stat仅合计错可核对；分类本身错误不能被一个合计数替代', async t => {
  const f = await fixture(t, [stat('total'), stat('wrong-category')])
  const a = await f.answer('total', [{ cells: [7, 4, 12] }])
  assert.equal(a.fin.review.kind, 'total'); assert.deepEqual(a.fin.review.table, { cats: ['唱歌', '舞蹈'], vals: [7, 4] })
  assert.equal((await f.send('total', 'check', '11')).fin.review.outcome, 'independent')
  assert.equal((await f.answer('wrong-category', [{ cells: [8, 4, 12] }])).fin.review, undefined)
})

test('两错、提示、示范、完整解析曝光持久；同请求/并发重试不多算一次', async t => {
  const f = await fixture(t); await f.answer('one', [{ v: 332 }]); const before = f.snapshot()
  const replies = await Promise.all([f.send('one', 'check', '332', 'retry'), f.send('one', 'check', '332', 'retry')])
  assert.ok(replies.every(x => x.fin.review.attempts === 1)); assert.equal(replies[0].fin.review.hintUsed, true)
  assert.equal(replies[0].fin.review.hint.includes('322'), false)
  const two = await f.send('one', 'check', '331', 'second'); assert.equal(two.fin.review.attempts, 2); assert.equal(two.fin.review.canDemo, true)
  const demo = await f.send('one', 'demo'); assert.ok(demo.fin.review.demo.text); assert.equal(demo.fin.review.demo.text.includes('322'), false)
  const restored = (await f.call('/state')).out.today.flatMap(g => g.items).find(it => it.id === 'one').done.review
  assert.equal(restored.demoUsed, true); assert.equal(restored.attempts, 2)
  assert.equal((await f.send('one', 'check', '322')).fin.review.outcome, 'demonstrated'); assert.deepEqual(f.snapshot(), before)
})

test('提示后与主动看解析后完成分别记录，跳过终态不冒充完成', async t => {
  const f = await fixture(t, [oral('hint'), oral('solution')])
  await f.answer('hint', [{ v: 332 }]); await f.send('hint', 'hint'); await f.send('hint', 'hint')
  assert.equal((await f.send('hint', 'check', '322')).fin.review.outcome, 'hinted')
  await f.answer('solution', [{ v: 332 }]); const full = await f.send('solution', 'solution')
  assert.ok(full.fin.review.solution.some(line => line.includes('322')))
  assert.equal((await f.send('solution', 'skip')).fin.review.outcome, 'skipped')
  assert.equal((await f.send('solution', 'check', '322')).fin.review.status, 'skipped')
  assert.deepEqual(f.data.get(`reviews:${WEEK}`).map(x => x.outcome), ['hinted', 'skipped'])
})

test('旧已完成题不回溯；闯关/样板/加练不分配，错review_id拒绝且同ID换包用创建快照', async t => {
  const f = await fixture(t, [oral('old'), oral('new')]); await f.answer('old', [{ v: 322 }])
  assert.equal((await f.call('/state')).out.today[0].items.find(it => it.id === 'old').done.review, undefined)
  await f.answer('new', [{ v: 332 }])
  await f.call('/review', { item: 'new', review_id: 'stale-id', action: 'check', value: '322', request_id: 'old' }, 409)
  f.data.get('pack').items.find(it => it.id === 'new').answer = 999
  f.data.get('pack').items.find(it => it.id === 'new').text = '900 + 99'
  assert.equal((await f.send('new', 'check', '322')).fin.review.outcome, 'independent')
  for (const id of ['sample', 'extra']) {
    const x = await fixture(t, [oral(id)]); x.data.get(`day:${DATE}`).groups = [{ id, items: [id] }]
    assert.equal((await x.answer(id, [{ v: 332 }])).fin.review, undefined)
  }
  const fri = await fixture(t, [oral('friday')]), date = '2026-10-30'
  await fri.call('/dev/clock', { date, time: '12:00' }); await fri.call('/state')
  fri.data.get('state').chal = { week: WEEK, attemptDate: date, items: ['friday'], pass: 1, recs: {}, done: false }
  fri.data.get(`day:${date}`).groups = []
  assert.equal((await fri.answer('friday', [{ v: 332 }])).fin.review, undefined)
})

test('两个导出接口均有独立reviews，账号隔离且不混入首答log', async t => {
  const f = await fixture(t); await f.answer('one', [{ v: 332 }]); await f.send('one', 'check', '322')
  const sync = (await f.call(`/log?week=${WEEK}`, undefined, 200, { 'x-sync-token': f.token })).out
  assert.equal(sync.reviews.length, 1); assert.equal(sync.log.length, 1); assert.equal(sync.log[0].correct, false); assert.equal(sync.log[0].review, undefined)
  const admin = (await f.call('/login', { name: 'admin', pin: '9999' })).response.headers.get('set-cookie').split(';')[0]
  const exported = (await f.call(`/admin/log?week=${WEEK}&user=main`, undefined, 200, { cookie: admin })).out
  assert.deepEqual(exported.reviews, sync.reviews)
  const added = (await f.call('/admin/users', { name: 'test-other', pin: '5678' }, 200, { cookie: admin })).out.user
  const other = (await f.call(`/admin/log?week=${WEEK}&user=${added.id}`, undefined, 200, { cookie: admin })).out
  assert.deepEqual(other.reviews, [])
  assert.equal(exported.reviews[0]._snapshot, undefined)
})

test('review已落盘而day失败后，刷新恢复曝光，重复check不增加attempt或重复事件', async t => {
  const f = await fixture(t); await f.answer('one', [{ v: 332 }]); const before = f.snapshot()
  f.failOnce(`day:${DATE}`)
  await assert.rejects(f.send('one', 'check', '332', 'persisted-before-failure'), /injected write failure/)
  assert.equal(f.data.get(`day:${DATE}`).items.one.review.attempts, 0)
  const retried = await f.send('one', 'check', '332', 'persisted-before-failure')
  assert.equal(retried.fin.review.attempts, 1); assert.equal(retried.fin.review.hintUsed, true)
  f.failOnce(`day:${DATE}`)
  await assert.rejects(f.send('one', 'solution'), /injected write failure/)
  const restored = (await f.call('/state')).out.today[0].items[0].done.review
  assert.equal(restored.solutionSeen, true); assert.ok(restored.solution.length)
  await f.send('one', 'check', '322')
  assert.equal(f.data.get(`reviews:${WEEK}`)[0].outcome, 'demonstrated')
  assert.equal(f.data.get(`reviews:${WEEK}`)[0].events.filter(e => e.action === 'check' && e.request_id === 'persisted-before-failure').length, 1)
  assert.deepEqual(f.snapshot(), before)
})

test('所有允许的request_id均按自身字段去重，特殊对象键也不重复计算', async t => {
  const f = await fixture(t); await f.answer('one', [{ v: 332 }])
  await f.send('one', 'check', '332', '__proto__')
  const repeated = await f.send('one', 'check', '332', '__proto__')
  assert.equal(repeated.fin.review.attempts, 1)
  assert.equal(f.data.get(`reviews:${WEEK}`)[0].events.length, 1)
})
