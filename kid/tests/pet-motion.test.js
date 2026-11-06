import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { MOTION_ACTIONS, normalizeMotionAction, resolveMotion } from '../src/pet-motion.js'

const manifest = JSON.parse(fs.readFileSync(new URL('../../design/pet/gif-pack-2026-11-05/manifest.json', import.meta.url)))

test('两阶段全部56个动作指向已确认素材，单次播放时长覆盖完整的八帧', () => {
  assert.equal(MOTION_ACTIONS.length, 28)
  assert.equal(manifest.items.length, 56)
  for (const item of manifest.items) {
    const motion = resolveMotion({ stage: item.stage, action: item.action })
    assert.equal(motion.action, item.action, item.id)
    assert.equal(motion.loop, false, item.id)
    assert.equal(motion.durationMs, item.durations.reduce((sum, ms) => sum + ms, 0), item.id)
    for (const [url, file] of [[motion.src, `${item.id}.gif`], [motion.poster, `${item.id}-frames/00.png`]]) {
      assert.ok(fs.existsSync(new URL(`../../design/pet/gif-pack-2026-11-05/assets/${file}`, import.meta.url)), url)
    }
    assert.equal(motion.src, `/pet/motion/${item.id}.gif`)
    assert.equal(motion.poster, `/pet/motion/${item.id}.png`)
  }
})

test('其他成长阶段和出走不分配动画，保持旧素材与空房边界', () => {
  for (const stage of [undefined, null, 0, 1, 4, 5, '2', -1]) assert.equal(resolveMotion({ stage, action: 'disc' }), null)
  for (const stage of [2, 3]) {
    assert.equal(resolveMotion({ stage, away: true }), null)
    assert.equal(resolveMotion({ stage, away: true, action: 'eat', portrait: true }), null)
  }
})

test('旧闲聊动作能复用对应动作，玩具和护理的歧义由调用方明确区分', () => {
  for (const [old, current] of Object.entries({ giggle: 'wag', yawn: 'stretch-yawn', stretch: 'stretch-yawn', sleepy: 'stretch-yawn', happy: 'idle', thinking: 'think', shy: 'shy-encourage' })) {
    assert.equal(normalizeMotionAction(old), current)
    assert.equal(resolveMotion({ stage: 2, action: old }).action, current)
  }
  assert.equal(normalizeMotionAction('catch'), null)
  assert.equal(normalizeMotionAction('shake'), 'shake')
  assert.equal(resolveMotion({ stage: 2, action: 'pat' }).action, 'pat')
  for (const action of ['../disc', 'constructor', 'toString', 'disc?bad', {}, 2, false]) {
    assert.equal(normalizeMotionAction(action), null)
    assert.equal(resolveMotion({ stage: 2, action }), null)
  }
})

test('安静陪伴按睡眠和状态切换，显式照顾不被低状态掩盖', () => {
  for (const stage of [2, 3]) {
    for (const [sleeping, low, action] of [[false, false, 'idle'], [false, true, 'low-rest'], [true, false, 'sleep'], [true, true, 'sleep-low']]) {
      const motion = resolveMotion({ stage, sleeping, low })
      assert.equal(motion.action, action)
      assert.equal(motion.loop, true)
    }
    for (const action of ['eat', 'bath', 'pat', 'ball', 'disc']) {
      const motion = resolveMotion({ stage, low: true, action })
      assert.equal(motion.action, action)
      assert.equal(motion.loop, false)
    }
  }
})

test('睡后保留三种独立轻互动，日间请求不会播放嬉戏或成功照顾', () => {
  for (const low of [false, true]) {
    for (const action of ['blanket', 'night-pat', 'hum']) {
      const motion = resolveMotion({ stage: 3, action, sleeping: true, low })
      assert.equal(motion.action, action)
      assert.equal(motion.loop, false)
    }
    for (const action of ['eat', 'bath', 'pat', 'ball', 'disc', 'hop', 'catch', 'bad-action']) {
      const motion = resolveMotion({ stage: 3, action, sleeping: true, low })
      assert.equal(motion.action, low ? 'sleep-low' : 'sleep')
      assert.equal(motion.loop, true)
    }
  }
})

test('减少动态只取透明静帧；头像仅使用四种实际肖像，不把睡姿换成笑脸', () => {
  const faces = new Set(['idle', 'think', 'proud', 'shy-encourage'])
  for (const stage of [2, 3]) {
    for (const action of MOTION_ACTIONS) {
      const motion = resolveMotion({ stage, action, reduced: true })
      assert.equal(motion.src, motion.poster)
      assert.ok(motion.src.endsWith('.png'))
      const portrait = resolveMotion({ stage, action, portrait: true })
      if (['sleep', 'sleep-low', 'blanket', 'night-pat', 'hum'].includes(action)) assert.equal(portrait, null)
      else {
        assert.ok(faces.has(portrait.action), action)
        assert.equal(portrait.src, `/pet/motion/s${stage}-${portrait.action}-face.gif`)
        assert.equal(portrait.poster, `/pet/motion/s${stage}-${portrait.action}-face.png`)
        assert.equal(portrait.durationMs, resolveMotion({ stage, action: portrait.action }).durationMs)
      }
    }
    assert.equal(resolveMotion({ stage, sleeping: true, portrait: true }), null)
    assert.equal(resolveMotion({ stage, low: true, portrait: true }).action, 'think')
  }
})
