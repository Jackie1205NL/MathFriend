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
// 技能点：做出这个习惯攒一次，攒满 SKILL_EVERY 次得 1 点，每个本领每天最多 1 点（巡逻另算：一整天没有急着答错得 1 点）。
// 目标：常练的本领 1 级在第 2～3 周、2 级在第 6～8 周、3 级在第 12～14 周。上线后按真实数据调。
export const SKILL_EVERY = { 审题: 9, 概念不清: 9, 计算失误: 12, 格式规范: 12, 策略缺失: 3 }
// 本领在答题时：1 级提醒每天 3 次，2 级帮忙每天 1 次，3 级守护每周 1 次（每个本领单独算）。孩子点了才用。
export const SKILL_USES = { 1: 3, 2: 1, 3: 1 }
// 每种积木上哪些本领的徽章会亮；L2 是 2 级「帮忙」能用的积木（其他积木上 2 级用不上）
export const SKILL_AT = { 审题: ['circle', 'build', 'goal'], 概念不清: ['build', 'chain'], 计算失误: ['chain', 'say', 'fill', 'range', 'blanks'], 格式规范: ['say'], 漏题: ['say', 'blanks', 'spot'], 策略缺失: ['goal', 'build'] }
export const SKILL_L2 = { 审题: ['circle'], 概念不清: ['chain'], 计算失误: ['chain', 'say', 'fill'], 格式规范: ['say'], 漏题: ['say', 'blanks'], 策略缺失: ['goal'] }
// 题型默认由哪些积木拼成；word / plan 的模板可以写 flow 改（只能从默认里删步骤，不能换顺序）
export const FLOWS = { oral: ['fill'], first: ['first'], clock: ['clock'], estimate: ['range', 'fill'], steps: ['chain'], fix: ['spot', 'fill'], multi: ['blanks'], word: ['circle', 'build', 'chain', 'say'], plan: ['goal', 'build', 'chain', 'say'] }
export const STEP_NAME = { fill: '填得数', first: '先算哪一步', clock: '拨时针', range: '估一估', chain: '一行一行算', spot: '找错行', blanks: '填空', circle: '圈关键词', goal: '先求什么', build: '列式', say: '写答句' }
export const GOODS = [
  { k: 'cookie', n: '骨头饼干', d: '饱食 ＋10', p: 10, kind: 'food', full: 10 },
  { k: 'rice', n: '鸡肉蔬菜饭', d: '饱食 ＋35', p: 40, kind: 'food', full: 35 },
  { k: 'bento', n: '豪华便当', d: '饱食 ＋70，心情 ＋10', p: 80, kind: 'food', full: 70, mood: 10 },
  { k: 'soap', n: '泡泡香皂', d: '洗一次澡，清洁 ＋50', p: 30, kind: 'soap', clean: 50 },
  { k: 'ball', n: '橡胶小球', d: '能玩 4 次，每次心情 ＋15', p: 50, kind: 'toy', uses: 4, mood: 15 },
  { k: 'disc', n: '飞盘', d: '能玩 5 次，每次心情 ＋20', p: 80, kind: 'toy', uses: 5, mood: 20 },
  { k: 'scarf', n: '蓝围巾', d: '装扮，买了就戴上', p: 220, kind: 'keep', img: 1 },
  { k: 'curtain', n: '小窗帘', d: '小屋家具', p: 400, kind: 'keep', img: 1 },
  // 地点摆设：地方开放后才能买，买了摆在那里
  { k: 'house', n: '木头狗屋', d: '摆在院子', p: 450, kind: 'keep', place: 'yard' },
  { k: 'swing', n: '枫树秋千', d: '摆在院子', p: 350, kind: 'keep', place: 'yard' },
  { k: 'flower', n: '小花坛', d: '摆在院子', p: 200, kind: 'keep', place: 'yard' },
  { k: 'kite', n: '风筝', d: '摆在公园', p: 300, kind: 'keep', place: 'park' },
  { k: 'mat', n: '野餐垫', d: '摆在公园', p: 250, kind: 'keep', place: 'park' },
  { k: 'pond', n: '小水池', d: '摆在公园', p: 450, kind: 'keep', place: 'park' },
  { k: 'snowman', n: '雪人', d: '摆在雪山', p: 250, kind: 'keep', place: 'snow' },
  { k: 'sled', n: '小雪橇', d: '摆在雪山', p: 400, kind: 'keep', place: 'snow' },
  { k: 'stove', n: '围炉', d: '摆在雪山', p: 350, kind: 'keep', place: 'snow' },
  // 月度限定：只在当月卖
  { k: 'bow', n: '枫叶领结', d: '装扮，戴在项圈上', p: 180, kind: 'keep', month: 10 },
  { k: 'hat', n: '毛线帽', d: '装扮，冬天戴', p: 220, kind: 'keep', month: 11 },
  { k: 'pillow', n: '饺子抱枕', d: '放在小屋里', p: 160, kind: 'keep', month: 12 },
  { k: 'lantern', n: '小红灯笼', d: '挂在小屋里', p: 200, kind: 'keep', month: 1 },
]
export const DECAY = { full: 25, mood: 22, clean: 15 }            // 每天下降多少，照顾一天约 55 金币
export const NEED_FLOOR = 20
export const PATS_PER_DAY = 3
export const POSE_MS = 4500                                        // 动作图停留多久

// ---------- 学期 ----------
// 一个学期一份配置。下学期只换这里（id 不同就会让旧宠物毕业、住进老朋友墙）和素材。
// 长大要同时满足：陪伴天数够了（做完当天任务算 1 天，周末也算），并且到了最早日期。
export const SEASON = {
  id: '2026-秋', pet: '柴犬',
  start: '2026-10-05', finale: '2027-01-20', ceremony: '2027-01-22',
  end: '2027-01-22',            // 这天以后陪伴天数不再增加
  next: '2027-02-22',           // 下学期开学（家长确认后改）：换新宠物
  stages: [
    { n: '小窝' },
    { n: '幼犬', days: 0, from: '2026-10-05', place: 'home' },
    { n: '少年', days: 10, from: '2026-10-24', place: 'yard' },
    { n: '青年', days: 26, from: '2026-11-21', place: 'park' },
    { n: '成年', days: 42, from: '2026-12-26', place: 'snow' },
  ],
}
export const STAGES = SEASON.stages
/** 当前阶段：0 小窝，1～4 幼犬到成年。minStage 是旧存档迁移时保留的阶段，不退回。 */
export function stageOf(s, date) {
  if (!s.hatched) return 0
  let st = 1
  for (let i = 2; i < STAGES.length; i++) if ((s.days || 0) >= STAGES[i].days && date >= STAGES[i].from) st = i
  return Math.max(st, Math.min(4, s.minStage || 0))
}
export const PLACES = [
  { k: 'home', n: '小屋', st: 1, sub: '一开始就有' },
  { k: 'yard', n: '院子', st: 2, trip: 0, sub: '秋天的落叶和木栅栏', finds: ['一片很红的枫叶', '一颗圆圆的橡子', '一根小树枝'] },
  { k: 'park', n: '公园', st: 3, trip: 20, sub: '草坡、风筝和小池塘', finds: ['一根漂亮的羽毛', '一颗松果', '一片银杏叶'] },
  { k: 'snow', n: '雪山', st: 4, trip: 30, sub: '冬天的雪地和松树', finds: ['一个圆滚滚的雪球', '一串小鸟脚印', '一颗冻住的松果'] },
  { k: 'hall', n: '毕业礼堂', finale: true, sub: '1 月 20 日开放，周五 1/22 毕业典礼' },
]
export const placeOpen = (p, st, date) => p.finale ? date >= SEASON.finale : st >= p.st
export const TRIP_MOOD = 20
export const JAR = { goal: 1500, step: 100, sig: 10 }              // 储蓄罐「毕业旅行基金」，10 枚可兑换 1 个签名（只显示，不取出）
// 明信片：每个地方 4 张，页面用代码画（地点插画 + 天气或时间 v）
export const POSTCARDS = {
  yard: [{ t: '院子里的第一片红叶', v: 'sun' }, { t: '和{name}一起扫落叶', v: 'leaves' }, { t: '傍晚的木栅栏', v: 'dusk' }, { t: '小鸟飞过枫树', v: 'birds' }],
  park: [{ t: '公园的早晨', v: 'sun' }, { t: '雨后的彩虹', v: 'rainbow' }, { t: '一群小鸟', v: 'birds' }, { t: '草坡上看星星', v: 'night' }],
  snow: [{ t: '第一场雪', v: 'snow' }, { t: '雪地里的太阳', v: 'sun' }, { t: '傍晚的雪山', v: 'dusk' }, { t: '冬夜的星空', v: 'night' }],
}
export const addDays = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10)
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
const hashDay = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h }
/** 明信片日：按学期种子排好，从第 3 天起，每张之后隔 1 或 2 天出下一张。 */
export const POSTCARD_DAYS = (() => { const out = []; for (let d = addDays(SEASON.start, 2); d <= SEASON.next; d = addDays(d, 2 + hashDay(SEASON.id + d) % 2)) out.push(d); return out })()
// 把戏：学会一级本领多一个（复用动作图），台词里 {kid} 是孩子的名字
export const TRICKS = [
  { k: '计算失误', n: '握手', pose: 'shake', say: '握握手！{kid}，算完先用爪子比一比。' },
  { k: '审题', n: '嗅嗅找东西', anim: 'sniff', say: '嗅嗅嗅……关键词就藏在这里！' },
  { k: '格式规范', n: '摇尾巴转圈', pose: 'wag', anim: 'spin', say: '答句写完、单位带上，最后摇一下尾巴！' },
  { k: '漏题', n: '绕小屋巡逻', anim: 'walk', say: '绕小屋跑一圈，看看有没有落下的。' },
  { k: '概念不清', n: '叼积木排队', pose: 'catch', say: '先算括号里的，我把这块叼到最前面。' },
  { k: '策略缺失', n: '带路', pose: 'catch', anim: 'hop', say: '跟我来，下一站在地图上亮着呢！' },
]
/** 每日小事件：按日期，每天最多一件。奖励 5 金币或一张照片（记进日记）。 */
export function eventOf(date, extraBlocks) {
  const m = +date.slice(5, 7), md = date.slice(5)
  if (extraBlocks && hashDay('blk' + date) % 3 === 0) return { k: 'blocks', t: '积木撒了一地', b: '帮它排排队', done: '积木按从小到大排好了，{name}一块一块叼回盒子里。' }
  if (m === 10) return { k: 'leaf', t: '窗外飘进来几片落叶', b: '扫一扫', done: '扫干净了！最红的那片，{name}夹进了日记里。' }
  if (m === 11) return { k: 'bird', t: '一只小麻雀落在窗台上', b: '撒点面包屑', done: '小麻雀吃饱飞走了，{name}看了好久。' }
  if (md >= '12-21' && md <= '12-22') return { k: 'dumpling', t: '冬至到了，一起包饺子', b: '包一个', done: '包了一个歪歪的饺子，{name}说最好看。' }
  if (m === 12) return { k: 'snow', t: '下雪啦！', b: '堆个小雪球', done: '雪球圆滚滚的，{name}用鼻子顶来顶去。' }
  if (m === 1 && md <= '01-03') return { k: 'calendar', t: '新年到了，挂上新日历', b: '挂起来', done: '新日历挂好了，{name}在 1 月 22 日上画了个圈。' }
  if (m === 1 || m === 2) return { k: 'couplet', t: '快过年了，写一副春联', b: '帮忙按纸', done: '春联贴好啦，{name}的爪印也在上面。' }
  return null
}
export const EVENT_COINS = 5
/** 名字：去掉控制字符和尖括号，最多 6 个字。页面显示前还会转义。 */
export const cleanName = v => [...String(v ?? '').replace(/[\u0000-\u001f<>&"'`]/g, '').trim()].slice(0, 6).join('')

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

// ---------- 算式：两端共用（页面生成递等式，后端判分） ----------
// 算式写成记号数组：数是 number，符号是 '+' '−' '×' '÷' '(' ')'
export const isOp = x => typeof x === 'string' && '+−×÷'.includes(x)
const isNum = x => typeof x === 'number'
/** "100 − 12 × 3" → [100, '−', 12, '×', 3] */
export const toTokens = str => (String(str).replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/（/g, '(').replace(/）/g, ')').match(/\d+|[+−×÷()]/g) || []).map(x => /\d/.test(x) ? Number(x) : x)
export const showExpr = t => (t || []).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')')
export function validExpr(t) {
  let i = 0
  const term = () => { if (isNum(t[i])) { i++; return true } if (t[i] === '(') { i++; if (!expr()) return false; if (t[i] !== ')') return false; i++; return true } return false }
  const expr = () => { if (!term()) return false; while (isOp(t[i])) { i++; if (!term()) return false } return true }
  return Array.isArray(t) && t.length > 0 && expr() && i === t.length
}
export const calcOp = (a, op, b) => op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : b && a % b === 0 ? a / b : NaN
/** 去掉只包着一个数的括号 */
export function stripParens(t) { t = [...t]; for (let i = 0; i + 2 < t.length; i++) if (t[i] === '(' && isNum(t[i + 1]) && t[i + 2] === ')') { t.splice(i, 3, t[i + 1]); i = -1 } return t }
/** 该先算的运算符的下标：最里面的括号，再乘除，再加减，都从左往右 */
export function nextOp(t) {
  let lo = 0, hi = t.length - 1
  const j = t.indexOf(')'); if (j >= 0) { hi = j - 1; lo = t.lastIndexOf('(', j) + 1 }
  for (const set of ['×÷', '+−']) for (let k = lo; k <= hi; k++) if (isOp(t[k]) && set.includes(t[k])) return k
  return -1
}
/** 能点的符号：两边都是数 */
export const canTap = (t, k) => isOp(t[k]) && isNum(t[k - 1]) && isNum(t[k + 1])
/** 算 t 里第 k 个符号，返回下一行 */
export const reduceAt = (t, k, v = calcOp(t[k - 1], t[k], t[k + 1])) => stripParens([...t.slice(0, k - 1), v, ...t.slice(k + 2)])
/** 按正确顺序算到底，返回递等式各行 [{ t, k, v }]；算不下去（除不尽、负数）返回 null */
export function exprSteps(t) {
  if (!validExpr(t)) return null
  t = stripParens(t); const out = []
  while (t.length > 1) { const k = nextOp(t); if (k < 0) return null; const v = calcOp(t[k - 1], t[k], t[k + 1]); if (!Number.isInteger(v) || v < 0) return null; out.push({ t, k, v }); t = reduceAt(t, k, v) }
  return out
}
export function exprValue(t) { if (!validExpr(t)) return NaN; const st = exprSteps(t); return st ? (st.length ? st.at(-1).v : stripParens(t)[0]) : NaN }
const sameNums = (a, b) => JSON.stringify(a.filter(isNum).sort((x, y) => x - y)) === JSON.stringify(b.filter(isNum).sort((x, y) => x - y))
export { sameNums }

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
      item.traps = (t.traps || []).map(x => ({ value: evalExpr(fill(x.e, v)), error_type: x.error_type || t.error_type, say: fill(x.say, v) })).filter(x => okAnswer(x.value) && x.value !== item.answer)
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
      item.traps = (t.traps || []).map(x => ({ value: evalExpr(fill(x.e, v)), error_type: x.error_type || t.error_type, say: fill(x.say, v) })).filter(x => okAnswer(x.value) && x.value !== a)
    } else if (t.format === 'steps') {
      // 递等式分步：一行填一个数，最后一行就是得数
      item.text = pretty(fill(t.expression, v))
      item.lines = t.lines.map(l => ({ pre: fill(l.pre, v), a: evalExpr(fill(l.e, v)), hint: fill(l.hint, v),
        traps: (l.traps || []).map(x => ({ value: evalExpr(fill(x.e, v)), error_type: x.error_type || t.error_type, say: fill(x.say, v) })).filter(x => okAnswer(x.value)) }))
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
      item.choices = t.choices.map(c => ({ t: pretty(fill(c.e, v)), v: evalExpr(fill(c.e, v)), ...(c.ok ? { ok: 1 } : {}), trap: c.trap || t.error_type, say: fill(c.say, v) }))
      const ok = item.choices.filter(c => c.ok)
      if (ok.length !== 1) { bad('choices 里必须正好一个 ok'); continue }
      if (new Set(item.choices.map(c => c.t)).size !== item.choices.length) { bad('选项重复'); continue }
      item.answer = ok[0].v
      item.traps = [...item.choices.filter(c => !c.ok && okAnswer(c.v) && c.v !== item.answer).map(c => ({ value: c.v, error_type: c.trap, say: c.say })),
        ...(t.traps || []).map(x => ({ value: evalExpr(fill(x.e, v)), error_type: x.error_type || t.error_type, say: fill(x.say, v) })).filter(x => okAnswer(x.value) && x.value !== item.answer)]
      item.choices = item.choices.map(({ t: text, ok: o, v: val }) => ({ t: text, v: val, ...(o ? { ok: 1 } : {}) }))
      // 拼算式用的数字卡：正确算式里的每个数，标出它在题干哪一段；再找一张用不上的干扰卡（第 2 档用）
      const okT = toTokens(ok[0].t)
      if (!exprSteps(okT)) { bad('正确算式算不下去（除不尽或出现负数）'); continue }
      const used = new Set(), segOf = n => { const i = (item.segs || []).findIndex((sg, j) => !used.has(j) && new RegExp(`(^|\\D)${n}(\\D|$)`).test(sg.t)); if (i >= 0) used.add(i); return i }
      item.chips = okT.filter(x => typeof x === 'number').map(n => ({ v: n, seg: segOf(n) }))
      const have = new Set(item.chips.map(c => c.v))
      const noise = (item.segs || []).flatMap((sg, i) => sg.n ? (sg.t.match(/\d+/g) || []).map(n => ({ v: +n, seg: i })) : []).find(c => !have.has(c.v))
      const other = item.choices.flatMap(c => toTokens(c.t)).find(x => typeof x === 'number' && !have.has(x))
      item.decoy = noise || (other != null ? { v: other, seg: -1 } : null)
      if (t.flow) { if (!Array.isArray(t.flow) || t.flow.some((b, i) => !FLOWS[t.format].includes(b) || (i && FLOWS[t.format].indexOf(b) < FLOWS[t.format].indexOf(t.flow[i - 1]))) || !t.flow.includes('say')) { bad('flow 只能从默认积木里删步骤，并且要有 say'); continue } item.flow = t.flow }
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

/**
 * 发给孩子端页面的题目：去掉答案、陷阱值、关键词标记和正确选项。题目按积木 flow 发，每块只带这一步要显示的东西。
 * o.tier：拼算式的档位（0 选算式、1 拼算式、2 加一张干扰卡），由后端按孩子最近的状态定。
 */
export function publicItem(it, o = {}) {
  const p = { id: it.id, group: it.group, format: it.format, level: it.level, err: it.err, max: maxCoins(it) }
  if (it.format === 'word') p.segs = it.segs.map(s => ({ t: s.t }))
  if (['plan', 'clock', 'multi'].includes(it.format)) p.text = it.text
  const tier = it.level === '同构' ? Math.min(1, o.tier ?? 1) : o.tier ?? 1
  p.flow = (it.flow || FLOWS[it.format]).map(type => {
    if (type === 'fill') return { type, text: it.format === 'fix' ? '' : it.text }
    if (type === 'first') return { type, tokens: it.tokens }
    if (type === 'clock') return { type, minute: it.minute }
    if (type === 'range') return { type, text: it.text, opts: it.ranges.map(x => x.t) }
    if (type === 'chain') return { type, ...(it.format === 'steps' ? { start: toTokens(it.text) } : {}) }
    if (type === 'spot') return { type, text: it.text, shown: it.shown }
    if (type === 'blanks') return { type, blanks: it.blanks.map(b => b.t) }
    if (type === 'circle') return { type }
    if (type === 'goal') return { type, opts: it.goals.map(g => g.t) }
    if (type === 'build') return tier === 0 || !it.chips ? { type, tier: 0, choices: it.choices.map(c => c.t) }
      : { type, tier, chips: [...it.chips, ...(tier === 2 && it.decoy ? [it.decoy] : [])].map((c, i) => [hashStr(it.id + i), c]).sort((a, b) => a[1].seg - b[1].seg || a[0] - b[0]).map(x => x[1]) }
    if (type === 'say') return { type, ask: it.ask, units: it.units, tail: it.tail }
    return { type }
  })
  return p
}
