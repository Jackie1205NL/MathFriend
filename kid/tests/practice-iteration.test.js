import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'

const DATE = '2026-10-15'
const WEBM = btoa('\x1a\x45\xdf\xa3' + 'fixture-video-header')
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
    answer: (sel = [0, 1, 2, 3, 4], status = 200) => call('/answer', { item: item.id, ms: 30000, steps: [{ sel }, { sel: [2], v: 1, unit: '个' }] }, status),
    start: (changes = {}, status = 200) => call('/recordings', { item: item.id, date: DATE, mime: 'video/webm', duration: 1000, ...changes }, status) }
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

test('录像创建只接受当前账号近 30 天任务、支持的格式与时长', async t => {
  const f = await fixture(t)
  for (const changes of [{ item: 'someone-else-task' }, { date: '2026-10-16' }, { date: '2026-09-01' }, { date: 'bad-date' }, { mime: 'image/png' }, { duration: -1 }, { duration: 180001 }, { duration: '1000' }]) await f.start(changes, 400)
  const clip = await f.start()
  assert.equal(clip.ready, false); assert.equal(clip.count, 0)
})

test('录像分块拒绝越界、坏编码、超大块；缺块或伪造视频头不能完成', async t => {
  const f = await fixture(t), clip = await f.start()
  for (const [index, value] of [[-1, WEBM], [128, WEBM], [0.5, WEBM], [0, ''], [0, '!bad!'], [0, 'A'.repeat(262148)]]) await f.call(`/recordings/${clip.id}/${index}`, { data: value }, 400)
  await f.call(`/recordings/${clip.id}/1`, { data: btoa('second chunk') })
  await f.call(`/recordings/${clip.id}/finish`, { count: 1 }, 400)
  await f.call(`/recordings/${clip.id}/finish`, { count: 2 }, 400)
  await f.call(`/recordings/${clip.id}/0`, { data: btoa('not-a-video-header') })
  await f.call(`/recordings/${clip.id}/finish`, { count: 2 }, 400)
  await f.call(`/recordings/${clip.id}/0`, { data: WEBM })
  const done = await f.call(`/recordings/${clip.id}/finish`, { count: 2 })
  assert.equal(done.ready, true); assert.equal(done.bytes, atob(WEBM).length + 'second chunk'.length)
  assert.deepEqual(await f.call(`/recordings/${clip.id}/finish`, { count: 2 }), done)
  assert.deepEqual(await f.call(`/recordings/${clip.id}/status`, {}), done)
  await f.call(`/recordings/${clip.id}/0`, { data: WEBM }, 409)
})

test('MP4 可完整保存且不能冒用 WebM 类型；每账号最多保留 200 个片段', async t => {
  const f = await fixture(t), mp4 = btoa('\x00\x00\x00\x18ftypisom'), clip = await f.start({ mime: 'video/mp4', duration: 180000 })
  await f.call(`/recordings/${clip.id}/0`, { data: WEBM })
  await f.call(`/recordings/${clip.id}/finish`, { count: 1 }, 400)
  await f.call(`/recordings/${clip.id}/0`, { data: mp4 })
  assert.equal((await f.call(`/recordings/${clip.id}/finish`, { count: 1 })).ready, true)
  f.data.set('recordings:index', Array.from({ length: 200 }, (_, n) => `fixture-clip-${n}`))
  await f.start({}, 409)
})

test('录像总大小上限 16 MiB，完整但过大的文件不能完成', async t => {
  const f = await fixture(t), clip = await f.start(), piece = btoa('x'.repeat(196608))
  // 直接填充内存存储模拟已上传分块，避免在测试里构造大型 HTTP 请求。
  f.data.set(`recording:${clip.id}:0`, WEBM)
  for (let n = 1; n < 87; n++) f.data.set(`recording:${clip.id}:${n}`, piece)
  f.data.get(`recording:${clip.id}`).count = 87
  await f.call(`/recordings/${clip.id}/finish`, { count: 87 }, 400)
  assert.equal(f.data.get(`recording:${clip.id}`).ready, false)
})

test('录像账号隔离；未登录和孩子不能读取管理员列表/视频，管理员指定账号才能读取或删除', async t => {
  const f = await fixture(t), clip = await f.start()
  await f.call(`/recordings/${clip.id}/0`, { data: WEBM })
  await f.admin(`/admin/recordings/${clip.id}/0?user=main`, undefined, 404)
  await f.call(`/recordings/${clip.id}/finish`, { count: 1 })
  const { user } = await f.admin('/admin/users', { name: '乙', pin: '2468' }), cookie = await f.login('乙', '2468')
  await f.request(`/recordings/${clip.id}/status`, {}, cookie, 404)
  await f.request(`/recordings/${clip.id}/0`, { data: WEBM }, cookie, 404)
  await f.request(`/recordings/${clip.id}/finish`, { count: 1 }, cookie, 404)
  for (const path of ['/admin/recordings?user=main', `/admin/recordings/${clip.id}/0?user=main`]) {
    await f.request(path, undefined, '', 401); await f.call(path, undefined, 401)
  }
  await f.call(`/admin/recordings/${clip.id}/delete?user=main`, {}, 401)
  assert.deepEqual((await f.admin(`/admin/recordings?user=${user.id}`)).clips, [])
  await f.admin(`/admin/recordings/${clip.id}/0?user=${user.id}`, undefined, 404)
  await f.admin(`/admin/recordings/${clip.id}/delete?user=${user.id}`, {}, 404)
  assert.equal((await f.admin('/admin/recordings?user=main')).clips.length, 1)
  const { result, response } = await f.request(`/admin/recordings/${clip.id}/0?user=main`, undefined, await f.login('admin', '5678'))
  assert.equal(result.data, WEBM); assert.equal(response.headers.get('cache-control'), 'no-store')
  await f.admin(`/admin/recordings/${clip.id}/1?user=main`, undefined, 404)
  await f.admin(`/admin/recordings/${clip.id}/delete?user=main`, {})
  assert.deepEqual((await f.admin('/admin/recordings?user=main')).clips, [])
  assert.deepEqual(f.data.get(`recording:${clip.id}`), { id: clip.id, deleted: true }); assert.equal(f.data.get(`recording:${clip.id}:0`), null)
  await f.call(`/recordings/${clip.id}/status`, {}, 410)
  await f.call(`/recordings/${clip.id}/0`, { data: WEBM }, 410)
  await f.call(`/recordings/${clip.id}/finish`, { count: 1 }, 410)
})

test('录像开关仅管理员可改，关闭阻止新片段；既有片段仍能保存且设置不影响每日题量', async t => {
  const f = await fixture(t), clip = await f.start()
  await f.call('/admin/settings', { recordingEnabled: false }, 401)
  await f.admin('/admin/settings', { recordingEnabled: 'false' }, 400)
  await f.admin('/admin/settings', { daily: 8, recordingEnabled: false })
  assert.equal((await f.call('/state')).recordingEnabled, false)
  await f.start({}, 403)
  await f.call(`/recordings/${clip.id}/0`, { data: WEBM })
  await f.call(`/recordings/${clip.id}/finish`, { count: 1 })
  await f.admin('/admin/settings', { recordingEnabled: true })
  assert.equal(f.data.get('settings').daily, 8)
  assert.equal((await f.call('/state')).recordingEnabled, true)
  await f.start()
})

test('创建响应丢失后同 clientId 复用原录像；归属信息不同拒绝复用，删除后不会复活', async t => {
  const f = await fixture(t), clientId = crypto.randomUUID(), original = await f.start({ clientId })
  assert.equal(original.id, clientId)
  assert.deepEqual(await f.start({ clientId }), original)
  assert.deepEqual(f.data.get('recordings:index'), [clientId])
  await f.start({ clientId, mime: 'video/mp4' }, 409)
  f.data.set('day:2026-10-14', structuredClone(f.data.get(`day:${DATE}`)))
  await f.start({ clientId, date: '2026-10-14' }, 409)
  f.data.get('pack').items.push({ ...f.item, id: 'count-2' })
  f.data.get(`day:${DATE}`).groups[0].items.push('count-2')
  await f.start({ clientId, item: 'count-2' }, 409)
  await f.call(`/recordings/${clientId}/0`, { data: WEBM })
  const complete = await f.call(`/recordings/${clientId}/finish`, { count: 1 })
  assert.deepEqual(await f.start({ clientId }), complete)
  assert.deepEqual(f.data.get('recordings:index'), [clientId])
  await f.admin(`/admin/recordings/${clientId}/delete?user=main`, {})
  await f.start({ clientId }, 410)
  assert.deepEqual(f.data.get('recordings:index'), [])
  assert.deepEqual(f.data.get(`recording:${clientId}`), { id: clientId, deleted: true })
})
