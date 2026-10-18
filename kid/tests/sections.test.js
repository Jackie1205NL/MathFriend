import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'
import { SECTION_NAMES, checkPack } from '../../shared/contract.js'

// 5 个来源组 + 1 个关底组，抽出来的 13 道题要发进 3 个题型，关底题另算
const GROUPS = [['g1', '口算热身', '已掌握保温', 3], ['g2', 'A', '本周重点', 2], ['g3', 'B', '本周重点', 2], ['g4', 'C', '本周重点', 2], ['g5', 'D', '下周预习', 2], ['g6', 'E', '往周未过关', 2]]
function pack(tuning) {
  const items = [...GROUPS.map(g => g.slice(0, 3)), ['g9', '关底题', '本周重点']].flatMap(([id, , bucket]) => Array.from({ length: 30 }, (_, i) => ({
    id: `${id}-${i}`, tpl: `${id}-t${i % 3}`, group: id, format: 'data', kp: '读题', err: '审题', level: '同构', bucket, price: id === 'g1' ? 1 : id === 'g9' ? 40 : 10 + i % 4,
    kind: 'over', over: 10, nums: [9, 10, 11], answer: 1, ask: '符合条件的有', unit: '个', units: ['个'], explain: '11 超过 10。', segs: [{ t: '超过', k: 2 }, { t: '10', k: 2 }] })))
  return { format: 'shuban-kid-pack', v: 1, week: '2026-W42', created: '2026-10-18T00:00:00Z', tuning: { slow: 0, daily_total: 14, ...tuning },
    groups: [...GROUPS.map(([id, name, bucket, daily]) => ({ id, name, bucket, daily })), { id: 'g9', name: '关底题', bucket: '本周重点', boss: true, daily: 1 }], items }
}
async function today(date, tuning) {
  const realNow = Date.now; Date.now = () => Date.parse(`${date}T12:00:00+08:00`)
  try {
    const data = new Map(), store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }
    data.set('pack', pack(tuning))
    const api = createApi(store, { DEV: true, KID_USER: '甲', KID_PIN: '1234', ADMIN_PIN: '5678', SYNC_TOKEN: 'x' })
    const call = async (path, cookie, body) => api(new Request(`http://local/api/kid${path}`, { method: body ? 'POST' : 'GET', headers: { cookie, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }))
    const cookie = (await call('/login', '', { name: '甲', pin: '1234' })).headers.get('set-cookie').split(';')[0]
    await call('/state', cookie)
    Object.assign(data.get('state'), { hatched: true, gift: { date, what: null }, greet: date })
    return (await (await call('/state', cookie)).json()).today
  } finally { Date.now = realNow }
}

test('每天 14 题分进 3 个题型，关底题另算，题型里金币从少到多', async () => {
  const names = SECTION_NAMES.slice(0, 4), t = await today('2026-10-20', { sections: 3, section_names: names })
  assert.equal(t.length, 4)
  assert.deepEqual(t.map(g => g.items.length), [5, 4, 4, 1])
  assert.equal(t[3].name, '关底题')
  assert.equal(new Set(t.slice(0, 3).map(g => g.name)).size, 3)
  assert.ok(t.slice(0, 3).every(g => names.some(n => n.name === g.name)))
  for (const g of t.slice(0, 3)) assert.ok(g.items.slice(1).every((it, i) => it.max >= g.items[i].max || g.items[i].id.startsWith('g1-')), '题型里热身在前，其余金币从少到多')
})

test('题型名字每天换；没写 sections 的老题库照旧按分组显示', async () => {
  const seen = new Set(), dates = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']
  let prev = []
  for (const d of dates) {
    const names = (await today(d, { sections: 3, section_names: SECTION_NAMES })).slice(0, 3).map(g => g.name)
    assert.ok(!names.some(n => prev.includes(n)), '连着两天不重名')
    seen.add(names.join()); prev = names
  }
  assert.equal(seen.size, dates.length)
  const old = await today('2026-10-20', {})
  assert.deepEqual(old.map(g => g.name), ['口算热身', 'A', 'B', 'C', 'D', 'E', '关底题'])
})

test('题库包检查：sections 要配够名字', () => {
  assert.ok(checkPack({ ...pack({ sections: 3, section_names: SECTION_NAMES.slice(0, 2) }) }).some(m => m.includes('section_names')))
  assert.deepEqual(checkPack(pack({ sections: 3, section_names: SECTION_NAMES })), [])
})
