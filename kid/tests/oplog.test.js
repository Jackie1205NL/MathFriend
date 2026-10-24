import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'

const DATE = '2026-10-24'
async function fixture(t) {
  t.mock.method(Date, 'now', () => Date.parse(`${DATE}T12:00:00+08:00`))
  const data = new Map(), store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }
  data.set('pack', { week: '2026-W43', groups: [], items: [], tuning: {} })
  const api = createApi(store, { DEV: true, KID_USER: '甲', KID_PIN: '1234', ADMIN_PIN: '5678', SYNC_TOKEN: 'fixture-only' })
  const request = async (path, body, cookie = '', status = 200) => {
    const response = await api(new Request(`http://local/api/kid${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))
    const result = await response.json()
    assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`)
    return { result, response }
  }
  const login = async (name, pin) => (await request('/login', { name, pin })).response.headers.get('set-cookie').split(';')[0]
  const child = await login('甲', '1234'), adminCookie = await login('admin', '5678')
  return { data, request, child, adminCookie }
}
const batch = (sid, seq, n = 3) => ({ sid, seq, t0: 1000 * seq, ev: Array.from({ length: n }, (_, i) => ({ t: i * 100, k: 'act', a: 'key', v: String(i) })) })

test('操作日志按题库包的周存下来，管理员导出答题记录时带在 ops 里，同一批重发不会存两遍', async t => {
  const f = await fixture(t)
  await f.request('/oplog', batch('sess-1', 1), f.child)
  await f.request('/oplog', batch('sess-1', 2), f.child)
  assert.equal((await f.request('/oplog', batch('sess-1', 2), f.child)).result.dup, true)
  await f.request('/oplog', batch('sess-2', 3), f.child)
  const users = (await f.request('/admin/users', undefined, f.adminCookie)).result.users
  const out = (await f.request(`/admin/log?user=${users[0].id}&week=2026-W43`, undefined, f.adminCookie)).result
  assert.deepEqual(out.ops.map(b => `${b.sid}:${b.seq}`), ['sess-1:1', 'sess-1:2', 'sess-2:3'])
  assert.equal(out.ops.length, 3); assert.equal(out.ops.reduce((n, b) => n + b.ev.length, 0), 9)
  assert.ok(out.ops.every(b => b.at && b.ev.every(e => e.k === 'act' && e.a === 'key')))
  assert.deepEqual((await f.request(`/admin/log?user=${users[0].id}&week=2026-W44`, undefined, f.adminCookie)).result.ops, [])
})

test('操作日志只留扁平的数字、短字符串和布尔；格式不对、没登录都拒绝', async t => {
  const f = await fixture(t)
  await f.request('/oplog', { sid: 'sess-1', seq: 1, t0: 5, ev: [{ t: 1, k: 'tap', x: 10.123, y: 20, nested: { a: 1 }, list: [1], long: 'x'.repeat(100), ok: true, 'bad key!': 1 }, { k: 'no-time' }, null, 'str'] }, f.child)
  const [b] = f.data.get('ops:2026-W43:0')
  assert.equal(b.ev.length, 1)
  assert.deepEqual(b.ev[0], { t: 1, k: 'tap', x: 10.1, y: 20, long: 'x'.repeat(40), ok: true })
  await f.request('/oplog', { sid: 'sess-1', seq: 2, ev: [] }, f.child, 400)
  await f.request('/oplog', { sid: 'sess-1', seq: 2, ev: [{ k: 'no-time' }] }, f.child, 400)
  await f.request('/oplog', { sid: '', seq: 1, ev: [{ t: 1, k: 'x' }] }, f.child, 400)
  await f.request('/oplog', batch('sess-9', 1), '', 401)
  await f.request('/oplog', batch('sess-9', 1), f.adminCookie, 401)
})

test('一块存满以后换新块，导出时按时间顺序合在一起；超过上限返回 413', async t => {
  const f = await fixture(t)
  const big = (sid, seq) => ({ sid, seq, t0: seq, ev: Array.from({ length: 400 }, (_, i) => ({ t: i, k: 'tap', x: 1234, y: 5678, d: 123, a: 'blank', miss: true })) })
  for (let i = 1; i <= 8; i++) await f.request('/oplog', big('sess-1', i), f.child)
  assert.ok(f.data.has('ops:2026-W43:1'), '存满一块以后写到下一块')
  const users = (await f.request('/admin/users', undefined, f.adminCookie)).result.users
  const out = (await f.request(`/admin/log?user=${users[0].id}&week=2026-W43`, undefined, f.adminCookie)).result
  assert.deepEqual(out.ops.map(b => b.seq), [1, 2, 3, 4, 5, 6, 7, 8])
  f.data.set('ops-meta:2026-W43', { n: 40, size: 1, last: {} })
  await f.request('/oplog', big('sess-2', 1), f.child, 413)
})
