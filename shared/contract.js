// 家长端与孩子端共用的约定：题库包格式、题型、金币与照顾规则、模板实例化。
// 家长端（server/kid.js）用它出题，孩子端后端（kid/server/game.js）用它判分，孩子端页面用它显示价格。
// 这个文件不能引用 server/ 或 kid/ 下的任何东西。

export const PACK_VERSION = 1
export const FORMATS = ['oral', 'first', 'word']                  // 第一期的三种题型；孩子端遇到不认识的题型会跳过
export const FORMAT_NAME = { oral: '口算闪答', first: '先算哪一步', word: '应用题三步' }
export const BASE = { oral: 1, first: 2, word: 12 }               // 题越长，每分钟赚得略多
export const MIN_SECONDS = { oral: 2, first: 3, word: 8 }         // 比这还快又答错，算「急着答错」
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
export const priceOf = (format, level, bucket) => BASE[format] * (DIFF[level] || 1) * (SRC[bucket] || 1)
export const maxCoins = it => Math.round(it.price) + (it.format === 'word' ? 2 : 0)

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
export function instantiate(t, group, week, n = t.count || 25) {
  const r = rng(hashStr(`${week}|${t.id}`)), pick = a => a[Math.floor(r() * a.length)]
  const items = [], seen = new Set(), problems = {}
  const bad = why => { problems[why] = (problems[why] || 0) + 1 }
  if (!FORMATS.includes(t.format)) return { items, problems: { [`题型 ${t.format} 第一期不支持`]: 1 } }
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
    } else {
      item.segs = t.segs.map(s => ({ t: fill(s.t, v), ...(s.k ? { k: 1 } : {}), ...(s.n ? { n: 1 } : {}) }))
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
    const key = JSON.stringify([item.text, item.tokens, item.segs?.map(s => s.t)])
    if (seen.has(key)) { bad('重复'); continue }
    seen.add(key)
    items.push({ id: `${week.slice(5)}-${t.id}-${String(items.length + 1).padStart(3, '0')}`, tpl: t.id, group: group.id, bucket: group.bucket,
      kp: t.knowledge_point, err: t.error_type, price: Math.round(priceOf(t.format, t.level, group.bucket) * 100) / 100, ...item })
  }
  return { items, problems }
}

/** 由周 md 里的「题库」（{ groups, templates, tuning }）生成题库包。 */
export function buildPack(bank, week) {
  const report = []
  const items = bank.templates.flatMap(t => {
    const g = bank.groups.find(x => x.id === t.group)
    if (!g) { report.push({ id: t.id, made: 0, problems: { [`没有分组 ${t.group}`]: 1 } }); return [] }
    const { items, problems } = instantiate(t, g, week)
    report.push({ id: t.id, made: items.length, problems })
    return items
  })
  return { pack: { v: PACK_VERSION, week, created: new Date().toISOString(), tuning: { unit_hint: 1, ...bank.tuning }, groups: bank.groups, items }, report }
}

/** 发给孩子端页面的题目：去掉答案、陷阱值、关键词标记和正确选项。 */
export function publicItem(it) {
  const p = { id: it.id, group: it.group, format: it.format, level: it.level, err: it.err, max: maxCoins(it) }
  if (it.format === 'oral') p.text = it.text
  if (it.format === 'first') p.tokens = it.tokens
  if (it.format === 'word') Object.assign(p, { segs: it.segs.map(s => ({ t: s.t })), choices: it.choices.map(c => c.t), ask: it.ask, units: it.units, tail: it.tail })
  return p
}
