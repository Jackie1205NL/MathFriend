// 家长端与孩子端共用的约定：题库包格式、题型、金币与照顾规则、模板实例化。
// 家长端（server/kid.js）用它出题，孩子端后端（kid/server/game.js）用它判分，孩子端页面用它显示价格。
// 这个文件不能引用 server/ 或 kid/ 下的任何东西。

export const PACK_VERSION = 1
export const FORMATS = ['oral', 'first', 'clock', 'estimate', 'steps', 'fix', 'multi', 'word', 'plan']   // 孩子端遇到不认识的题型会跳过
export const FORMAT_NAME = { oral: '口算闪答', first: '先算哪一步', clock: '拨钟面', estimate: '先估后算', steps: '递等式分步', fix: '小老师改错', multi: '多空题交卷', word: '应用题三步', plan: '挑战题' }
export const BASE = { oral: 1, first: 2, clock: 4, estimate: 4, steps: 6, fix: 6, multi: 6, word: 12, plan: 25 }   // 题越长，每分钟赚得略多
export const MIN_SECONDS = { oral: 2, first: 3, clock: 4, estimate: 3, steps: 4, fix: 5, multi: 8, word: 8, plan: 10 }   // 比这还快又答错，算「急着答错」
export const HAS_PROCESS_BONUS = ['word', 'steps', 'estimate', 'multi', 'plan']   // 这些题型过程做全有 +2
export const LEVELS = ['同构', '略变', '综合']
// 难度阶梯：档位 0 / 1 / 2 时，抽题在三种难度上的比例
export const LEVEL_MIX = [[0.6, 0.3, 0.1], [0.4, 0.4, 0.2], [0.2, 0.5, 0.3]]
export const STORY_PAGES = 16
export const BOSS_SIZE = 8, BOSS_PASS = 6, BOSS_COINS = 30   // 周五闯关：8 题，答对 6 题算通关
export const EXTRA_STEP = 5                                   // 加练一次加几题（金币减半）
// 围巾戴在哪：各阶段站立图里项圈的位置（占图片宽高的百分比），由 kid/public/pet/s1～s4.webp 量出来
export const SCARF_AT = { 1: { x: 41.1, y: 60.4, w: 37 }, 2: { x: 31.7, y: 57.3, w: 32.8 }, 3: { x: 34.2, y: 57.2, w: 36.8 }, 4: { x: 32.1, y: 54, w: 32.8 } }
export const DIFF = { 同构: 1, 略变: 1.3, 综合: 1.6 }
export const SRC = { 本周重点: 1.5, 往周未过关: 1.2, 下周预习: 1, 已掌握保温: 0.8 }
export const ERROR_TYPES = ['计算失误', '审题', '概念不清', '格式规范', '漏题', '策略缺失']
export const SKILLS = [
  { k: '审题', n: '灵鼻子', s: '审题', badge: 'nose', d: '你圈对关键词时，它会凑过去嗅一嗅，跟着指出来。' },
  { k: '概念不清', n: '排排队', s: '运算顺序', badge: 'queue', d: '它会把先算的那块积木叼起来。' },
  { k: '计算失误', n: '稳稳爪', s: '计算', badge: 'paw', d: '算完先用爪子比一比，估估有几位数。' },
  { k: '格式规范', n: '收尾巴', s: '答句单位', badge: 'tail', d: '答句和单位一个不落，最后摇一下尾巴。' },
  { k: '漏题', n: '巡逻', s: '检查', badge: 'patrol', d: '交卷前绕着作业跑一圈。一整天没有急着答错的题，得 1 点。' },
  { k: '策略缺失', n: '探路', s: '找规律', badge: 'path', d: '画图、列表、找规律。' },
]
export const SKILL_COST = [3, 6, 10]
export const GOODS = [
  { k: 'cookie', n: '骨头饼干', d: '饱食 ＋10', p: 10, kind: 'food', full: 10 },
  { k: 'rice', n: '鸡肉蔬菜饭', d: '饱食 ＋35', p: 40, kind: 'food', full: 35 },
  { k: 'bento', n: '豪华便当', d: '饱食 ＋70，心情 ＋10', p: 80, kind: 'food', full: 70, mood: 10 },
  { k: 'soap', n: '泡泡香皂', d: '洗一次澡，清洁 ＋50', p: 30, kind: 'soap', clean: 50 },
  { k: 'ball', n: '橡胶小球', d: '能玩 4 次，每次心情 ＋15', p: 50, kind: 'toy', uses: 4, mood: 15 },
  { k: 'disc', n: '飞盘', d: '能玩 5 次，每次心情 ＋20', p: 80, kind: 'toy', uses: 5, mood: 20 },
  { k: 'scarf', n: '蓝围巾', d: '装扮，买了就戴上', p: 220, kind: 'keep' },
  { k: 'curtain', n: '小窗帘', d: '小屋家具', p: 400, kind: 'keep' },
]
export const DECAY = { full: 40, mood: 35, clean: 25 }            // 每天下降多少
export const NEED_FLOOR = 20
export const PATS_PER_DAY = 3
export const STAGES = [{ n: '小窝', at: 0 }, { n: '幼犬', at: 0 }, { n: '少年', at: 2500 }, { n: '青年', at: 7000 }, { n: '成年', at: 13500 }]
export const stageOf = s => !s.hatched ? 0 : s.grow < 2500 ? 1 : s.grow < 7000 ? 2 : s.grow < 13500 ? 3 : 4
export const levelOf = grow => 1 + Math.floor(grow / 400)

/** 一道题答对后给多少金币。q：首答 1，订正 0.5（选择类 0.3），看讲解后 0.3，没答对 0；pb：过程奖。 */
export function coinsFor(price, q, pb = 0) {
  const core = q ? Math.max(1, Math.round(price * q)) : 0
  return { core, c: core + (q ? pb : 0) }
}
export const priceOf = (format, level, bucket, boost) => BASE[format] * (DIFF[level] || 1) * (bucket === '本周重点' && boost ? boost : SRC[bucket] || 1)
export const maxCoins = it => Math.round(it.price) + (HAS_PROCESS_BONUS.includes(it.format) ? 2 : 0)

// ---------- 模板实例化 ----------
const hashStr = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0 }
const rng = seed => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

/** 只允许数字、四则运算、括号和比较，算式里的 × ÷ − 会先换成 JS 写法。 */
export function evalExpr(expr) {
  const js = String(expr).replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/（/g, '(').replace(/）/g, ')').replace(/\s/g, '')
  if (!/^[\d+\-*/%().<>=!&|]+$/.test(js)) return NaN
  try { const v = Function(`"use strict";return (${js})`)(); return typeof v === 'boolean' ? v : Number(v) } catch { return NaN }
}
const fill = (s, v) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m)
export const pretty = s => String(s).replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\s*([+−×÷])\s*/g, ' $1 ').trim()
const okAnswer = a => Number.isInteger(a) && a >= 0 && a < 100000

/**
 * 把一个模板实例化成多道题。返回 { items, problems }，problems 是出不来题的原因（给 Claude 看着改模板）。
 * slots：[lo, hi] 两个整数是整数范围；其他数组是从里面挑一个；"=表达式" 是派生值（按书写顺序计算）。
 */
export function instantiate(t, group, week, boost, n = t.count || 25) {
  const r = rng(hashStr(`${week}|${t.id}`)), pick = a => a[Math.floor(r() * a.length)]
  const items = [], seen = new Set(), problems = {}
  const bad = why => { problems[why] = (problems[why] || 0) + 1 }
  if (!FORMATS.includes(t.format)) return { items, problems: { [`题型 ${t.format} 还不支持`]: 1 } }
  for (let tries = 0; items.length < n && tries < n * 80; tries++) {
    const v = {}
    for (const [k, spec] of Object.entries(t.slots || {})) {
      if (typeof spec === 'string' && spec.startsWith('=')) { v[k] = evalExpr(fill(spec.slice(1), v)); continue }
      v[k] = Array.isArray(spec) && spec.length === 2 && spec.every(Number.isInteger) ? spec[0] + Math.floor(r() * (spec[1] - spec[0] + 1)) : pick(spec)
    }
    if (Object.values(v).some(x => typeof x === 'number' && !Number.isFinite(x))) { bad('派生槽算不出来'); continue }
    if (!(t.where || []).every(w => evalExpr(fill(w, v)) === true)) { bad('不满足 where'); continue }
    const item = { format: t.format, level: t.level, hint: fill(t.hint, v), explain: fill(t.explain, v) }
    if (t.format === 'oral') {
      item.text = pretty(fill(t.text || t.expression, v)); item.answer = evalExpr(fill(t.expression, v))
      item.traps = (t.traps || []).map(x => ({ value: evalExpr(fill(x.e, v)), error_type: x.error_type || t.error_type })).filter(x => okAnswer(x.value) && x.value !== item.answer)
    } else if (t.format === 'first') {
      item.tokens = t.tokens.map(x => pretty(fill(x, v))); item.first = t.first
      if (!/^[+−×÷]$/.test(item.tokens[t.first] || '')) { bad('first 指的不是运算符'); continue }
      item.answer = evalExpr(item.tokens.join(''))                     // 只用来确认整道题能整除、结果合理
    } else if (t.format === 'clock') {
      // 拨时针：答案是钟面上的位置 0～23（每半小时一格）。几时半最容易错成指在整点上
      const h = Number(fill(t.hour, v)), half = Number(t.minute) === 30 ? 1 : 0
      if (!Number.isInteger(h) || h < 0 || h > 24) { bad('hour 不是 0～24 的整数'); continue }
      item.minute = half ? 30 : 0; item.answer = (h % 12) * 2 + half
      item.text = fill(t.text, v) || `把时针拨到 ${h}:${half ? '30' : '00'} 的位置`
      item.traps = half ? [{ value: (h % 12) * 2, error_type: t.error_type }] : []
    } else if (t.format === 'estimate') {
      // 先估后算：三个连在一起的范围由程序生成，正确范围的位置随机
      item.text = pretty(fill(t.text || t.expression, v)); item.answer = evalExpr(fill(t.expression, v))
      if (!okAnswer(item.answer)) { bad('答案不是万以内的非负整数'); continue }
      const a = item.answer, step = a >= 1000 ? 1000 : a >= 100 ? 100 : 10, lo = Math.floor(a / step) * step
      const start = Math.max(0, lo - step * Math.floor(r() * 3))
      item.ranges = [0, 1, 2].map(i => ({ t: `${start + i * step} ～ ${start + (i + 1) * step - 1}`, ...(start + i * step === lo ? { ok: 1 } : {}) }))
      item.traps = (t.traps || []).map(x => ({ value: evalExpr(fill(x.e, v)), error_type: x.error_type || t.error_type })).filter(x => okAnswer(x.value) && x.value !== a)
    } else if (t.format === 'steps') {
      // 递等式分步：一行填一个数，最后一行就是得数
      item.text = pretty(fill(t.expression, v))
      item.lines = t.lines.map(l => ({ pre: fill(l.pre, v), a: evalExpr(fill(l.e, v)), hint: fill(l.hint, v),
        traps: (l.traps || []).map(x => ({ value: evalExpr(fill(x.e, v)), error_type: x.error_type || t.error_type })).filter(x => okAnswer(x.value)) }))
      if (item.lines.some(l => !okAnswer(l.a))) { bad('某一行不是万以内的非负整数'); continue }
      item.answer = item.lines.at(-1).a
      if (evalExpr(fill(t.expression, v)) !== item.answer) { bad('最后一行和算式结果对不上'); continue }
    } else if (t.format === 'fix') {
      // 小老师改错：shown 是一份有错的递等式，bad 是第一处算错的那一行，孩子点出来再填正确得数
      item.text = pretty(fill(t.expression, v)); item.answer = evalExpr(fill(t.expression, v))
      item.shown = t.shown.map(x => fill(x, v)); item.bad = t.bad
      if (!(Number.isInteger(t.bad) && t.bad >= 0 && t.bad < item.shown.length)) { bad('bad 不是 shown 里的行号'); continue }
    } else if (t.format === 'multi') {
      // 多空题：一屏几个空，□ 是要填的位置
      item.text = fill(t.text, v)
      item.blanks = t.blanks.map(b => ({ t: fill(b.t, v), a: evalExpr(fill(b.e, v)) }))
      if (item.blanks.some(b => !okAnswer(b.a))) { bad('某个空的答案不是万以内的非负整数'); continue }
      item.answer = item.blanks[0].a
    } else {
      // word：圈关键词开头；plan（挑战题）：先选「要先求什么」开头。后两步都是选算式、算和答
      if (t.format === 'plan') {
        item.text = fill(t.text, v); item.goals = t.goals.map(g => ({ t: fill(g.t, v), ...(g.ok ? { ok: 1 } : {}) }))
        if (item.goals.filter(g => g.ok).length !== 1) { bad('goals 里必须正好一个 ok'); continue }
      } else item.segs = t.segs.map(s => ({ t: fill(s.t, v), ...(s.k ? { k: 1 } : {}), ...(s.n ? { n: 1 } : {}) }))
      item.choices = t.choices.map(c => ({ t: pretty(fill(c.e, v)), v: evalExpr(fill(c.e, v)), ...(c.ok ? { ok: 1 } : {}), trap: c.trap || t.error_type }))
      const ok = item.choices.filter(c => c.ok)
      if (ok.length !== 1) { bad('choices 里必须正好一个 ok'); continue }
      if (new Set(item.choices.map(c => c.t)).size !== item.choices.length) { bad('选项重复'); continue }
      item.answer = ok[0].v
      item.traps = item.choices.filter(c => !c.ok && okAnswer(c.v) && c.v !== item.answer).map(c => ({ value: c.v, error_type: c.trap }))
      item.choices = item.choices.map(({ t: text, ok: o, v: val }) => ({ t: text, v: val, ...(o ? { ok: 1 } : {}) }))
      Object.assign(item, { ask: fill(t.ask, v), unit: t.unit, units: t.units, tail: fill(t.tail, v), why: fill(t.why, v) })
      if (!t.units?.includes(t.unit)) { bad('units 里没有正确单位'); continue }
    }
    if (!okAnswer(item.answer)) { bad('答案不是万以内的非负整数'); continue }
    const key = JSON.stringify([item.text, item.tokens, item.segs?.map(s => s.t), item.lines?.map(l => l.pre + l.a), item.shown, item.blanks?.map(b => b.t)])
    if (seen.has(key)) { bad('重复'); continue }
    seen.add(key)
    items.push({ id: `${week.slice(5)}-${t.id}-${String(items.length + 1).padStart(3, '0')}`, tpl: t.id, group: group.id, bucket: group.bucket,
      kp: t.knowledge_point, err: t.error_type, price: Math.round(priceOf(t.format, t.level, group.bucket, boost) * 100) / 100, ...item })
  }
  return { items, problems }
}

/** 由周 md 里的「题库」（{ groups, templates, tuning }）生成题库包。 */
export function buildPack(bank, week) {
  const report = []
  const items = bank.templates.flatMap(t => {
    const g = bank.groups.find(x => x.id === t.group)
    if (!g) { report.push({ id: t.id, made: 0, problems: { [`没有分组 ${t.group}`]: 1 } }); return [] }
    const { items, problems } = instantiate(t, g, week, Number(bank.tuning?.focus_boost) || 0)
    report.push({ id: t.id, made: items.length, problems })
    return items
  })
  return { pack: { v: PACK_VERSION, week, created: new Date().toISOString(), tuning: { unit_hint: 1, blank_hint: 1, slow: 1, boss_day: 5, bedtime: '20:30', ...bank.tuning }, groups: bank.groups, items }, report }
}

/** 发给孩子端页面的题目：去掉答案、陷阱值、关键词标记和正确选项。 */
export function publicItem(it) {
  const p = { id: it.id, group: it.group, format: it.format, level: it.level, err: it.err, max: maxCoins(it) }
  if (it.format === 'oral') p.text = it.text
  if (it.format === 'first') p.tokens = it.tokens
  if (it.format === 'clock') Object.assign(p, { text: it.text, minute: it.minute })
  if (it.format === 'estimate') Object.assign(p, { text: it.text, ranges: it.ranges.map(x => x.t) })
  if (it.format === 'steps') Object.assign(p, { text: it.text, lines: it.lines.map(l => l.pre) })
  if (it.format === 'fix') Object.assign(p, { text: it.text, shown: it.shown })
  if (it.format === 'multi') Object.assign(p, { text: it.text, blanks: it.blanks.map(b => b.t) })
  if (it.format === 'plan') Object.assign(p, { text: it.text, goals: it.goals.map(g => g.t), choices: it.choices.map(c => c.t), ask: it.ask, units: it.units, tail: it.tail })
  if (it.format === 'word') Object.assign(p, { segs: it.segs.map(s => ({ t: s.t })), choices: it.choices.map(c => c.t), ask: it.ask, units: it.units, tail: it.tail })
  return p
}
