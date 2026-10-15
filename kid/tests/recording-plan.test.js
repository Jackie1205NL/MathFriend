import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordingPlan } from '../server/recording-plan.js'
import { createApi } from '../server/game.js'

const items = Array.from({ length: 12 }, (_, i) => ({ id: `q-${i}`, format: i < 6 ? ['word', 'plan', 'multistep'][i % 3] : 'oral' }))
test('每日固定抽 2–3 道，优先应用题，日期和账号能改变抽样', () => {
  const days = Array.from({ length: 28 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
  const plans = days.map(date => recordingPlan(items, date, 'kid-a'))
  assert.deepEqual(new Set(plans.map(p => p.limit)), new Set([2, 3]))
  for (const [i, p] of plans.entries()) {
    assert.equal(p.items.length, p.limit); assert.equal(new Set(p.items).size, p.limit)
    assert.ok(p.items.every(id => +id.slice(2) < 6))
    assert.deepEqual(p, recordingPlan([...items].reverse(), days[i], 'kid-a'))
  }
  assert.ok(new Set(plans.map(p => p.items.join(','))).size > 4)
  assert.notDeepEqual(plans, days.map(date => recordingPlan(items, date, 'kid-b')))
})
test('应用题不足时补其他题，题量少时不重复、不凑数', () => {
  const mixed = [{ id: 'app', format: 'word' }, { id: 'table', format: 'stat' }, ...items.slice(6)]
  const plan = recordingPlan(mixed, '2026-10-15', 'kid-a')
  assert.deepEqual(plan.items.slice(0, 2), ['app', 'table'])
  assert.equal(recordingPlan([items[0], items[0]], '2026-10-15', 'kid-a').items.length, 1)
  assert.deepEqual(recordingPlan([], '2026-10-15', 'kid-a').items, [])
})
test('服务端冻结当天名单；刷新、重抽任务、分段上传不扩大名额，未抽中的题拒绝新录像', async () => {
  const data = new Map(), api = createApi({ get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }, { DEV: true, KID_USER: '抽样测试', KID_PIN: '1234', SYNC_TOKEN: 'test' })
  let cookie = ''
  const call = async (path, body, status = 200) => {
    const r = await api(new Request('http://local/api/kid' + path, { method: body ? 'POST' : 'GET', headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }))
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0]
    const d = await r.json(); assert.equal(r.status, status, JSON.stringify(d)); return d
  }
  await call('/dev/clock', { date: '2026-10-15', time: '12:00' }); await call('/login', { name: '抽样测试', pin: '1234' })
  const pack = { week: '2026-W42', tuning: {}, groups: [{ id: 'daily', name: '测试', daily: 12 }], items: items.map((x, i) => ({ ...x, format: 'oral', text: `${i}+1`, answer: i + 1, group: 'daily', price: 3, level: '同构', kp: '计算', err: '计算失误' })) }
  data.set('pack', pack)
  const day = { date: '2026-10-15', week: pack.week, cap: 12, groups: [{ id: 'daily', items: items.map(x => x.id) }], items: {}, flash: 0, done: false }
  data.set('day:2026-10-15', day)
  const first = await call('/state'); assert.ok([2, 3].includes(first.recordingItems.length))
  assert.deepEqual((await call('/state')).recordingItems, first.recordingItems)
  data.get('day:2026-10-15').groups.reverse()
  assert.deepEqual((await call('/state')).recordingItems, first.recordingItems)
  data.set('day:2026-10-15', { ...day, items: {} })
  assert.deepEqual((await call('/state')).recordingItems, first.recordingItems)
  const body = { item: first.recordingItems[0], date: '2026-10-15', mime: 'video/webm', duration: 1000 }
  const one = await call('/recordings', body), two = await call('/recordings', body)
  assert.notEqual(one.id, two.id)
  const excluded = items.find(x => !first.recordingItems.includes(x.id)).id
  const rejected = await call('/recordings', { ...body, item: excluded }, 403)
  assert.equal(rejected.code, 'RECORDING_NOT_SELECTED')
  assert.equal(data.get('recordings:index').length, 2)
  await call('/dev/clock', { date: '2026-10-16', time: '12:00' }); await call('/state')
  assert.ok(data.has('recording-plan:2026-10-16'))
  assert.deepEqual(data.get('recording-plan:2026-10-15').items, first.recordingItems)
})
