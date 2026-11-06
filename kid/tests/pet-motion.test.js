import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { MOTION_ACTIONS, MOTION_ASSETS, normalizeMotionAction, resolveMotion } from '../src/pet-motion.js'

const manifest = JSON.parse(fs.readFileSync(new URL('../../design/pet/gif-pack-2026-11-05/manifest.json', import.meta.url)))
const files = new Set(MOTION_ASSETS.map(x => '/pet/motion/' + x.file))

test('精简输出20张GIF和30张静帧，所有旧入口及减少动态地址均存在且时长匹配新动作', () => {
  assert.equal(MOTION_ACTIONS.length, 28)
  assert.equal(MOTION_ASSETS.filter(x => x.ext === 'gif').length, 20)
  assert.equal(MOTION_ASSETS.length, 50)
  for (const item of manifest.items) {
    for (const portrait of [false, true]) for (const reduced of [false, true]) {
      const motion = resolveMotion({ stage: item.stage, action: item.action, portrait, reduced })
      if (!motion) { assert.ok(portrait && ['sleep', 'sleep-low', 'blanket', 'night-pat', 'hum'].includes(item.action)); continue }
      assert.ok(files.has(motion.src), motion.src)
      assert.ok(files.has(motion.poster), motion.poster)
      const target = manifest.items.find(x => x.stage === item.stage && x.action === motion.action)
      assert.equal(motion.durationMs, target.durations.reduce((sum, ms) => sum + ms, 0))
      if (reduced) assert.equal(motion.src, motion.poster)
    }
  }
  for (const { stage, action, ext } of MOTION_ASSETS) {
    const file = ext === 'gif' ? `s${stage}-${action}.gif` : `s${stage}-${action}-frames/00.png`
    assert.ok(fs.existsSync(new URL('../../design/pet/gif-pack-2026-11-05/assets/' + file, import.meta.url)))
  }
})

test('SW缓存清单精确匹配发布清单，并升级清除旧大包', () => {
  const worker = fs.readFileSync(new URL('../public/pet-motion-sw.js', import.meta.url), 'utf8')
  const context = vm.createContext({})
  vm.runInContext(worker.slice(0, worker.indexOf('const allowed')) + ';globalThis.files=FILES;globalThis.cache=CACHE', context)
  assert.deepEqual([...context.files].sort(), [...files].sort())
  assert.equal(context.cache, 'mathfriend-pet-motion-v2')
  assert.match(worker, /name !== CACHE.*caches.delete\(name\)/)
})

test('日常与场景合并代表动作，球盘与护理结果仍表达真实活动', () => {
  for (const stage of [2, 3]) {
    assert.equal(resolveMotion({ stage }).src, `/pet/motion/s${stage}-idle.png`)
    for (const action of ['look', 'sniff', 'blink', 'stretch-yawn', 'hop', 'wave', 'spin', 'pat', 'shake', 'carry-object', 'paw-craft']) assert.equal(resolveMotion({ stage, action }).action, 'wag')
    assert.equal(resolveMotion({ stage, action: 'present-find' }).action, 'walk')
    for (const action of ['eat', 'bath', 'ball', 'disc']) assert.equal(resolveMotion({ stage, action, low: true }).action, action)
    assert.equal(resolveMotion({ stage, action: 'think' }).src, `/pet/motion/s${stage}-think.png`)
    assert.equal(resolveMotion({ stage, action: 'proud' }).src, `/pet/motion/s${stage}-proud.png`)
  }
})

test('其他阶段和出走不分配素材；非法动作及catch歧义不会猜成玩具', () => {
  for (const stage of [undefined, null, 0, 1, 4, 5, '2', -1]) assert.equal(resolveMotion({ stage, action: 'disc' }), null)
  for (const stage of [2, 3]) assert.equal(resolveMotion({ stage, away: true, action: 'eat' }), null)
  for (const action of ['catch', '../disc', 'constructor', 'toString', 'disc?bad', {}, 2, false]) {
    assert.equal(normalizeMotionAction(action), null)
    assert.equal(resolveMotion({ stage: 2, action }), null)
  }
})

test('睡觉只用普通与低状态两张GIF，三种轻互动及延迟日间请求保持睡姿', () => {
  for (const stage of [2, 3]) for (const low of [false, true]) {
    for (const action of [undefined, 'blanket', 'night-pat', 'hum', 'eat', 'bath', 'disc', 'hop']) {
      const motion = resolveMotion({ stage, action, sleeping: true, low })
      assert.equal(motion.action, low ? 'sleep-low' : 'sleep')
      assert.equal(resolveMotion({ stage, action, sleeping: true, low, portrait: true }), null)
    }
    assert.equal(resolveMotion({ stage, low: true }).src, `/pet/motion/s${stage}-low-rest.png`)
  }
})

test('答题常态静帧，只在思考和完成反馈使用两个表情GIF', () => {
  for (const stage of [2, 3]) {
    assert.equal(resolveMotion({ stage, portrait: true }).src, `/pet/motion/s${stage}-idle-face.png`)
    for (const action of ['thinking', 'shy', 'shy-encourage']) assert.equal(resolveMotion({ stage, action, portrait: true }).src, `/pet/motion/s${stage}-think-face.gif`)
    assert.equal(resolveMotion({ stage, action: 'proud', portrait: true }).src, `/pet/motion/s${stage}-proud-face.gif`)
  }
})
