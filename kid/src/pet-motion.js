// 已确认的两阶段动作包。两阶段各动作的总时长相同，不把制作清单带进页面。
const DURATION = Object.freeze({
  idle: 1800, look: 1200, sniff: 1000, blink: 900, 'stretch-yawn': 1600,
  wag: 1200, hop: 1000, wave: 1200, spin: 1400, think: 1300, 'low-rest': 1800,
  eat: 1600, bath: 1800, pat: 1200, shake: 1200, ball: 1800, disc: 1600,
  walk: 1600, 'carry-object': 1800, 'present-find': 1500, sleep: 2200,
  blanket: 2000, 'night-pat': 1800, hum: 2200, 'sleep-low': 2200,
  proud: 1000, 'shy-encourage': 1300, 'paw-craft': 1800,
})
const ALIASES = Object.freeze({
  giggle: 'wag', stretch: 'stretch-yawn', yawn: 'stretch-yawn', sleepy: 'stretch-yawn',
  happy: 'idle', thinking: 'think', shy: 'shy-encourage',
})
const NIGHT = new Set(['sleep', 'sleep-low', 'blanket', 'night-pat', 'hum'])
const PROUD = new Set(['proud', 'wag', 'hop', 'wave', 'spin', 'present-find'])

export const MOTION_ACTIONS = Object.freeze(Object.keys(DURATION))

// catch 必须由调用处按实际玩具区分 ball/disc；护理的 shake 也要明确换成 pat。
export function normalizeMotionAction(action) {
  if (typeof action !== 'string') return null
  return Object.hasOwn(DURATION, action) ? action : Object.hasOwn(ALIASES, action) ? ALIASES[action] : null
}

/** action 留空表示安静陪伴；显式交互播一次，计时和重复点击由页面管理。 */
export function resolveMotion({ stage, action, sleeping = false, low = false, away = false, reduced = false, portrait = false } = {}) {
  if (away || ![2, 3].includes(stage)) return null
  let loop = action == null || action === ''
  let selected = loop ? sleeping ? low ? 'sleep-low' : 'sleep' : low ? 'low-rest' : 'idle' : normalizeMotionAction(action)
  // 睡后只允许安静互动；旧的日间动作或延迟到达的请求不能把小狗叫醒。
  if (sleeping && !NIGHT.has(selected)) { selected = low ? 'sleep-low' : 'sleep'; loop = true }
  if (!selected || portrait && NIGHT.has(selected)) return null
  if (portrait) selected = selected === 'shy-encourage' ? selected : selected === 'think' || selected === 'low-rest' ? 'think' : PROUD.has(selected) ? 'proud' : 'idle'
  const base = `/pet/motion/s${stage}-${selected}${portrait ? '-face' : ''}`
  const poster = base + '.png'
  return { action: selected, src: base + (reduced ? '.png' : '.gif'), poster, durationMs: DURATION[selected], loop }
}
