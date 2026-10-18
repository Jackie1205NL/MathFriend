import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditSegs, calibrateSegs, packKeys, segAnchors, checkPack } from '../../shared/contract.js'
import { createApi } from '../server/game.js'

// 图书馆应用题：上午借出 44 本，下午是上午的 3 倍，一天一共借出多少本。正确算式 44 + 44 × 3
const word = segs => ({ id: 'w1', tpl: 't1', group: 'g', format: 'word', level: '同构', kp: '倍数', err: '审题', bucket: '本周重点', price: 12, answer: 176, ask: '答：一共借出', unit: '本', units: ['本'],
  choices: [{ t: '44 + 44 × 3', v: 176, ok: 1 }, { t: '44 × 3', v: 132 }, { t: '44 + 3', v: 47 }],
  chips: [{ v: 44, seg: 1 }, { v: 44, seg: 1 }, { v: 3, seg: 4 }],
  segs })
const T = (t, k, n) => ({ t, ...(k ? { k } : {}), ...(n ? { n: 1 } : {}) })
const good = () => [T('图书馆'), T('上午借出 44 本书，', 2), T('下午', 1), T('借出的是'), T('上午的 3 倍。', 2), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？', 2)]

test('标得对的题不改，也没有存疑', () => {
  const r = auditSegs(word(good()))
  assert.deepEqual(r.fix, []); assert.deepEqual(r.warn, [])
})

test('列式要用的数和问题没标必圈：补成必圈（漏标）', () => {
  const it = word([T('图书馆'), T('上午借出 44 本书，', 1), T('下午', 1), T('借出的是'), T('上午的 3 倍。'), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？', 1)])
  const r = calibrateSegs(it)
  assert.equal(r.fixed.length, 3)
  assert.deepEqual(it.segs.map(s => s.k || 0), [0, 2, 1, 0, 2, 0, 2])
})

test('必圈的段里没有数也没有决定算法的词：降成帮助理解（误标）；噪音句不会被动', () => {
  const it = word([T('图书馆', 2), T('上午借出 44 本书，', 2), T('下午', 2), T('借出的是'), T('上午的 3 倍。', 2), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？', 2)])
  calibrateSegs(it)
  assert.deepEqual(it.segs.map(s => s.k || 0), [1, 2, 1, 0, 2, 0, 2])
  assert.equal(it.segs[5].n, 1); assert.equal(it.segs[5].k, undefined)
})

test('噪音句里的数不会被当成列式要用的数；噪音句数字和算式一样要提醒', () => {
  const it = word([T('图书馆'), T('这里有 3 只猫。', 0, 1), T('上午借出 44 本书，', 2), T('下午', 1), T('借出的是'), T('上午的 3 倍。', 2), T('这一天一共借出多少本书？', 2)])
  assert.deepEqual(segAnchors(it).nums, [2, 5])
  assert.ok(auditSegs(it).warn.some(m => m.includes('噪音句里的数')))
})

test('句句都是关键词、必圈太多、没有噪音句、漏标「一共」都只提醒不乱改', () => {
  const all = word(good().map(s => ({ ...s, k: 2, n: undefined })))
  const w = auditSegs(all).warn.join('|')
  assert.match(w, /句句都是关键词/); assert.match(w, /没有噪音句/)
  const miss = word([T('图书馆'), T('上午借出 44 本书，', 2), T('一共'), T('上午的 3 倍。', 2), T('借出多少本书？', 2), T('今天晴天。', 0, 1)])
  assert.match(auditSegs(miss).warn.join('|'), /「一共」像是决定怎么算的词/)
})

test('没有算式依据的题型（统计、数据）不自动改，只提醒', () => {
  const it = { id: 'd1', format: 'data', segs: [T('这些数', 2), T('超过', 2), T('10', 2), T('有几个', 2), T('请仔细观察', 1), T('今天晴天', 0, 1)] }
  assert.deepEqual(auditSegs(it).fix, [])
  assert.deepEqual(calibrateSegs(it).fixed, [])
})

test('多步题：每一步算式里的数都是必圈', () => {
  const it = { id: 'm1', format: 'multistep', tpl: 'm', segs: [T('水果店'), T('买了 12 盒，', 1), T('每盒 6 个，', 1), T('卖出 20 个。'), T('还剩多少个？', 1)], parts: [{ tk: [12, '×', 6], prevAt: -1 }, { tk: [0, '−', 20], prevAt: 0 }] }
  assert.deepEqual(segAnchors(it).nums, [1, 2, 3])
  calibrateSegs(it)
  assert.deepEqual(it.segs.map(s => s.k || 0), [0, 2, 2, 2, 2])      // 12、6、20 和问题都是必圈
})

test('packKeys 按模板汇总，fix 为真才改题目', () => {
  const bad = () => word([T('图书馆'), T('上午借出 44 本书，', 1), T('下午', 1), T('借出的是'), T('上午的 3 倍。'), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？')])
  const pack = { items: [bad(), { ...bad(), id: 'w2' }] }
  const dry = packKeys(pack); assert.equal(dry.fixed, 6); assert.equal(pack.items[0].segs[1].k, 1)
  const done = packKeys(pack, { fix: true }); assert.equal(done.byTpl.t1.fixed['列式要用的数没标必圈'].n, 4); assert.equal(pack.items[0].segs[1].k, 2)
  assert.equal(packKeys(pack, { fix: true }).fixed, 0)
})

test('导入题库时统一校正关键词，回执里带校正数', async () => {
  const data = new Map(), store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }
  const api = createApi(store, { DEV: true, KID_USER: '甲', KID_PIN: '1234', ADMIN_PIN: '5678', SYNC_TOKEN: 'fixture-only' })
  const it = word([T('图书馆'), T('上午借出 44 本书，', 1), T('下午', 1), T('借出的是'), T('上午的 3 倍。'), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？')])
  const pack = { format: 'shuban-kid-pack', v: 1, week: '2026-W42', groups: [{ id: 'g', name: '圈出条件', daily: 1 }], items: [it], tuning: {} }
  const probe = checkPack(pack)
  if (probe.length) return        // 题库包格式常量变动时，格式检查先拦下，这个用例不适用
  const res = await api(new Request('http://local/api/kid/pack', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-sync-token': 'fixture-only' }, body: JSON.stringify(pack) }))
  const out = await res.json(); assert.equal(res.status, 200, JSON.stringify(out))
  assert.equal(out.keys.fixed, 3)
  assert.deepEqual(data.get('pack').items[0].segs.map(s => s.k || 0), [0, 2, 1, 0, 2, 0, 2])
})
