import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/game.js'
import { BASE, DAILY_TOTAL, BOSS_DAILY_MAX, buildPack, maxCoins, priceOf, publicItem, coinsFor } from '../../shared/contract.js'

test('每天的关底题最高 42 金币，各难度按比例拉开；普通重点组价格不变', () => {
  const top = ['plan', 'multistep'].map(f => ['同构', '略变', '综合'].map(l => maxCoins({ format: f, price: priceOf(f, l, '本周重点', 0, true) })))
  assert.deepEqual(top, [[27, 35, 42], [27, 35, 42]])
  assert.equal(Math.max(...top.flat()), BOSS_DAILY_MAX)
  assert.equal(priceOf('plan', '综合', '本周重点', 0, false), BASE.plan * 1.6 * 1.5)
})

test('新生成的题库带 tuning.daily_total = 14（口算 3 + 五个重点组各 2 + 关底 1）', () => {
  const bank = { groups: [{ id: 'g1', name: '口算', bucket: '已掌握保温' }, { id: 'g2', name: '重点', bucket: '本周重点' }, { id: 'g3', name: '关底', bucket: '本周重点', boss: true, daily: 1 }], templates: [], tuning: {} }
  const { pack } = buildPack(bank, '2026-W42')
  assert.equal(pack.tuning.daily_total, DAILY_TOTAL)
  assert.equal(DAILY_TOTAL, 14)
})


const oralPack = (expression, text = expression) => buildPack({
  groups: [{ id: 'g', name: '口算热身', bucket: '已掌握保温', daily: 1 }],
  templates: [{ id: 'oral-price', group: 'g', format: 'oral', level: '同构', knowledge_point: '02.2', error_type: '计算失误', count: 1, expression, text }],
  tuning: { daily_total: 14, slow: 0, sections: 0 },
}, '2026-W46').pack

test('口算按真实运算负担分档，整十整百和0/1例外保持低分，不按位数一刀切', () => {
  const base = e => priceOf('oral', '同构', '下周预习', 0, false, e)
  for (const e of ['8×7', '800+100', '600+300', '800−200', '345+200', '900÷3', '2100÷7', '4000÷8', '300×4', '123×0', '0×999', '999×1', '1×999', '936÷1']) assert.equal(base(e), 1, e)
  assert.equal(base('248+51'), 2)
  assert.equal(base('52×3'), 3); assert.equal(base('57×7'), 3)
  for (const e of ['624−254', '933−115', '904−187', '1002−385', '326×3', '936÷4', '1200÷8']) assert.equal(base(e), 4, e)
  assert.equal(base('(36+24)÷3'), 5); assert.equal(base('100−12×3'), 5)
  const shown = e => maxCoins(oralPack(e).items[0])
  assert.equal(shown('900÷3'), 1); assert.equal(shown('52×3'), 2); assert.equal(shown('624−254'), 3)
  assert.equal(shown('(36+24)÷3'), 4)
  assert.ok(shown('624−254') > shown('52×3'))
  for (const level of ['同构', '略变', '综合']) for (const bucket of ['已掌握保温', '本周重点']) assert.ok(priceOf('oral', level, bucket, 0, false, '100−12×3') < priceOf('word', level, bucket, 0, false))
})

test('生成定价只读取expression，自定义故事噪音数字不影响价格；旧priceOf调用及其它题型不变', () => {
  const story = oralPack('900÷3', '第9876号仓库有900箱，平均分3批，每批有几箱？').items[0]
  assert.equal(story.price, oralPack('900÷3').items[0].price)
  const hard = oralPack('624−254', '小猫有一些贴纸，送出一部分，还剩多少？').items[0]
  assert.equal(hard.price, oralPack('624−254').items[0].price)
  assert.equal(priceOf('oral', '同构', '已掌握保温'), 0.8)
  assert.equal(priceOf('oral', '略变', '本周重点', 2), 2.6)
  assert.equal(priceOf('oral', '综合', '本周重点', 0, true), 1.6)
  assert.equal(priceOf('oral', '同构', '下周预习', 0, false, '第999号：3×4'), 1)
  assert.equal(priceOf('oral', '同构', '下周预习', 0, false, '12.5×4'), 1)
  for (const format of Object.keys(BASE).filter(f => f !== 'oral')) {
    assert.equal(priceOf(format, '略变', '本周重点', 0, false, '624−254'), BASE[format] * 1.3 * 1.5)
    assert.equal(priceOf(format, '综合', '本周重点', 0, true, '624−254'), priceOf(format, '综合', '本周重点', 0, true))
  }
})

test('新口算包显示max与后端实际金币一致；旧包price原样结算，不依题干或耗时再改价', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-10T12:00:00+08:00'))
  for (const [expression, old] of [['800+100', false], ['52×3', false], ['624−254', false], ['100−12×3', false], ['624−254', true]]) {
    const pack = oralPack(expression), it = pack.items[0]
    if (old) it.price = 0.8
    const before = JSON.stringify(pack), data = new Map([['pack', structuredClone(pack)]])
    const api = createApi({ get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }, { DEV: true, KID_USER: 'test-price', KID_PIN: '1234', ADMIN_PIN: '9999', SYNC_TOKEN: crypto.randomUUID() })
    let cookie = ''
    const call = async (path, body) => {
      const res = await api(new Request('http://memory/api/kid' + path, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))
      const out = await res.json(); assert.equal(res.status, 200, JSON.stringify(out)); return { out, res }
    }
    cookie = (await call('/login', { name: 'test-price', pin: '1234' })).res.headers.get('set-cookie').split(';')[0]
    const view = (await call('/state')).out, shown = view.today.flatMap(g => g.items).find(x => x.id === it.id)
    assert.equal(shown.max, publicItem(it).max)
    const { fin } = (await call('/answer', { item: it.id, ms: old ? 500000 : 10000, steps: [{ v: it.answer }] })).out
    assert.equal(fin.ok, true); assert.equal(fin.c, shown.max); assert.equal(fin.c, coinsFor(it.price, 1).c)
    assert.equal(fin.pb, 0); assert.equal(fin.bonus, false)
    assert.equal(data.get('log:2026-W46')[0].coins, shown.max)
    assert.equal(JSON.stringify(data.get('pack')), before)
    if (old) assert.equal(fin.c, 1)
  }
})
