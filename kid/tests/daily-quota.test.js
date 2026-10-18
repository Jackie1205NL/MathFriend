import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BASE, DAILY_TOTAL, BOSS_DAILY_MAX, buildPack, maxCoins, priceOf } from '../../shared/contract.js'

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
