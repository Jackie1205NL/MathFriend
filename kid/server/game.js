// 孩子端后端：判分、金币、照顾、存档都在这里，页面拿不到答案。
// 存储只要有 get(key) / set(key, value) 两个方法：线上是 Netlify Blobs（kid/functions/kid.mjs），本地开发是文件（kid/vite.config.js）。
import { FORMATS, MIN_SECONDS, SKILLS, SKILL_COST, GOODS, DECAY, NEED_FLOOR, PATS_PER_DAY, LEVELS, LEVEL_MIX, STORY_PAGES, BOSS_SIZE, BOSS_PASS, BOSS_COINS, EXTRA_STEP, STAGES,
  SEASON, PLACES, POSTCARDS, POSTCARD_DAYS, JAR, TRIP_MOOD, EVENT_COINS, coinsFor, publicItem, stageOf, placeOpen, eventOf, cleanName, addDays,
  SKILL_EVERY, SKILL_USES, SKILL_AT, SKILL_L2, FLOWS, STEP_NAME, flowOf, dailyOf, packDays, checkPack, LOG_FORMAT, toTokens, showExpr, validExpr, exprValue, exprSteps, sameNums, stripParens, nextOp, canTap, calcOp, reduceAt } from '../../shared/contract.js'

const DAY = 86400000
const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now)
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
const digest = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')
const cookies = req => Object.fromEntries((req.headers.get('cookie') || '').split(';').map(c => c.trim().split('=')))
const hash = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h }
const EXTRA = { id: 'extra', name: '再练一会儿', sub: '想多练就做，金币减半', bucket: '加练', extra: true }
const FRIDAY = { id: 'friday', name: '周五闯关', sub: `答对 ${BOSS_PASS} 题就通关，解锁一页故事`, bucket: '本周重点', boss: true, friday: true }
/** ISO 周，如 2026-W41 */
const isoWeek = date => { const d = new Date(date + 'T00:00:00Z'), w = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - w); const y = d.getUTCFullYear(); return `${y}-W${String(Math.ceil(((d - Date.UTC(y, 0, 1)) / DAY + 1) / 7)).padStart(2, '0')}` }

const freshState = () => ({ name: '', kid: '', hatched: false, coins: 60, grow: 0, needs: { full: 70, mood: 70, clean: 70, at: Date.now() },
  bag: { rice: 1, soap: 1 }, toy: {}, own: {}, combo: 0, best: 0, pats: { date: '', n: 0 }, ladder: {}, slow: 0, story: 0, att: { week: '', days: [] }, album: [],
  pts: Object.fromEntries(SKILLS.map(s => [s.k, 0])), prog: Object.fromEntries(SKILLS.map(s => [s.k, 0])), skill: Object.fromEntries(SKILLS.map(s => [s.k, 0])),
  // 第四期「学期之旅」
  season: SEASON.id, days: 0, lastDay: '', st: 0, minStage: 0, jar: 0, trip: null, cards: [], pcLast: '', gift: null, greet: '', event: '', hide: null,
  alumni: [], grad: '', qn: 0, months: {}, visited: [], lastSay: '',
  // 第五期：本领次数、列式档位、技能点每天上限
  uses: {}, tiers: {}, ptDay: {} })

/** 需求按时间慢慢下降，读的时候再算，不需要定时任务。 */
function decay(s, now = Date.now()) {
  const days = Math.max(0, (now - s.needs.at) / DAY)
  for (const k of Object.keys(DECAY)) if (s.needs[k] > NEED_FLOOR) s.needs[k] = Math.max(NEED_FLOOR, Math.round((s.needs[k] - DECAY[k] * days) * 10) / 10)
  s.needs.at = now
  return s
}
const good = s => ['full', 'mood', 'clean'].every(k => s.needs[k] >= 60)
const add = (s, k, v) => { s.needs[k] = Math.min(100, s.needs[k] + v) }
/** 日记：记一件值得留下的事 */
const mark = (s, date, t, extra = {}) => { s.album.push({ at: date, t, st: stageOf(s, date), ...extra }); if (s.album.length > 200) s.album.shift() }
/** 阶段变了就记一笔。返回新阶段（长大了）或 0。 */
function grow(s, date) {
  const st = stageOf(s, date), was = s.st || 0
  if (st <= was) return 0
  s.st = st
  if (was >= 1) { const p = PLACES.find(x => x.st === st); mark(s, date, `长成${STAGES[st].n}了${p ? `，${p.n}开放了` : ''}`); return st }
  return 0
}
/** 换学期：旧宠物住进老朋友墙，小窝留给新朋友。金币清零（余额记进毕业礼物）。 */
function newSeason(s) {
  if (s.hatched) s.alumni.push({ name: s.name, kid: s.kid, season: s.season, days: s.days, st: s.st || 1, grad: s.grad, coins: s.coins })
  const keep = { kid: s.kid, alumni: s.alumni, ladder: s.ladder, pts: s.pts, prog: s.prog, skill: s.skill, best: s.best, story: 0 }
  return { ...freshState(), ...keep, coins: 0, gift: { date: '', what: null, left: s.coins } }
}
/** 第四期以前的存档：按已经做完任务的天数（答题流水里有记录的日期数）折算陪伴天数；旧规则下已经长到的阶段保留，不退回。 */
async function migrate(s, load, date) {
  const days = new Set()
  for (let d = addDays(SEASON.start, -28); d <= date; d = addDays(d, 7)) for (const r of await load(`log:${isoWeek(d)}`, [])) days.add(r.day)
  s.days = days.size; s.lastDay = [...days].sort().at(-1) || ''
  s.minStage = !s.hatched ? 0 : s.grow < 2500 ? 1 : s.grow < 7000 ? 2 : s.grow < 13500 ? 3 : 4
  s.st = Math.max(stageOf(s, date), s.minStage); s.season = SEASON.id
  return s
}
/** 藏骨头：三只杯子各一个算式，线索是其中一个的得数。稳稳爪 2 级可以选「难一点」（两步算式）。 */
function makeHide(date, hard) {
  for (let salt = 0; ; salt++) {
    const r = k => (hash(date + salt + k) % 1000) / 1000, n = (k, lo, hi) => lo + Math.floor(r(k) * (hi - lo + 1)), cups = []
    if (hard) {
      const a = n('a', 3, 9), b = n('b', 3, 9), c = n('c', 5, 30); cups.push({ e: `${a} × ${b} + ${c}`, v: a * b + c })
      const d = n('d', 50, 90), e = n('e', 2, 5), f = n('f', 3, 9); cups.push({ e: `${d} − ${e} × ${f}`, v: d - e * f })
      const g = n('g', 10, 30), h = n('h', 10, 30), i = n('i', 2, 3); cups.push({ e: `(${g} + ${h}) × ${i}`, v: (g + h) * i })
    } else {
      const a = n('a', 3, 8), b = n('b', 4, 8); cups.push({ e: `${a} × ${b}`, v: a * b })
      const c = n('c', 40, 79), d = n('d', 11, 30); cups.push({ e: `${c} − ${d}`, v: c - d })
      const e = n('e', 12, 41), f = n('f', 9, 28); cups.push({ e: `${e} + ${f}`, v: e + f })
    }
    if (new Set(cups.map(x => x.v)).size < 3 && salt < 50) continue
    cups.sort((p, q) => hash(date + p.e) - hash(date + q.e))
    return { date, cups, target: cups[hash(date + 't') % 3].v, open: [], win: false, hard: !!hard }
  }
}

/**
 * 今天的题：每组按 daily 抽，避开本周已经做过的题；前几天答错过的模板，优先出它的新变式。
 * 三种难度按该「知识点 × 错因」的难度档位加权抽。周五（tuning.boss_day）各组减半，另加 8 道最难的闯关题。
 */
function pickToday(pack, log, date, ladder) {
  const seen = new Set(log.map(r => r.item)), redo = new Set(log.filter(r => !r.correct && r.day !== date).map(r => r.tpl))
  const items = pack.items.filter(it => FORMATS.includes(it.format))
  const friday = Number(pack.tuning?.boss_day) === (new Date(date + 'T12:00:00Z').getUTCDay() || 7)
  const weight = it => LEVEL_MIX[ladder[`${it.kp}|${it.err}`]?.lv ?? 1][Math.max(0, LEVELS.indexOf(it.level))]
  const order = a => a.map(it => [-Math.log((hash(date + it.id) % 99991 + 1) / 99992) / weight(it), it]).sort((p, q) => p[0] - q[0]).map(p => p[1])
  // 每组的题型和顺序不变；约三分之一换成别的组、往周（综合复习题池 mix 组）里同题型的题，同一模板尽量平均出，不让一组题翻来覆去一个样
  const taken = new Set()
  const groups = pack.groups.filter(g => !(friday && g.boss) && !g.mix).map(g => {
    const pool = items.filter(it => it.group === g.id), fresh = pool.filter(it => !seen.has(it.id))
    const ordered = [...order(fresh.filter(it => redo.has(it.tpl))), ...order(fresh.filter(it => !redo.has(it.tpl))), ...order(pool.filter(it => seen.has(it.id)))]
    const daily = dailyOf(g), want = friday ? Math.ceil(daily / 2) : daily, out = [], perTpl = {}
    const fmts = new Set(pool.map(it => it.format)), boss = pack.groups.filter(x => x.boss).map(x => x.id)
    const others = g.boss ? [] : order(items.filter(it => it.group !== g.id && !boss.includes(it.group) && fmts.has(it.format) && !seen.has(it.id)))
    const nMix = Math.min(Math.floor(want / 3), new Set(others.map(it => it.tpl)).size)
    const per = Math.max(1, Math.ceil((want - nMix) / Math.max(1, new Set(pool.map(it => it.tpl)).size)))
    const take = (list, n, cap) => { for (const it of list) { if (out.length >= n) break; if (taken.has(it.id) || (perTpl[it.tpl] || 0) >= cap) continue; perTpl[it.tpl] = (perTpl[it.tpl] || 0) + 1; taken.add(it.id); out.push(it) } }
    take(ordered, want - nMix, per); take(others, want, 1); take(ordered, want, per + 1); take(ordered, want, 99)
    // 同一模板的题错开（轮流出），混进来的题均匀插在中间
    const own = out.filter(it => it.group === g.id), mix = out.filter(it => it.group !== g.id), byTpl = {}
    own.forEach(it => (byTpl[it.tpl] ||= []).push(it))
    const lists = Object.values(byTpl), rr = []
    for (let k = 0; rr.length < own.length; k++) lists.forEach(l => { if (l[k]) rr.push(l[k]) })
    mix.forEach((it, j) => rr.splice(Math.min(rr.length, Math.round((j + 1) * (rr.length + 1) / (mix.length + 1))), 0, it))
    return { id: g.id, items: rr.map(it => it.id) }
  }).filter(g => g.items.length)
  if (friday) {
    groups.flatMap(g => g.items).forEach(id => taken.add(id))
    const cand = items.filter(it => !seen.has(it.id) && !taken.has(it.id)).sort((p, q) => LEVELS.indexOf(q.level) - LEVELS.indexOf(p.level) || hash(date + p.id) - hash(date + q.id))
    const out = [], perTpl = {}
    for (const round of [1, 2]) for (const it of cand) { if (out.length >= BOSS_SIZE) break; if ((perTpl[it.tpl] || 0) >= round || out.includes(it.id)) continue; perTpl[it.tpl] = (perTpl[it.tpl] || 0) + 1; out.push(it.id) }
    if (out.length) groups.push({ id: 'friday', items: out })
  }
  return groups
}

/**
 * 账号：每个孩子账号有自己的小狗、存档、每天的题和答题流水，题库大家共用。
 * 第一个孩子账号 id 是 main，用不带前缀的老键（以前的存档不用搬）；其他账号的键前面加 u:<id>:。
 */
const SHARED = k => k === 'pack' || k === 'pack-weeks' || k === 'dev-clock' || k === 'users' || k.startsWith('fail:')
const scoped = (base, id) => { const pre = id === 'main' ? '' : `u:${id}:`, key = k => SHARED(k) ? k : pre + k; return { get: k => base.get(key(k)), set: (k, v) => base.set(key(k), v) } }
const pinOk = pin => /^\d{4}$/.test(String(pin ?? ''))
const userName = v => [...String(v ?? '').replace(/[\u0000-\u001f<>&"'`\s]/g, '')].slice(0, 12).join('')

export function createApi(base, env) {
  const store = base
  const load = async (k, d) => (await store.get(k)) ?? d
  const pinHash = (salt, pin) => digest(`${salt}:${pin}`)
  // 登录凭证：账号 id + 用这个账号的密码哈希和服务器密钥算的签名。改了密码、停用账号，旧凭证就失效
  const sign = (id, h) => digest(`${id}:${h}:${env.SYNC_TOKEN}`).then(x => `${id}.${x.slice(0, 40)}`)
  const cookie = (name, v, age = 86400 * 180) => `${name}=${v}; Path=/; HttpOnly; ${env.DEV ? '' : 'Secure; '}SameSite=Lax; Max-Age=${age}`
  /** 账号表；第一次用时，用以前的口令 KID_PIN 建第一个孩子账号（以前的存档就是它的） */
  async function users() {
    let list = await store.get('users')
    if (!list && env.KID_PIN && pinOk(env.KID_PIN)) {
      const salt = crypto.randomUUID()
      list = [{ id: 'main', name: userName(env.KID_USER) || '宝贝', salt, hash: await pinHash(salt, env.KID_PIN), created: new Date().toISOString() }]
      await store.set('users', list)
    }
    return list || []
  }
  async function whoami(req) {
    const c = cookies(req)
    if (c.adm && env.ADMIN_PIN && c.adm === await sign('admin', await digest(`admin:${env.ADMIN_PIN}`))) return { admin: true }
    const [id] = String(c.kid || '').split('.'), u = (await users()).find(x => x.id === id)
    if (u && !u.off && c.kid === await sign(u.id, u.hash)) return { user: u }
    // 以前的口令凭证：密码没被管理员改过时，继续认作第一个孩子账号
    const main = (await users()).find(x => x.id === 'main')
    if (main && !main.off && env.KID_PIN && c.kid === await digest(`kid:${env.KID_PIN}`) && main.hash === await pinHash(main.salt, env.KID_PIN)) return { user: main, legacy: true }
    return {}
  }
  // 本地开发和 dev 分支部署可以拨时间（POST /api/kid/dev/clock），正式站没有这个接口
  let offset = 0
  const nowMs = () => Date.now() + offset

  async function context(S) {
    const load = async (k, d) => (await S.get(k)) ?? d
    if (env.DEV || env.CLOCK) offset = await load('dev-clock', 0)
    const pack = await S.get('pack')
    const now = nowMs(), date = today(new Date(now))
    const raw = await S.get('state')
    let state = { ...freshState(), ...raw }   // 旧存档缺的字段用默认值补上
    if (!raw) state.needs.at = now
    if (raw && raw.days == null) state = await migrate(state, load, date)
    else if (raw && raw.season && raw.season !== SEASON.id) state = newSeason(state)
    const s = state
    // 早安小礼物：前一天睡前三项需求都 ≥60，今天第一次打开时叼来一样东西
    if (s.hatched && s.gift?.date !== date) {
      const [h, m] = String(pack?.tuning?.bedtime || '20:30').split(':').map(Number)
      const bed = Date.parse(`${addDays(date, -1)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`), at = s.needs.at
      const ok = ['full', 'mood', 'clean'].every(k => (at >= bed || s.needs[k] <= NEED_FLOOR ? s.needs[k] : s.needs[k] - DECAY[k] * (bed - at) / DAY) >= 60)
      const what = !ok ? null : hash(date) % 2 ? 'cookie' : 'coins'
      if (what === 'cookie') s.bag.cookie = (s.bag.cookie || 0) + 1
      if (what === 'coins') s.coins += 10
      s.gift = { date, what }
    }
    decay(s, now)
    grow(s, date)
    const log = pack ? await load(`log:${pack.week}`, []) : []
    let day = await S.get(`day:${date}`)
    const ids = new Set(pack?.items.map(it => it.id))   // 家长重新推送后题号对不上，就重抽今天的题
    if (pack && (!day || day.week !== pack.week || day.groups.some(g => g.items.some(id => !ids.has(id))))) { day = { date, week: pack.week, groups: pickToday(pack, log, date, state.ladder), items: {}, flash: 0, done: false }; await S.set(`day:${date}`, day) }
    return { S, pack, state, date, log, day, now }
  }
  /** 记得你：小狗说话时能用上的几件事 */
  function facts({ pack, state, date, log }) {
    const y = addDays(date, -1)
    return { fixed: log.filter(r => r.day === y && r.correct && r.try > 1).length, firstOk: log.filter(r => r.day === y && r.correct && r.try === 1).length,
      focus: pack?.groups.find(g => g.bucket === '本周重点' && !g.boss)?.name || '', days: state.days, lastSay: state.skill['格式规范'] >= 2 ? state.lastSay : '' }
  }
  const view = ctx => {
    const { pack, state, day, date } = ctx, s = state
    const byId = pack ? Object.fromEntries(pack.items.map(it => [it.id, it])) : {}
    const st = stageOf(s, date), ev = s.hatched && s.event !== date ? eventOf(date, s.skill['概念不清'] >= 2) : null
    const H = s.hide?.date === date ? s.hide : null
    return {
      date, now: ctx.now,
      state: { ...s, hide: undefined, stage: st, good: good(s), finale: date >= SEASON.finale, graduated: !!s.grad, pcPending: POSTCARD_DAYS.some(d => d > (s.pcLast || '') && d <= date) },
      week: pack?.week || null, tuning: pack?.tuning || {},
      today: day ? day.groups.map(dg => ({ ...(dg.id === 'friday' ? FRIDAY : dg.id === 'extra' ? EXTRA : pack.groups.find(g => g.id === dg.id)), items: dg.items.map(id => { const it = byId[id], r = day.items[id] || {}; return { ...publicItem(it, { tier: s.tiers?.[`${it.kp}|${it.err}`]?.lv ?? 0 }), done: r.fin || null, guard: r.guard || null, caught: r.caught || null, l2: !!r.l2, help: r.help || [] } }) })) : [],
      uses: usesLeft(s, date),
      allDone: !!day?.done,
      wish: pack?.tuning?.wish ? { text: String(pack.tuning.wish), need: Number(pack.tuning.wish_days) || 4, got: s.att.week === isoWeek(date) ? s.att.days.length : 0 } : null,
      morning: s.hatched && s.name && s.kid && s.greet !== date ? { gift: s.gift?.date === date ? s.gift.what : null, note: pack?.tuning?.note ? String(pack.tuning.note) : '', facts: facts(ctx) } : null,
      facts: facts(ctx),
      event: ev && { t: ev.t, b: ev.b },
      hide: H && { cups: H.cups.map(c => c.e), target: H.target, open: H.open.map(i => ({ i, v: H.cups[i].v })), win: H.win, hard: H.hard },
      walked: s.trip?.date === date ? s.trip.k : '',
      boss: pack ? { day: Number(pack.tuning?.boss_day ?? 5), groups: pack.groups.filter(g => g.bucket === '本周重点' && !g.boss).map(g => g.name) } : null,
    }
  }
  const save = async ctx => { await ctx.S.set('state', ctx.state); if (ctx.day) await ctx.S.set(`day:${ctx.date}`, ctx.day); if (ctx.pack) await ctx.S.set(`log:${ctx.pack.week}`, ctx.log) }
  /** 给一张明信片：优先给 k 这个地方，没有就给开放了的最新地方里还没集齐的。 */
  function giveCard(s, date, k) {
    const st = stageOf(s, date), open = PLACES.filter(p => POSTCARDS[p.k] && placeOpen(p, st, date)).reverse()
    const p = (k ? open.filter(x => x.k === k) : open).find(x => s.cards.filter(c => c.k === x.k).length < POSTCARDS[x.k].length)
    if (!p) return null
    const card = { k: p.k, i: s.cards.filter(c => c.k === p.k).length, at: date }
    s.cards.push(card)
    mark(s, date, `带回明信片「${POSTCARDS[p.k][card.i].t.replace('{name}', s.name)}」`)
    return card
  }

  // ---------- 做题：整道题做完再判 ----------
  /**
   * 按积木逐步判分。每一步都照孩子自己的结果往下走：列错了式子，递等式就照他的式子算；
   * 所以能分清是列式错还是计算错。返回 { items: [{ i, good: 'y'|'n'|'h', msg, cat }], ok, habits, given, final }
   */
  /** 圈关键词：关键词全中、多圈了几处用不上的。只提醒，不算错 */
  function judgeCircle(it, a) {
    const sel = new Set((Array.isArray(a?.sel) ? a.sel : []).map(Number)), keys = it.segs.flatMap((s, j) => s.k ? [j] : []), noise = it.segs.flatMap((s, j) => s.n ? [j] : [])
    // 圈关键词要圈、要点评，但扣分要轻：要紧的圈到大部分（每 4 处可以漏 1 处）、没圈用不上的那句，就算圈得好
    const missed = keys.filter(j => !sel.has(j)).length, extra = noise.filter(j => sel.has(j)).length, allow = Math.max(1, Math.floor(keys.length / 4))
    const kw = missed <= allow && !extra && keys.length - missed >= 1 ? 2 : missed * 2 <= keys.length ? 1 : 0
    return { kw, good: kw === 2 ? 'y' : 'h', cat: kw === 2 ? '' : '审题', msg: kw === 2 ? (missed ? `关键词圈得很好，还漏了 ${missed} 处` : '关键词圈得刚刚好') : missed ? `漏圈了 ${missed} 处要紧的地方${extra ? `，多圈了 ${extra} 处用不上的` : ''}。${it.why || '带数的话和问题都要圈。'}` : `要紧的都圈到了，还多圈了 ${extra} 处用不上的。${it.why || ''}` }
  }
  /** 统计表：先填表，再答几个小问。后面的小问照孩子自己填的数往下走，按小问判分 */
  function judgeStat(it, steps) {
    const items = [], habits = new Set(), add = (i, good, msg, cat = '') => items.push({ i, good, msg, cat }), n = it.cats.length
    const cells = steps?.[0]?.cells || [], own = it.cats.map((_, j) => cells[j] === '' || cells[j] == null ? null : Number(cells[j])), tot = cells[n] === '' || cells[n] == null ? null : Number(cells[n])
    const partsOk = [true, ...it.asks.map(() => true)], mark = it.record === 'check' ? '✓' : '正字'
    it.cats.forEach((c, j) => {
      if (own[j] == null) { partsOk[0] = false; add(0, 'n', `${c}没填`, '漏题') }
      else if (own[j] !== it.vals[j]) { partsOk[0] = false; add(0, 'n', `${c}应该是 ${it.vals[j]}，你写了 ${own[j]}。${it.record === 'check' ? '一个一个数清楚' : '一个「正」是 5，先数整的正，再数零头'}`, '计算失误') }
    })
    const sum = own.reduce((a, b) => a + (b || 0), 0)
    if (tot == null) { partsOk[0] = false; add(0, 'n', '合计没填', '漏题') }
    else if (tot !== sum) { partsOk[0] = false; add(0, 'n', `合计：你填的${n}个数加起来是 ${sum}，合计写了 ${tot}`, '漏题') }
    if (partsOk[0]) { add(0, 'y', `统计表都填对了，合计 ${tot}`); habits.add('计算失误') }
    let expr = null, chipsCat = null, given = [`表 ${own.join(',')} 合计 ${tot}`]
    it.flow.forEach((type, i) => {
      if (!i) return
      const a = steps?.[i] || {}, P = it.parts[i], q = it.asks[P - 1], tag = `（${P}）`
      if (type === 'pickcat') {
        const k = Number(a.i); given.push(it.cats[k])
        if (k === q.ans) { habits.add('审题'); return add(i, 'y', `${tag}${q.kind === 'max' ? '最多' : '最少'}的是${it.cats[k]}，对`) }
        partsOk[P] = false; add(i, 'n', `${tag}${q.kind === 'max' ? '最多' : '最少'}的是${it.cats[q.ans]}（${it.vals[q.ans]}），你选了${it.cats[k] ?? '？'}${own[k] != null && own[q.ans] != null && (q.kind === 'max' ? own[k] < own[q.ans] : own[k] > own[q.ans]) ? '。看清楚问的是最多还是最少' : ''}`, '审题')
      } else if (type === 'build') {
        const t = Array.isArray(a.expr) ? a.expr.map(x => typeof x === 'number' || /^\d+$/.test(x) ? Number(x) : String(x)) : []
        chipsCat = (a.chips || []).filter(x => x != null).map(Number); expr = validExpr(t) ? t : null; given.push(showExpr(t))
        // 数字卡就是孩子自己填进表里的数：按卡片对应的类别，用他填的数重新算一遍
        let ci = 0
        if (expr) expr = expr.map(x => typeof x === 'number' ? (chipsCat[ci] != null && own[chipsCat[ci]] != null ? own[chipsCat[ci++]] : (ci++, x)) : x)
        const cats = new Set(chipsCat), want = [q.use[0], q.use[2]], v = expr ? exprValue(expr) : NaN
        const should = own[want[0]] != null && own[want[1]] != null ? calcOp(own[want[0]], q.use[1], own[want[1]]) : null
        if (!expr) { partsOk[P] = false; return add(i, 'n', `${tag}算式没写完整`, '漏题') }
        // 数字卡不再注明类别：两类的数一样时点了哪张都算对，只看用的数对不对
        const nums = expr ? expr.filter(x => typeof x === 'number') : [], sameVals = JSON.stringify([...nums].sort((x, y) => x - y)) === JSON.stringify([own[want[0]], own[want[1]]].sort((x, y) => x - y))
        const right = (cats.size === 2 && want.every(c => cats.has(c)) || sameVals) && nums.length === 2 && expr.includes(q.use[1])
        if (right && v === should) return add(i, 'y', `${tag}列式 ${showExpr(t)}，方法对`)
        partsOk[P] = false
        if (right && q.use[1] === '−' && Number.isNaN(v)) return add(i, 'n', `${tag}相差要用大数减小数`, '概念不清')
        if ((cats.size === 2 && want.every(c => cats.has(c))) || sameVals) return add(i, 'n', `${tag}列式 ${showExpr(t)}：${q.use[1] === '−' ? '「多多少」要用减法' : '「一共」要用加法'}`, '审题')
        add(i, 'n', `${tag}列式 ${showExpr(t)}：比的不是题目问的两类，要用${it.cats[want[0]]}和${it.cats[want[1]]}`, '审题')
      } else if (type === 'say') {
        const v = a.v === '' || a.v == null ? null : Number(a.v), unit = a.unit || '', fin = expr ? exprValue(expr) : null
        given.push(`${v ?? ''}${unit}`)
        if (v == null) add(i, 'n', `${tag}答句里的得数没填`, '漏题')
        else if (fin != null && !Number.isNaN(fin) && v !== fin) add(i, 'n', `${tag}算式算出来是 ${fin}，答句写了 ${v}`, '计算失误')
        if (!unit) add(i, 'n', `${tag}答句忘写单位`, '格式规范')
        else if (unit !== q.unit) add(i, 'n', `${tag}单位写成了「${unit}」`, '格式规范')
        else { habits.add('格式规范'); if (v === fin) add(i, 'y', `${tag}${q.pre} ${v} ${unit}`) }
        if (v != null && v !== q.ans && !items.some(x => x.i === i && x.good === 'n')) add(i, 'n', `${tag}答句写了 ${v}，应该是 ${q.ans}`, '计算失误')
        if (!(v === q.ans && unit === q.unit)) partsOk[P] = false
      }
    })
    return { items, ok: partsOk.every(Boolean), partsOk, habits: [...habits], given: given.join(' | '), kw: 0, unitMiss: items.some(x => x.msg.endsWith('忘写单位')) }
  }
  /** 整理数据：点出符合条件的数，再数个数 */
  function judgeData(it, steps) {
    const flow = flowOf(it), ti = flow.indexOf('tapnum'), items = [], habits = new Set(), add = (good, msg, cat = '') => items.push({ i: ti, good, msg, cat }), a = steps?.[ti] || {}
    let kw = 0
    if (flow[0] === 'circle') { const c = judgeCircle(it, steps?.[0]); kw = c.kw; if (kw === 2) habits.add('审题'); items.push({ i: 0, good: c.good, msg: c.msg, cat: c.cat }) }
    const sel = new Set((Array.isArray(a.sel) ? a.sel : []).map(Number)), test = { over: x => x > it.over, under: x => x < it.over, atleast: x => x >= it.over }[it.kind]
    const want = it.nums.flatMap((x, j) => test(x) ? [j] : []), word = { over: '超过', under: '少于', atleast: '不少于' }[it.kind]
    const eq = [...sel].filter(j => it.nums[j] === it.over && !test(it.over)), extra = [...sel].filter(j => !test(it.nums[j]) && it.nums[j] !== it.over), miss = want.filter(j => !sel.has(j))
    if (eq.length) add('n', `点了 ${it.over}：「${word} ${it.over}」不包括 ${it.over} 本身`, '审题')
    if (extra.length) add('n', `点了不符合的：${extra.map(j => it.nums[j]).join('、')}`, '审题')
    if (miss.length) add('n', `漏了 ${miss.length} 个：${miss.map(j => it.nums[j]).join('、')}`, '漏题')
    if (!eq.length && !extra.length && !miss.length) { habits.add('审题'); add('y', `${word} ${it.over} 的都找对了`) }
    const v = a.v === '' || a.v == null ? null : Number(a.v), unit = a.unit || ''
    if (v == null) add('n', '个数没填', '漏题')
    else if (v !== sel.size) add('n', `你点了 ${sel.size} 个，却写了 ${v}`, '计算失误')
    if (!unit) add('n', '答句忘写单位', '格式规范'); else if (unit !== it.unit) add('n', `单位写成了「${unit}」`, '格式规范'); else habits.add('格式规范')
    const ok = v === want.length && unit === it.unit
    if (ok) add('y', `${it.ask} ${v} ${unit}`)
    return { items, ok, habits: [...habits], given: `点了 ${[...sel].map(j => it.nums[j]).join(',')} | ${v ?? ''}${unit}`, kw, unitMiss: !unit && v === want.length }
  }
  /** 竖式：每一位对不对，能认出「忘了加进位」「忘了退位」 */
  /** 除法竖式：商每一位、下面各行、余数 */
  function judgeDiv(it, steps) {
    const items = [], habits = new Set(), add = (good, msg, cat = '') => items.push({ i: 0, good, msg, cat }), got = steps?.[0]?.cells || {}, L = it.div
    const num = x => x === '' || x == null ? null : Number(x), WEI = n => ['个位', '十位', '百位', '千位'][n] || ''
    const n = String(it.a).length, place = j => WEI(n - 1 - j)
    let ok = true, rowsOk = true
    L.q.forEach((x, j) => {
      const w = num(got['q' + j])
      if (x == null) { if (w) { ok = false; add('n', `${String(it.a).slice(0, j + 1)} 比 ${it.b} 小，不够商 1，商的${place(j)}不写`, '计算失误') } return }
      if (w === x) return
      ok = false
      if (x === 0 && w == null) add('n', `商的${place(j)}漏了 0：这一位不够除，要在商上写 0`, '计算失误')
      else if (w == null) add('n', `商的${place(j)}空着没填`, '漏题')
      else add('n', `商的${place(j)}应该是 ${x}，你写了 ${w}`, '计算失误')
    })
    L.rows.forEach((r, k) => {
      const len = String(r.v).length, w = num([...Array(len).keys()].map(p => got[`r${k}_${p}`] ?? '').join(''))
      const last = k === L.rows.length - 1
      if (w === r.v) return
      if (last) { ok = false; add('n', w != null && w >= it.b ? `余数 ${w} 比除数 ${it.b} 还大，商还能再大` : `最后的余数应该是 ${r.v}，你写了 ${w ?? '空'}`, '计算失误') }
      else { rowsOk = false; add('h', `第 ${k + 1} 行应该是 ${r.v}${r.kind === 'prod' ? '（商 × 除数）' : '（减下来再落下一位）'}，你写了 ${w ?? '空'}`, '计算失误') }
    })
    if (ok) { add('y', `${it.text} = ${it.answer}${it.rem ? ` …… ${it.rem}` : ''}，商和余数都对`); if (rowsOk) habits.add('计算失误') }
    return { items, ok, habits: [...habits], given: L.q.map((_, j) => got['q' + j] ?? '_').join('') + '……' + (got[`r${L.rows.length - 1}_0`] ?? ''), kw: 0, chainOk: ok && rowsOk }
  }
  /** 验算：除法用乘法验，加减用逆运算，乘法估一估。只算过程，对了给过程奖 */
  function judgeCheck(it, a, i, J) {
    const v = (Array.isArray(a?.vs) ? a.vs : []).map(x => x === '' || x == null ? null : Number(x)), add = (good, msg) => J.items.push({ i, good, msg, cat: good === 'y' ? '' : '漏题' })
    let good = false
    if (it.check === 'mul') good = v[0] === it.answer && v[1] === it.b && (v[2] ?? 0) === it.rem && v[3] === it.a
    if (it.check === 'back') good = it.op === '+' ? v[0] === it.answer && v[1] === it.b && v[2] === it.a : v[0] === it.answer && v[1] === it.b && v[2] === it.a
    if (it.check === 'estimate') good = v[0] != null && v[0] % 10 === 0 && Math.abs(v[0] - it.a) <= (v[0] % 100 === 0 ? 50 : 5) && v[1] === v[0] * it.b
    add(good ? 'y' : 'h', good ? '验算对上了' : { mul: `验算：${it.answer} × ${it.b}${it.rem ? ` + ${it.rem}` : ''} = ${it.a}`, back: it.op === '+' ? `验算：${it.answer} − ${it.b} = ${it.a}` : `验算：${it.answer} + ${it.b} = ${it.a}`, estimate: '估算：把第一个数看成接近它的整十或整百数，再乘' }[it.check])
    return good
  }
  function judgeColumn(it, steps) {
    const items = [], habits = new Set(), add = (good, msg, cat = '') => items.push({ i: 0, good, msg, cat }), got = steps?.[0]?.cells || {}
    const NAME = ['个位', '十位', '百位', '千位', '万位'], num = x => x === '' || x == null ? null : Number(x), da = String(it.a).split('').reverse().map(Number), db = String(it.b).split('').reverse().map(Number)
    let ok = true, carryOk = true
    for (const c of it.cells) {
      const w = num(got[`${c.kind === 'digit' ? 'd' : 'c'}${c.col}`])
      if (c.kind === 'carry') { if ((w ?? 0) !== c.v) { carryOk = false; const nm = it.op === '−' ? '退位' : '进位'; add('h', c.v ? `${NAME[c.col]}上面要写${nm} ${c.v}${w ? `，你写了 ${w}` : '，你空着'}` : `${NAME[c.col]}上面不用写${nm}，你写了 ${w}`, '计算失误') } continue }
      if (w == null) { ok = false; add('n', `${NAME[c.col]}空着没填`, '漏题'); continue }
      if (w === c.v) continue
      ok = false
      if (c.trap === w) add('n', it.op === '×' ? `${NAME[c.col]}忘了加进位：${da[c.col]} × ${it.b} 得 ${da[c.col] * it.b}，加上进位 ${c.cin} 是 ${da[c.col] * it.b + c.cin}，写 ${c.v}` : it.op === '+' ? `${NAME[c.col]}忘了加进位 1：${da[c.col] || 0} + ${db[c.col] || 0} + 1，写 ${c.v}` : `${NAME[c.col]}忘了退位：这一位被右边借走了 1，要先减 1，写 ${c.v}`, '计算失误')
      else add('n', `${NAME[c.col]}应该是 ${c.v}，你写了 ${w}`, '计算失误')
    }
    const top = Math.max(...it.cells.filter(c => c.kind === 'digit').map(c => c.col))
    for (const k of Object.keys(got)) if (k[0] === 'd' && +k.slice(1) > top && num(got[k])) { ok = false; add('n', `${NAME[+k.slice(1)]}不用写，得数只有 ${top + 1} 位`, '计算失误') }
    if (ok) { add('y', `${it.text} = ${it.answer}，每一位都对`); if (carryOk) habits.add('计算失误') }
    return { items, ok, habits: [...habits], given: it.cells.filter(c => c.kind === 'digit').map(c => got[`d${c.col}`] ?? '_').reverse().join(''), kw: 0, chainOk: ok && carryOk }
  }
  /** 分步应用题：每一步列式和得数都照孩子自己上一步的得数往下走 */
  function judgeMulti(it, steps) {
    const items = [], habits = new Set(), add = (i, good, msg, cat = '') => items.push({ i, good, msg, cat }), flow = it.flow
    let ok = true, goalOk = false, own = [], unitsOk = true, calcOk = true, exprs = [], given = [], kwM = 0
    flow.forEach((type, i) => {
      const a = steps?.[i] || {}, k = it.stepOf[i], P = it.parts[k], tag = it.parts.length > 1 ? `第${'一二三四'[k]}步` : ''
      if (type === 'circle') { const c = judgeCircle(it, a); kwM = c.kw; if (c.kw === 2) habits.add('审题'); return add(i, c.good, c.msg, c.cat) }
      if (type === 'goal') {
        const g = Number(a.i); given.push('先求 ' + (it.goals[g]?.t ?? '?'))
        if (it.goals[g]?.ok) { goalOk = true; habits.add('策略缺失'); return add(i, 'y', `先求「${it.goals[g].t}」，找对了`) }
        return add(i, 'n', `先求「${it.goals[g]?.t ?? '？'}」走不通，要先求「${it.goals.find(x => x.ok).t}」`, '策略缺失')
      }
      if (type === 'build') {
        const raw = Array.isArray(a.expr) ? a.expr.map(x => typeof x === 'number' || /^\d+$/.test(x) ? Number(x) : String(x)) : [], chips = (a.chips || [])
        const prevChip = P.tk.slice(0, P.prevAt).filter(x => typeof x === 'number').length
        // chips 和算式一一对应（符号那一格是 null）
        const mine = raw.map((x, j) => typeof x === 'number' && k && chips[j] === prevChip ? own[k - 1] ?? x : x)   // 照孩子自己上一步的得数
        const truth = raw.map((x, j) => typeof x === 'number' && k && chips[j] === prevChip ? it.parts[k - 1].v : x)   // 换成上一步正确的得数，看方法对不对
        given.push(showExpr(mine))
        if (!validExpr(raw)) { ok = false; exprs[k] = null; return add(i, 'n', `${tag}算式没写完整`, '漏题') }
        exprs[k] = exprValue(mine)
        const v = exprValue(truth)
        if (v === P.v && sameNums(truth, P.tk)) return add(i, 'y', `${tag}列式 ${showExpr(mine)}，方法对`)
        const tp = it.traps?.find(x => x.value === v), part = (exprSteps(P.tk) || []).some(st => st.v === v) || (k && v === it.parts[k - 1].v)
        add(i, 'n', `${tag}列式 ${showExpr(mine)}：${tp?.say || (part ? `这只算出了一部分，这一步要求的是${P.ask}` : `求${P.ask}，和这个算式对不上`)}`, tp?.error_type || (part ? '审题' : it.err))
      }
      if (type === 'say') {
        const v = a.v === '' || a.v == null ? null : Number(a.v), unit = a.unit || '', fin = exprs[k]
        own[k] = v; given.push(`${v ?? ''}${unit}`)
        if (v == null) { ok = false; return add(i, 'n', `${tag}得数没填`, '漏题') }
        if (fin != null && !Number.isNaN(fin) && v !== fin) { calcOk = false; add(i, 'n', `${tag}算式算出来是 ${fin}，你写了 ${v}`, '计算失误') }
        if (!unit) { unitsOk = false; add(i, 'n', `${tag}得数后面忘写单位`, '格式规范') }
        else if (unit !== P.unit) { unitsOk = false; add(i, 'n', `${tag}单位写成了「${unit}」，这里是「${P.unit}」`, '格式规范') }
        else if (v === fin) add(i, 'y', `${tag}${k === it.parts.length - 1 ? it.ask : P.pre} ${v} ${unit}`)
        if (k === it.parts.length - 1 && !(v === it.answer && unit === it.unit)) ok = false
      }
    })
    if (unitsOk) habits.add('格式规范')
    if (calcOk) habits.add('计算失误')
    return { items, ok, habits: [...habits], given: given.join(' | '), kw: kwM, goalOk, unitMiss: items.filter(x => x.good === 'n').every(x => x.msg.includes('忘写单位')) && items.some(x => x.msg.includes('忘写单位')) }
  }
  function judge(it, steps) {
    if (it.format === 'column') {
      const J = it.op === '÷' ? judgeDiv(it, steps) : judgeColumn(it, steps)
      if (it.check) { const g = judgeCheck(it, steps?.[1], 1, J); J.chainOk = J.chainOk && g }
      return J
    }
    if (it.format === 'multistep') return judgeMulti(it, steps)
    if (it.format === 'stat') return judgeStat(it, steps)
    if (it.format === 'data') return judgeData(it, steps)
    const flow = flowOf(it), items = [], habits = new Set()
    const add = (i, good, msg, cat = '') => items.push({ i, good, msg, cat })
    const trap = v => it.traps?.find(t => t.value === v)
    let expr = null, final = null, ok = true, given = [], kw = 0, goalOk = false, chainOk = true, rangeOk = false, blankMiss = false, unitMiss = false
    flow.forEach((type, i) => {
      const a = steps?.[i] || {}
      if (type === 'fill' && it.rem != null) {
        // 有余数的除法：商和余数两格
        const [q, r] = (Array.isArray(a.vs) ? a.vs : []).map(x => x === '' || x == null ? null : Number(x)); given.push(`${q ?? ''}……${r ?? ''}`)
        if (q === it.answer && r === it.rem) { habits.add('计算失误'); return add(i, 'y', `${it.text} = ${q} …… ${r}，对`) }
        ok = false
        if (q == null || r == null) return add(i, 'n', '商和余数都要填', '漏题')
        if (r >= it.div) return add(i, 'n', `余数 ${r} 比除数 ${it.div} 还大（或一样大），说明商还能再大。余数一定要比除数小`, '计算失误')
        return add(i, 'n', q * it.div + r === it.answer * it.div + it.rem ? `商和余数凑起来是对的，但商要尽量大：应该是 ${it.answer} …… ${it.rem}` : `应该是 ${it.answer} …… ${it.rem}，你写了 ${q} …… ${r}。验算：商 × 除数 + 余数 = 被除数`, '计算失误')
      }
      if (type === 'fill') {
        const v = a.v === '' || a.v == null ? null : Number(a.v); given.push(v)
        if (v === it.answer) { add(i, 'y', `${it.format === 'fix' ? '正确的得数' : '得数'} ${v}，对`); return }
        ok = false
        if (v == null) return add(i, 'n', '得数没填', '漏题')
        const tp = trap(v); add(i, 'n', tp?.say || `得数应该是 ${it.answer}，你写了 ${v}`, tp?.error_type || '计算失误')
      } else if (type === 'first') {
        const k = Number(a.i), right = it.first; given.push('先算 ' + (it.tokens[k] ?? '?'))
        if (k === right) { habits.add('概念不清'); return add(i, 'y', `先算 ${it.tokens[k]}，对`) }
        ok = false; add(i, 'n', `先算了 ${it.tokens[k] ?? '？'}。${it.tokens.includes('(') ? '有括号，先算括号里面的' : '没有括号，先算乘除，再算加减'}，应该先算 ${it.tokens[right]}`, it.err)
      } else if (type === 'clock') {
        const z = Number(a.zone); given.push(`钟面位置 ${z}`)
        if (z === it.answer) return add(i, 'y', '时针拨对了')
        ok = false; add(i, 'n', trap(z) ? '几时半，时针在两个数的正中间，不是正好指着整点' : '时针拨的位置不对', trap(z)?.error_type || it.err)
      } else if (type === 'range') {
        const k = Number(a.i); given.push(it.ranges[k]?.t)
        if (it.ranges[k]?.ok) { rangeOk = true; habits.add('计算失误'); return add(i, 'y', `估在 ${it.ranges[k].t}，估得对`) }
        ok = false; add(i, 'n', `估的范围不对，应该在 ${it.ranges.find(r => r.ok).t}。先看最高位，大概是几百、几十`, '计算失误')
      } else if (type === 'spot') {
        const k = Number(a.i); given.push(`第 ${k + 1} 行`)
        if (k === it.bad) return add(i, 'y', `找到了，最先错的是第 ${k + 1} 行`)
        ok = false; add(i, 'n', `最先出错的是第 ${it.bad + 1} 行，你点了第 ${k + 1} 行。从上往下一行一行对`, '漏题')
      } else if (type === 'blanks') {
        const vals = Array.isArray(a.vals) ? a.vals : []; given.push(vals.join(','))
        let n = 0   // vals 按 □ 的顺序排，一行里可以有几个 □
        it.blanks.forEach(b => {
          const want = [b.a].flat(), got = want.map(() => { const x = vals[n++]; return String(x ?? '') === '' ? null : Number(x) }), t = b.t.replace(/□/g, '（ ）')
          if (got.every((x, j) => x === want[j])) add(i, 'y', `${t}：${got.join('、')}，对`)
          else if (got.some(x => x == null)) { ok = false; blankMiss = true; add(i, 'n', `${t}：有空着没填`, '漏题') }
          else { ok = false; add(i, 'n', `${t}：应该是 ${want.join('、')}，你写了 ${got.join('、')}`, '计算失误') }
        })
      } else if (type === 'circle') {
        const c = judgeCircle(it, a); kw = c.kw
        if (kw === 2) habits.add('审题')
        add(i, c.good, c.msg, c.cat)
      } else if (type === 'goal') {
        const k = Number(a.i); given.push('先求 ' + (it.goals[k]?.t ?? '?'))
        if (it.goals[k]?.ok) { goalOk = true; habits.add('策略缺失'); return add(i, 'y', `先求「${it.goals[k].t}」，找对了`) }
        add(i, 'n', `先求「${it.goals[k]?.t ?? '？'}」走不通，要先求「${it.goals.find(g => g.ok).t}」`, '策略缺失')
      } else if (type === 'build') {
        const t = a.i != null ? toTokens(it.choices[Number(a.i)]?.t || '') : (Array.isArray(a.expr) ? a.expr.map(x => typeof x === 'number' || /^\d+$/.test(x) ? Number(x) : String(x)) : [])
        expr = validExpr(t) ? t : null; given.push(showExpr(t))
        const v = expr ? exprValue(expr) : NaN, okT = toTokens(it.choices.find(c => c.ok).t)
        if (!expr) { ok = false; return add(i, 'n', '算式没写完整', '漏题') }
        if (it.remDiv) {   // 有余数的除法：算式本身算不出一个整数，看算式是不是同一个
          if (showExpr(expr) === showExpr(okT)) return add(i, 'y', `列式 ${showExpr(expr)}，方法对`)
          const tp = it.traps?.find(x => x.value === v)
          return add(i, 'n', `列式 ${showExpr(expr)}：${tp?.say || '和题目问的对不上'}`, tp?.error_type || it.err)
        }
        if (v === it.answer && sameNums(expr, okT)) return add(i, 'y', `列式 ${showExpr(expr)}，方法对`)
        if (v === it.answer) return add(i, 'h', `列式 ${showExpr(expr)} 得数碰巧对了，但用到的数和题目对不上`, '审题')
        const tp = trap(v), part = (exprSteps(okT) || []).some(st => st.v === v)
        add(i, 'n', `列式 ${showExpr(expr)}：${tp?.say || (part ? `这只算出了一部分（${v}），问题问的是「${(it.ask || '').replace(/^答：/, '')}……」，还差一步` : '和题目问的对不上')}`, tp?.error_type || (part ? '审题' : it.err))
      } else if (type === 'chain') {
        let t = stripParens(flow.includes('build') ? expr || [] : toTokens(it.text))
        const lines = Array.isArray(a.lines) ? a.lines : []
        if (!t.length) return
        let r = 0, orderOk = true, calcOk = true
        for (const L of lines) {
          if (t.length < 2) break
          const k = Number(L.k), v = Number(L.v), right = nextOp(t)
          if (!canTap(t, k) || !Number.isInteger(v)) { ok = false; chainOk = false; add(i, 'n', `第 ${r + 1} 行没算完整`, '漏题'); t = []; break }
          const part = showExpr(t.slice(k - 1, k + 2)), should = calcOp(t[k - 1], t[k], t[k + 1])
          if (k !== right) {
            orderOk = false; chainOk = false
            add(i, 'n', `第 ${r + 1} 行先算了 ${part}，应该先算 ${showExpr(t.slice(right - 1, right + 2))}。${t.includes('(') ? '有括号先算括号里的' : '有乘除又有加减，先算乘除'}`, '概念不清')
          } else if (v !== should) {
            calcOk = false; chainOk = false
            const tp = it.lines?.[r]?.traps?.find(x => x.value === v)
            add(i, 'n', tp?.say || `第 ${r + 1} 行 ${part} 应该等于 ${should}，你写了 ${v}`, tp?.error_type || '计算失误')
          } else add(i, 'y', `第 ${r + 1} 行 ${part} = ${v}，对`)
          t = reduceAt(t, k, v); r++
        }
        if (t.length > 1) { ok = false; chainOk = false; add(i, 'n', '递等式还没算到最后', '漏题') }
        else final = t[0]
        if (orderOk && r) habits.add('概念不清')
        if (calcOk && r) habits.add('计算失误')
        if (it.format === 'steps') { given.push(final); if (!chainOk || final !== it.answer) ok = false }
      } else if (type === 'say' && it.answers) {
        // 答句有几格，每格一个数一个单位
        const vs = (Array.isArray(a.vs) ? a.vs : []).map(x => x === '' || x == null ? null : Number(x)), us = Array.isArray(a.units) ? a.units : []
        given.push(it.answers.map((_, j) => `${vs[j] ?? ''}${us[j] || ''}`).join(' '))
        let allUnit = true
        it.answers.forEach((x, j) => {
          const tag = it.answers.length > 1 ? `答句第 ${j + 1} 格` : '答句'
          if (vs[j] == null) { ok = false; add(i, 'n', `${tag}没填`, '漏题') }
          else if (vs[j] !== x.a) { ok = false; add(i, 'n', `${tag}应该是 ${x.a}，你写了 ${vs[j]}`, '计算失误') }
          if (!us[j]) { ok = false; allUnit = false; unitMiss = true; add(i, 'n', `${tag}忘写单位`, '格式规范') }
          else if (us[j] !== x.unit) { ok = false; allUnit = false; add(i, 'n', `${tag}单位写成了「${us[j]}」，应该是「${x.unit}」`, '格式规范') }
        })
        if (allUnit) habits.add('格式规范')
        if (ok) add(i, 'y', `${it.answers.reduce((t, x) => t.replace('□', `${x.a} ${x.unit}`), it.ask)}，都对`)
      } else if (type === 'say') {
        const v = a.v === '' || a.v == null ? null : Number(a.v), unit = a.unit || ''
        const fin = final ?? (expr ? exprValue(expr) : it.answer)
        given.push(`${v ?? ''}${unit}`)
        if (v == null) add(i, 'n', '答句里的得数没填', '漏题')
        else if (v !== fin) add(i, 'n', `上面算出的是 ${fin}，答句里写了 ${v}`, '计算失误')
        if (!unit) { unitMiss = true; add(i, 'n', '答句忘写单位', '格式规范') }
        else if (unit !== it.unit) add(i, 'n', `单位写成了「${unit}」，这里应该是「${it.unit}」`, '格式规范')
        else { habits.add('格式规范'); if (v === fin) add(i, 'y', `${it.ask} ${v} ${unit}，单位写对了`) }
        if (!(v === it.answer && unit === it.unit)) ok = false
      }
    })
    if (['word', 'plan'].includes(it.format) && !flow.includes('say')) ok = false
    return { items, ok, habits: [...habits], given: given.filter(x => x != null && x !== '').join(' | '), kw, goalOk, chainOk, rangeOk, blankMiss, unitMiss }
  }
  /** 正确做法，交卷后给孩子看 */
  function solution(it) {
    if (it.format === 'column' && it.op === '÷') return { explain: it.explain, lines: [`${it.text} = ${it.answer}${it.rem ? ` …… ${it.rem}` : ''}`, ...(it.div.zeroMid ? ['商的中间有一位不够除，要写 0'] : []), `验算：${it.answer} × ${it.b}${it.rem ? ` + ${it.rem}` : ''} = ${it.a}`] }
    if (it.format === 'column') { const ca = it.cells.filter(c => c.kind === 'carry' && c.v).map(c => `往${['个', '十', '百', '千'][c.col]}位${it.op === '−' ? '退' : '进'} ${c.v}`); return { explain: it.explain, lines: [`${it.text} = ${it.answer}`, ...(ca.length ? [ca.join('，')] : [])] } }
    if (it.format === 'multistep') return { explain: it.explain, lines: [...(it.goals ? [`先求：${it.goals.find(g => g.ok).t}`] : []), ...it.parts.map((P, k) => `第${'一二三四'[k]}步：求${P.ask}  ${P.e} = ${P.v}（${P.unit}）`), `${it.ask} ${it.answer} ${it.unit}`] }
    if (it.format === 'stat') return { explain: it.explain, lines: [it.cats.map((c, j) => `${c} ${it.vals[j]}`).join('，') + `，合计 ${it.answer}`,
      ...it.asks.map((q, j) => `（${j + 1}）${q.flow[0] === 'pickcat' ? `${q.kind === 'max' ? '最多' : '最少'}的是${it.cats[q.ans]}` : `${it.vals[q.use[0]]} ${q.use[1]} ${it.vals[q.use[2]]} = ${q.ans}（${q.unit}）  ${q.pre} ${q.ans} ${q.unit}`}`)] }
    if (it.format === 'data') { const t = { over: x => x > it.over, under: x => x < it.over, atleast: x => x >= it.over }[it.kind]; return { explain: it.explain, lines: [`符合的是 ${it.nums.filter(t).join('、')}`, `${it.ask} ${it.answer} ${it.unit}`] } }
    const t = it.choices ? toTokens(it.choices.find(c => c.ok).t) : ['steps', 'oral', 'estimate', 'fix'].includes(it.format) ? toTokens(it.text) : null
    const lines = t && exprSteps(t)?.length > 1 ? [showExpr(t), ...exprSteps(t).map(st => '= ' + showExpr(reduceAt(st.t, st.k, st.v)))] : t ? [`${showExpr(t)} = ${it.answer}`] : []
    if (it.format === 'first') lines.push(`先算 ${it.tokens[it.first]}`)
    if (it.format === 'clock') lines.push(`时针指在 ${it.minute ? `${Math.floor(it.answer / 2) || 12} 和 ${Math.floor(it.answer / 2) % 12 + 1} 的正中间` : `${Math.floor(it.answer / 2) || 12}`}`)
    if (it.format === 'multi') lines.push(...it.blanks.map(b => [b.a].flat().reduce((t, x) => t.replace('□', x), b.t)))
    if (it.format === 'fix') lines.unshift(`最先错的是第 ${it.bad + 1} 行`)
    if (it.format === 'plan') lines.unshift(`先求：${it.goals.find(g => g.ok).t}`)
    if (it.rem != null) lines.splice(0, lines.length, `${it.text} = ${it.answer} …… ${it.rem}`, `验算：${it.answer} × ${it.div} + ${it.rem} = ${it.answer * it.div + it.rem}`)
    if (it.remDiv) lines.splice(0, lines.length, `${showExpr(toTokens(it.choices.find(c => c.ok).t))} = ${it.answers.map(x => x.a).join(' …… ')}`)
    if (it.answers) lines.push(it.answers.reduce((t, x) => t.replace('□', `${x.a} ${x.unit}`), it.ask) + (it.tail ? ' ' + it.tail : ''))
    else if (it.ask) lines.push(`${it.ask} ${it.answer} ${it.unit}${it.tail ? ' ' + it.tail : ''}`)
    return { lines, explain: it.explain }
  }
  /** 答错以后「跟着正确做法再做一遍」：一步一个空，孩子填，不计金币。答案交卷后已经给孩子看过了 */
  function walk(it) {
    const out = [], NAME = ['个位', '十位', '百位', '千位', '万位']
    const chainOf = t => (exprSteps(t) || []).forEach(st => out.push({ q: `${showExpr(st.t)}，先算 ${showExpr(st.t.slice(st.k - 1, st.k + 2))} = □`, a: st.v }))
    if (it.format === 'column' && it.op === '÷') { it.div.q.forEach((x, j) => { if (x != null) out.push({ q: `${it.text}：商的第 ${j + 1} 位（对着被除数的第 ${j + 1} 位）写几？ □`, a: x }) }); if (it.rem) out.push({ q: `余数是 □`, a: it.rem }) }
    else if (it.format === 'column') it.cells.filter(c => c.kind === 'digit').forEach(c => out.push({ q: `${it.text}：${NAME[c.col]}写几？${c.cin ? `（别忘了${it.op === '−' ? '退位' : '进位'} ${c.cin}）` : ''} □`, a: c.v }))
    else if (it.format === 'stat') { it.cats.forEach((c, j) => out.push({ q: `${c}：□`, a: it.vals[j] })); out.push({ q: '合计：□', a: it.answer }); it.asks.forEach((q, j) => { if (q.use) out.push({ q: `（${j + 1}）${it.vals[q.use[0]]} ${q.use[1]} ${it.vals[q.use[2]]} = □`, a: q.ans, unit: q.unit, units: q.units }) }) }
    else if (it.format === 'data') out.push({ q: `${it.ask} □`, a: it.answer, unit: it.unit, units: it.units })
    else if (it.format === 'multistep') it.parts.forEach((P, k) => out.push({ q: `第${'一二三四'[k]}步：${P.e} = □`, a: P.v, unit: P.unit, units: P.units }))
    else if (it.answers) it.answers.forEach((x, j) => out.push({ q: it.answers.reduce((t, y, m) => t.replace('□', m < j ? `${y.a} ${y.unit}` : m === j ? '\u0000' : '……'), it.ask).replace('\u0000', '□'), a: x.a, unit: x.unit, units: it.units }))
    else if (it.rem != null) out.push({ q: `${it.text} = □ …… ${it.rem}（先填商）`, a: it.answer }, { q: `${it.text} = ${it.answer} …… □`, a: it.rem })
    else if (it.format === 'multi') it.blanks.forEach(b => [b.a].flat().forEach((x, j) => out.push({ q: [b.a].flat().reduce((t, y, m) => t.replace('□', m === j ? '\u0001' : m < j ? y : '…'), b.t).replace('\u0001', '□'), a: x })))
    else if (it.choices) { chainOf(toTokens(it.choices.find(c => c.ok).t)); out.push({ q: `${it.ask} □ ${it.tail || ''}`, a: it.answer, unit: it.unit, units: it.units }) }
    else if (['steps', 'oral', 'estimate', 'fix'].includes(it.format)) { const t = toTokens(it.text); if (exprSteps(t)?.length > 1) chainOf(t); else out.push({ q: `${it.text} = □`, a: it.answer }) }
    return out.length ? out : null
  }
  function finish(ctx, it, rec, J) {
    const s = ctx.state, ok = J.ok, firstOk = ok && !rec.caught
    const pb = rec.l2 ? 0 : { word: J.kw, steps: J.chainOk ? 2 : 0, estimate: J.rangeOk ? 2 : 0, multi: J.blankMiss ? 0 : 2, plan: J.goalOk ? 2 : 0, column: J.chainOk ? 2 : 0, multistep: (it.goals ? J.goalOk : J.habits.includes('格式规范')) ? 2 : 0 }[it.format] || 0
    const extra = ctx.day.groups.find(g => g.id === 'extra')?.items.includes(it.id)
    // 统计表按小问给金币：答对几问拿几份（每问一样多），答错的那问不给
    const frac = J.partsOk ? J.partsOk.filter(Boolean).length / J.partsOk.length : ok ? 1 : 0
    let { c, core } = coinsFor(it.price, frac, ok ? pb : 0), bonus = false
    if (extra) c = Math.ceil(c / 2)                      // 加练的题金币减半
    if (firstOk) { s.combo++; s.best = Math.max(s.best, s.combo); if (s.combo % 5 === 0) { c += 5; bonus = true } } else if (!rec.caught) s.combo = 0   // 被守护接住的，连击不断
    // 技能点：做出习惯就攒，攒满 SKILL_EVERY 次得 1 点，每个本领每天最多 1 点
    const points = []
    for (const k of J.habits) if (SKILL_EVERY[k]) {
      s.prog[k] = Math.min(SKILL_EVERY[k], (s.prog[k] || 0) + 1)
      if (s.prog[k] >= SKILL_EVERY[k] && s.ptDay?.[k] !== ctx.date) { s.prog[k] = 0; s.pts[k]++; (s.ptDay ||= {})[k] = ctx.date; points.push(SKILLS.find(x => x.k === k).n) }
    }
    if (!s.hatched) { s.hatched = true; s.st = 1; s.gift = { date: ctx.date, what: null }; mark(s, ctx.date, `从小窝里醒来了，${s.kid || '小主人'}给我起名叫${s.name || '小狗'}`) }
    s.coins += c; s.grow += c                            // grow 只是「一共赚过多少金币」，和长大无关
    s.qn++; const ym = ctx.date.slice(0, 7), M = s.months[ym] ||= [0, 0]; M[0]++; if (firstOk) M[1]++
    if (ok && ['word', 'plan'].includes(it.format)) s.lastSay = `${it.ask} ${it.answer}${it.unit || ''}${it.tail || ''}`
    if (s.slow > 0 && s.slowFrom !== it.id) s.slow--
    // 难度阶梯和列式档位：只看第一次交卷。最近 10 题 ≥85% 且跨两天升一档；最近 8 题 <60% 或连错 3 题降一档
    const step = (L, max) => {
      const rate = a => a.reduce((n, x) => n + x[0], 0) / a.length
      L.hist.push([firstOk ? 1 : 0, ctx.date]); if (L.hist.length > 10) L.hist.shift()
      const h = L.hist
      if (L.lv < max && h.length >= 10 && rate(h) >= 0.85 && new Set(h.map(x => x[1])).size >= 2) Object.assign(L, { lv: L.lv + 1, hist: [], moved: { dir: 'up', at: ctx.date } })
      else if (L.lv > 0 && ((h.length >= 8 && rate(h.slice(-8)) < 0.6) || (h.length >= 3 && h.slice(-3).every(x => !x[0])))) Object.assign(L, { lv: L.lv - 1, hist: [], moved: { dir: 'down', at: ctx.date } })
    }
    const key = `${it.kp}|${it.err}`
    step(s.ladder[key] ||= { lv: 1, hist: [] }, 2)
    if (flowOf(it).includes('build')) step((s.tiers ||= {})[key] ||= { lv: 0, hist: [] }, 2)   // 新的「知识点 × 错因」从第 0 档（选算式）开始
    // 3 级守护没用上：这周的次数退回
    let refund = ''
    if (rec.guard) { const U = s.uses?.[rec.guard]; if (U && U.w3 > 0) U.w3--; refund = SKILLS.find(x => x.k === rec.guard).n; rec.guard = null }
    rec.fin = { c, core, ok, partsOk: J.partsOk || null, pb, bonus, points, point: points[0] || '', extra: !!extra, grew: 0, items: J.items, habits: J.habits, caught: rec.caught || null, help: rec.help || [], refund, l2: !!rec.l2, ...solution(it), walk: ok ? null : walk(it) }
    ctx.log.push(row(ctx, it, { try: rec.caught ? 2 : 1, correct: ok, given: J.given, coins: c, trap_error_type: ok ? null : J.items.find(x => x.good === 'n')?.cat || it.err,
      step_failed: ok ? null : J.unitMiss && J.items.filter(x => x.good === 'n').length === 1 ? '忘写单位' : STEP_NAME[flowOf(it)[J.items.find(x => x.good === 'n')?.i]] || null,
      ms: rec.ms, help: rec.help?.length ? rec.help : null, steps: flowOf(it).map((_, i) => J.items.filter(x => x.i === i).every(x => x.good === 'y') ? 1 : 0).join('') }))
    const all = ctx.day.groups.flatMap(g => g.items)
    if (all.every(id => ctx.day.items[id]?.fin) && !ctx.day.done) {
      ctx.day.done = true; if (!ctx.day.flash) { s.pts['漏题']++; rec.fin.patrol = true }
      // 陪伴天数：做完当天的任务算陪了 1 天，周末也算，只增不减；毕业典礼以后不再计
      if (s.lastDay !== ctx.date && ctx.date <= SEASON.end) { s.days++; s.lastDay = ctx.date; rec.fin.day = s.days }
      // 出勤：心愿单按这个兑换
      // 按日历上的这一周算（一份题库可能用两周）
      if (s.att.week !== isoWeek(ctx.date)) s.att = { week: isoWeek(ctx.date), days: [] }
      if (!s.att.days.includes(ctx.date)) s.att.days.push(ctx.date)
      const need = Number(ctx.pack.tuning?.wish_days) || 4
      if (ctx.pack.tuning?.wish && s.att.days.length === need) { rec.fin.wish = String(ctx.pack.tuning.wish); mark(s, ctx.date, `这周来满 ${need} 天，可以兑换心愿：${rec.fin.wish}`) }
    }
    rec.fin.grew = grow(s, ctx.date)
    // 周五闯关：8 题都做完时结算，答对够数就解锁一页故事（不超过小狗现在的阶段；这一章读完了就改送明信片）
    const fri = ctx.day.groups.find(g => g.id === 'friday')
    if (fri?.items.includes(it.id) && !ctx.day.boss && fri.items.every(id => ctx.day.items[id]?.fin)) {
      const okN = fri.items.filter(id => ctx.day.items[id].fin.ok).length, pass = okN >= Math.min(BOSS_PASS, fri.items.length)
      let story = 0, card = null
      if (pass) {
        s.coins += BOSS_COINS; s.grow += BOSS_COINS
        if (s.story < Math.min(STORY_PAGES, stageOf(s, ctx.date) * 4)) story = ++s.story
        else card = giveCard(s, ctx.date)
        mark(s, ctx.date, `周五闯关成功，${fri.items.length} 题答对 ${okN} 题`)
      }
      ctx.day.boss = rec.fin.boss = { pass, okN, n: fri.items.length, story, card, coins: pass ? BOSS_COINS : 0 }
    }
    return { ok: true, fin: rec.fin }
  }
  const row = (ctx, it, x) => ({ item: it.id, tpl: it.tpl, kp: it.kp, err: it.err, format: it.format, level: it.level, bucket: it.bucket, day: ctx.date, at: new Date(ctx.now).toISOString(), trap_error_type: null, step_failed: null, ms: null, ...x })
  function answer(ctx, body) {
    const it = ctx.pack?.items.find(x => x.id === body.item)
    if (!it || !ctx.day.groups.some(g => g.items.includes(it.id))) return json({ error: '这道题不在今天的任务里' }, 400)
    if (!FORMATS.includes(it.format)) return json({ error: '不认识的题型' }, 400)
    const rec = ctx.day.items[it.id] ||= {}
    if (rec.fin) return json({ error: '这道题已经做完了' }, 400)
    const ms = Math.min(Number(body.ms) || 0, 600000)
    rec.ms = (rec.ms || 0) + ms
    ctx.day.ms = (ctx.day.ms || 0) + Math.min(ms, 300000)      // 今天做题用了多久（一道题最多算 5 分钟）
    const steps = Array.isArray(body.steps) ? [...body.steps] : [], ci = flowOf(it).indexOf('circle')
    if (rec.circle && ci >= 0) steps[ci] = { sel: rec.circle }      // 圈关键词按点评时定下来的算
    const J = judge(it, steps)
    // 3 级守护：错在它管的地方，先拦下来，回去改那一步再交（这次不算首答正确）
    const first = J.items.find(x => x.good === 'n' && !(rec.circle && x.i === ci))     // 圈关键词已经点评过、改不了，守护不拦它
    if (!J.ok && rec.guard && first && first.cat === rec.guard) {
      const k = rec.guard; rec.guard = null
      rec.caught = { k, n: SKILLS.find(x => x.k === k).n, msg: first.msg, step: first.i }
      ctx.log.push(row(ctx, it, { try: 1, correct: false, caught: SKILLS.find(x => x.k === k).n, help: rec.help?.length ? rec.help : null, given: J.given, trap_error_type: first.cat, step_failed: STEP_NAME[flowOf(it)[first.i]], ms }))
      return { ok: false, caught: rec.caught }
    }
    // 急着答错：整道题的用时比最短思考时间还短。只是忘写单位不算
    const strict = Number(ctx.pack.tuning?.slow ?? 1)
    const fast = !J.ok && strict > 0 && !(J.unitMiss && J.items.filter(x => x.good === 'n').length === 1) && rec.ms < MIN_SECONDS[it.format] * 1000 * strict
    if (fast) { ctx.day.flash++; ctx.state.slow = 3; ctx.state.slowFrom = it.id }   // 接下来 3 道题先盖住几秒
    const res = finish(ctx, it, rec, J)
    res.fin.flash = fast
    return res
  }
  /** 孩子点了本领徽章：扣次数，返回效果。2 级要用到答案的信息在这里算，答案不出后端。 */
  function useSkill(ctx, b) {
    const s = ctx.state, k = b.k, L = Number(b.L), sk = SKILLS.find(x => x.k === k)
    const it = ctx.pack?.items.find(x => x.id === b.item), rec = it && ctx.day?.items[it.id]
    const type = it && flowOf(it)[Number(b.step)]
    if (!sk || ![1, 2, 3].includes(L) || (s.skill[k] || 0) < L) return { msg: '还没学会这一级。' }
    if (!it || !ctx.day.groups.some(g => g.items.includes(it.id)) || rec?.fin) return { msg: '' }
    if (!SKILL_AT[k].includes(type) || (L === 2 && !SKILL_L2[k].includes(type))) return { msg: '这一步用不上。' }
    const U = s.uses[k] ||= {}, wk = isoWeek(ctx.date)
    if (U.day !== ctx.date) Object.assign(U, { day: ctx.date, d1: 0, d2: 0 })
    if (U.week !== wk) Object.assign(U, { week: wk, w3: 0 })
    const used = L === 1 ? U.d1 : L === 2 ? U.d2 : U.w3
    if (used >= SKILL_USES[L]) return { msg: `${L === 3 ? '这周' : '今天'}的次数用完了。` }
    const r = ctx.day.items[it.id] ||= {}, fx = { k, L }
    if (L === 3) { if (r.guard) return { msg: '这题已经有本领守着了。' }; r.guard = k }
    if (L === 2) {
      r.l2 = true
      if (k === '审题') fx.grey = (it.segs || []).flatMap((x, i) => x.n ? [i] : [])     // 用不上的那句（切碎后是几段）都变灰
      if (k === '策略缺失') fx.strike = it.goals ? it.goals.map((g, i) => [g, i]).filter(([g]) => !g.ok).at(-1)?.[1] ?? -1 : -1
      if (k === '计算失误' && type === 'column' && it.op === '÷') fx.digits = String(it.answer).length
      else if (k === '计算失误' && type === 'column') fx.paws = it.cells.filter(c => c.kind === 'carry' && c.v).map(c => c.col)
      else if (k === '计算失误' && type !== 'chain') fx.digits = String(it.answer).length
      if (k === '漏题' && type === 'column' && it.op === '÷') { const h = Math.pow(10, String(it.a).length - 1), ea = Math.round(it.a / h) * h; fx.est = `${it.a} 接近 ${ea}，${ea} ÷ ${it.b} 大约是 ${Math.round(ea / it.b)}。你的商和它接近吗？` }
      else if (k === '漏题' && type === 'column') { const r10 = x => x >= 100 ? Math.round(x / 100) * 100 : Math.round(x / 10) * 10, ea = r10(it.a), eb = it.op === '×' ? it.b : r10(it.b); fx.est = `${it.a} 接近 ${ea}${it.op === '×' ? '' : `，${it.b} 接近 ${eb}`}，${ea} ${it.op} ${eb} = ${calcOp(ea, it.op, eb)}。你的得数和它接近吗？` }
    }
    if (L === 1 && k === it.err && it.hint) fx.hint = it.hint
    if (L === 1) U.d1++; else if (L === 2) U.d2++; else U.w3++
    ;(r.help ||= []).push(`${sk.n} ${L} 级`)
    return { msg: '', fx }
  }
  /** 每个本领今天 / 这周还剩几次 */
  const usesLeft = (s, date) => Object.fromEntries(SKILLS.map(({ k }) => { const U = s.uses?.[k] || {}, d = U.day === date, w = U.week === isoWeek(date); return [k, { 1: SKILL_USES[1] - (d ? U.d1 : 0), 2: SKILL_USES[2] - (d ? U.d2 : 0), 3: SKILL_USES[3] - (w ? U.w3 : 0) }] }))

  // ---------- 照顾、买东西、学本领、散步、陪玩 ----------
  function act(ctx, b) {
    const s = ctx.state, date = ctx.date, st = stageOf(s, date), kid = s.kid || '小主人'
    if (b.kind === 'name') { const n = cleanName(b.name); if (!n) return { msg: '先给它起个名字吧。' }; if (!s.name) mark(s, date, `给小狗起名叫${n}`); s.name = n; return { msg: `我叫${n}！那你叫什么名字？` } }
    if (b.kind === 'kidname') { const n = cleanName(b.name); if (!n) return { msg: `写上你的名字，${s.name || '小狗'}才知道怎么叫你。` }; if (!s.kid) s.greet = date; s.kid = n; return { msg: `${n}，你好！` } }      // 第一次认识就算今天打过招呼了
    if (b.kind === 'skill') return useSkill(ctx, b)
    if (b.kind === 'circle') {
      // 圈完关键词马上点评一次：第一次圈的就定下来（判分用这个），之后回到这一步只能看，不能改了再判
      const it = ctx.pack?.items.find(x => x.id === b.item)
      if (!it?.segs || !ctx.day.groups.some(g => g.items.includes(it.id)) || !flowOf(it).includes('circle')) return { msg: '这道题没有圈关键词。' }
      const r = ctx.day.items[it.id] ||= {}
      if (r.fin) return { msg: '这道题已经做完了。' }
      r.circle ||= [...new Set((Array.isArray(b.sel) ? b.sel : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < it.segs.length))]
      const c = judgeCircle(it, { sel: r.circle }), sel = new Set(r.circle)
      const keys = it.segs.flatMap((x, j) => x.k ? [j] : []), noise = it.segs.flatMap((x, j) => x.n ? [j] : [])
      return { circle: { sel: r.circle, keys, noise, kw: c.kw, missed: keys.filter(j => !sel.has(j)).map(j => it.segs[j].t), extra: noise.filter(j => sel.has(j)).map(j => it.segs[j].t), why: it.why || '' } }
    }
    if (b.kind === 'greet') { s.greet = date; return { msg: `${kid}，我们今天也一起慢慢来！`, act: 'wag' } }
    if (b.kind === 'buy') {
      const x = GOODS.find(g => g.k === b.k); if (!x) return { msg: '没有这个东西。' }
      if (x.kind === 'keep' && s.own[x.k]) return { msg: '已经有了。' }
      const p = x.place && PLACES.find(q => q.k === x.place)
      if (p && !placeOpen(p, st, date)) return { msg: `${p.n}开放以后才能买。` }
      if (x.month && x.month !== +date.slice(5, 7)) return { msg: `这是 ${x.month} 月限定，${x.month} 月才卖。` }
      if (s.coins < x.p) return { msg: `还差 ${x.p - s.coins} 金币，做任务就能赚到。` }
      s.coins -= x.p
      if (x.kind === 'keep') { s.own[x.k] = true; mark(s, date, `买了${x.n}`) } else if (x.kind === 'toy') s.toy[x.k] = (s.toy[x.k] || 0) + x.uses; else s.bag[x.k] = (s.bag[x.k] || 0) + 1
      return { msg: x.kind === 'keep' ? `买到「${x.n}」了，${p ? `已经摆在${p.n}。` : '回小屋看看。'}` : `「${x.n}」放进背包了，回小屋就能用。` }
    }
    if (b.kind === 'toy') {
      const k = Object.keys(s.toy).find(k => s.toy[k] > 0); if (!k) return { msg: '没有玩具了。小卖部有橡胶小球和飞盘。', act: 'think' }
      const x = GOODS.find(g => g.k === k); s.toy[k]--; add(s, 'mood', x.mood); return { msg: `玩${x.n}真开心！心情 ＋${x.mood}。`, act: 'catch' }
    }
    if (b.kind === 'food' || b.kind === 'soap') {
      const x = GOODS.filter(g => g.kind === b.kind && s.bag[g.k] > 0).sort((p, q) => q.p - p.p)[0]
      if (!x) return { msg: b.kind === 'food' ? '背包里没有吃的了，去小卖部看看？' : '没有香皂了，小卖部有泡泡香皂。', act: 'think' }
      s.bag[x.k]--
      if (b.kind === 'food') { add(s, 'full', x.full); if (x.mood) add(s, 'mood', x.mood); return { msg: `${x.n}好好吃！饱食 ＋${x.full}。`, act: 'eat' } }
      add(s, 'clean', x.clean); return { msg: '泡泡澡好舒服，香香的！', act: 'bath' }
    }
    if (b.kind === 'pat') {
      if (s.pats.date !== date) s.pats = { date, n: 0 }
      if (s.pats.n >= PATS_PER_DAY) return { msg: '今天已经摸了好多次啦，陪我玩吧！', act: 'wag' }
      s.pats.n++; add(s, 'mood', 3); return { msg: '嘿嘿，舒服。心情 ＋3。', act: 'shake' }
    }
    if (b.kind === 'learn') {
      const k = b.k, lv = s.skill[k]; if (lv == null || lv >= 3 || s.pts[k] < SKILL_COST[lv]) return { msg: '技能点还不够。' }
      const sk = SKILLS.find(x => x.k === k)
      s.pts[k] -= SKILL_COST[lv]; s.skill[k]++; mark(s, date, `学会了「${sk.n}」第 ${lv + 1} 级`); return { msg: `我学会「${sk.n}」第 ${lv + 1} 级啦！${lv === 0 ? '多了一个把戏，点「把戏」看我表演。' : ''}`, act: 'wag' }
    }
    if (b.kind === 'event') {
      const ev = s.hatched && s.event !== date && eventOf(date, s.skill['概念不清'] >= 2); if (!ev) return { msg: '' }
      s.event = date
      const done = ev.done.replace('{name}', s.name || '小狗')
      if (hash(date + 'ev') % 2) { s.coins += EVENT_COINS; mark(s, date, done); return { msg: `${done} 得到 ${EVENT_COINS} 金币。`, act: 'wag' } }
      mark(s, date, done, { photo: ev.k }); return { msg: `${done} 拍了一张照片，放进日记了。`, act: 'wag' }
    }
    if (b.kind === 'trip') {
      const p = PLACES.find(x => x.k === b.k && x.trip != null)
      if (!p || !placeOpen(p, st, date)) return { msg: '这里还没开放。' }
      if (s.trip?.date === date) return { msg: '今天已经散过步啦，明天再来。' }
      if (s.coins < p.trip) return { msg: `去${p.n}要 ${p.trip} 金币，还差 ${p.trip - s.coins}。` }
      s.coins -= p.trip; s.trip = { date, k: p.k }; add(s, 'mood', TRIP_MOOD); if (!s.visited.includes(p.k)) s.visited.push(p.k)
      const pending = POSTCARD_DAYS.some(d => d > (s.pcLast || '') && d <= date)
      const card = pending ? giveCard(s, date, p.k) : null
      if (card) { s.pcLast = date; return { msg: `散步真开心！我带回来一张明信片。心情 ＋${TRIP_MOOD}。`, act: 'wag', anim: 'walk', card } }
      const i = hash(date + p.k) % p.finds.length, f = p.finds[i], f2 = s.skill['审题'] >= 2 ? p.finds[(i + 1) % p.finds.length] : ''
      mark(s, date, `在${p.n}散步，捡到${f}${f2 ? `，灵鼻子还嗅到了${f2}` : ''}`)
      return { msg: `散步真开心！我捡到了${f}${f2 ? `，还用灵鼻子嗅到了${f2}` : ''}。心情 ＋${TRIP_MOOD}。`, act: 'wag', anim: 'walk' }
    }
    if (b.kind === 'jar') {
      if (s.grad || date >= SEASON.ceremony) return { msg: '储蓄罐已经在毕业典礼上打开了。' }
      const n = Math.min(JAR.step, JAR.goal - s.jar)
      if (n <= 0) return { msg: '储蓄罐存满啦！' }
      if (s.coins < n) return { msg: `存一次要 ${n} 金币，还差 ${n - s.coins}。` }
      s.coins -= n; s.jar += n
      if (s.jar >= JAR.goal) mark(s, date, '毕业旅行基金存满了')
      return { msg: s.jar >= JAR.goal ? '存满啦！毕业典礼那天一起去旅行。' : `存进 ${n}，罐子里有 ${s.jar} 了。` }
    }
    if (b.kind === 'hide') {
      if (!s.hatched) return { msg: '' }
      if (s.hide?.date === date && s.hide.win) return { msg: '今天已经找到骨头啦，明天再藏。' }
      if (s.hide?.date !== date || (b.hard != null && !s.hide.open.length && !!b.hard !== s.hide.hard)) s.hide = makeHide(date, b.hard && s.skill['计算失误'] >= 2)
      return { msg: '' }
    }
    if (b.kind === 'cup') {
      const H = s.hide, i = Number(b.i)
      if (H?.date !== date || H.win || !H.cups[i] || H.open.includes(i)) return { msg: '' }
      H.open.push(i)
      if (H.cups[i].v === H.target) { H.win = true; add(s, 'mood', 20); return { msg: `${kid}找到啦！骨头好香，明天再藏给你找。心情 ＋20。`, act: 'wag' } }
      return { msg: `这只下面是 ${H.cups[i].v}，骨头不在这儿。再看看线索。` }
    }
    if (b.kind === 'ceremony') {
      if (date < SEASON.ceremony) return { msg: `毕业典礼在 ${+SEASON.ceremony.slice(5, 7)} 月 ${+SEASON.ceremony.slice(8)} 日。` }
      if (s.grad) return { msg: '毕业典礼已经办过啦。' }
      s.grad = date
      mark(s, date, `举行了毕业典礼。${s.jar >= JAR.goal ? '毕业旅行基金存满了，一起去海边旅行！' : s.jar ? `毕业旅行基金存了 ${s.jar}，一起去公园野餐了一次。` : ''}`)
      return { msg: `${kid}，谢谢你陪我一整个学期！`, act: 'wag' }
    }
    if (b.kind === 'extra') {
      // 加练：今天的任务做完后可以再要几题，金币减半；有每天的题数和时长上限
      const t = ctx.pack?.tuning || {}, cap = Number(t.extra ?? 10), mins = Number(t.minutes ?? 25), used = Math.round((ctx.day?.ms || 0) / 60000)
      if (!ctx.day?.done) return { msg: '先把今天的任务做完。' }
      let g = ctx.day.groups.find(x => x.id === 'extra')
      if (used >= mins) return { msg: `今天已经练了 ${used} 分钟，够啦，明天见。` }
      if ((g?.items.length || 0) >= cap) return { msg: '今天的加练做满了，明天见。' }
      const today = new Set(ctx.day.groups.flatMap(x => x.items)), seen = new Set(ctx.log.map(r => r.item))
      const bossGroups = new Set(ctx.pack.groups.filter(x => x.boss).map(x => x.id))
      const pool = ctx.pack.items.filter(it => FORMATS.includes(it.format) && !today.has(it.id) && !seen.has(it.id) && !bossGroups.has(it.group))
        .map(it => [hash(ctx.date + 'x' + it.id), it]).sort((p, q) => p[0] - q[0]).map(p => p[1])
      const out = [], per = {}
      for (const it of pool) { if (out.length >= Math.min(EXTRA_STEP, cap - (g?.items.length || 0))) break; if ((per[it.tpl] || 0) >= 1) continue; per[it.tpl] = 1; out.push(it.id) }
      if (!out.length) return { msg: '这周的题都做过啦，明天见。' }
      if (g) g.items.push(...out); else ctx.day.groups.push({ id: 'extra', items: out })
      return { msg: `多了 ${out.length} 道加练题，金币减半。`, extra: out.length }
    }
    return { msg: '' }
  }

  /** 存题库包（家长端 push，或管理员页面上传）。家长用 tune 改了名字：写进第一个孩子账号的存档 */
  async function savePack(pack, S) {
    const bad = checkPack(pack)
    if (bad.length) return json({ error: '题库包格式不对：' + bad.join('；'), problems: bad }, 400)
    await store.set('pack', pack)
    const weeks = (await store.get('pack-weeks')) || []        // 导入过哪些周：管理员导出答题记录时选
    if (!weeks.includes(pack.week)) await store.set('pack-weeks', [...weeks, pack.week].sort().slice(-12))
    const t = pack.tuning || {}, st = await S.get('state')
    if (st && (cleanName(t.kid_name) || cleanName(t.pet_name))) { if (cleanName(t.kid_name)) st.kid = cleanName(t.kid_name); if (cleanName(t.pet_name)) st.name = cleanName(t.pet_name); await S.set('state', st) }
    return json({ ok: true, week: pack.week, items: pack.items.length, days: Math.min(...packDays(pack).filter(g => pack.items.some(it => it.group === g.id)).map(g => g.days)) })
  }

  // ---------- 账号管理（管理员） ----------
  async function admin(req, p, body) {
    let list = await users()
    const pub = u => ({ id: u.id, name: u.name, off: !!u.off, created: u.created, seen: u.seen || null })
    if (p === '/admin/users' && req.method === 'GET') {
      // 顺便带上每个孩子的小狗名字和陪伴天数，方便认人（不带答题记录）
      const out = []
      for (const u of list) { const st = await scoped(store, u.id).get('state'); out.push({ ...pub(u), pet: st?.name || '', kid: st?.kid || '', days: st?.days || 0 }) }
      const pack = await store.get('pack'), days = pack && packDays(pack).filter(g => pack.items.some(it => it.group === g.id))
      return json({ users: out, weeks: (await store.get('pack-weeks')) || (pack ? [pack.week] : []), pack: pack ? { week: pack.week, created: pack.created, items: pack.items.length, days: Math.min(...days.map(g => g.days)), groups: days } : null })
    }
    // 导出答题记录（文件，家长端 npm run kid pull 读入）。答题记录按题库包的周存
    if (p === '/admin/log' && req.method === 'GET') {
      const url = new URL(req.url), u = list.find(x => x.id === url.searchParams.get('user')), week = url.searchParams.get('week')
      if (!u || !/^\d{4}-W\d{2}$/.test(week || '')) return json({ error: '选一个账号和一周' }, 400)
      const S = scoped(store, u.id)
      return json({ format: LOG_FORMAT, week, user: u.name, made: new Date().toISOString(), log: (await S.get(`log:${week}`)) ?? [], state: await S.get('state') })
    }
    // 上传题库包：家长端 npm run kid pack <周> <文件> 生成的文件。命令行推不上去时（比如站点开了 Netlify 登录保护）用
    if (p === '/admin/pack' && req.method === 'POST') return savePack(body.pack, scoped(store, 'main'))
    if (req.method !== 'POST') return json({ error: '不支持' }, 405)
    if (p === '/admin/users') {
      const name = userName(body.name)
      if (!name) return json({ error: '用户名不能是空的（最多 12 个字，不能有空格）' }, 400)
      if (name.toLowerCase() === 'admin' || list.some(u => u.name.toLowerCase() === name.toLowerCase())) return json({ error: `已经有叫「${name}」的账号了` }, 400)
      if (!pinOk(body.pin)) return json({ error: '密码要是 4 位数字' }, 400)
      const salt = crypto.randomUUID(), u = { id: list.some(x => x.id === 'main') ? crypto.randomUUID().slice(0, 8) : 'main', name, salt, hash: await pinHash(salt, body.pin), created: new Date().toISOString() }
      list = [...list, u]; await store.set('users', list)
      return json({ ok: true, user: pub(u) })
    }
    const m = p.match(/^\/admin\/users\/([\w-]+)$/), u = m && list.find(x => x.id === m[1])
    if (!u) return json({ error: '没有这个账号' }, 404)
    if (body.pin != null) { if (!pinOk(body.pin)) return json({ error: '密码要是 4 位数字' }, 400); u.salt = crypto.randomUUID(); u.hash = await pinHash(u.salt, body.pin); await store.set(`fail:${u.name.toLowerCase()}`, { n: 0, until: 0 }) }
    if (body.name != null) { const name = userName(body.name); if (!name || name.toLowerCase() === 'admin' || list.some(x => x !== u && x.name.toLowerCase() === name.toLowerCase())) return json({ error: '这个用户名不能用或已经有人用了' }, 400); u.name = name }
    if (body.off != null) u.off = !!body.off
    // 改孩子的名字、小狗的名字：写进这个账号的存档（还没进过小屋的先建一个空存档，进来时不用再起名）
    if (body.kid != null || body.pet != null) {
      const S = scoped(store, u.id), st = (await S.get('state')) || { ...freshState(), needs: { ...freshState().needs, at: Date.now() } }, n = cleanName(body.kid ?? body.pet)
      if (!n) return json({ error: '名字不能是空的（最多 6 个字）' }, 400)
      if (body.kid != null) st.kid = n; else st.name = n
      await S.set('state', st)
    }
    await store.set('users', list)
    return json({ ok: true, user: pub(u) })
  }

  // ---------- 路由 ----------
  return async function handle(req) {
    const url = new URL(req.url), p = url.pathname.replace(/^\/api\/kid/, '')
    if (!env.SYNC_TOKEN) return json({ error: '孩子端还没有设置同步令牌' }, 503)
    // 家长端同步：用同步令牌，不用孩子的密码。题库大家共用；答题记录默认取第一个孩子账号的，?user=用户名 取别的账号
    if (p === '/pack' || p === '/log') {
      if (req.headers.get('x-sync-token') !== env.SYNC_TOKEN) return json({ error: '同步令牌不对' }, 401)
      const list = await users(), who = url.searchParams.get('user'), u = who ? list.find(x => x.name === who) : list.find(x => x.id === 'main') || list[0]
      if (who && !u) return json({ error: `没有叫「${who}」的账号` }, 404)
      const S = scoped(store, u?.id || 'main')
      if (p === '/pack' && req.method === 'PUT') return savePack(await req.json().catch(() => null), S)
      if (p === '/log' && req.method === 'GET') return json({ format: LOG_FORMAT, week: url.searchParams.get('week'), user: u?.name || null, log: (await S.get(`log:${url.searchParams.get('week')}`)) ?? [], state: await S.get('state') })
      return json({ error: '不支持' }, 405)
    }
    // 拨时钟：本地开发随便拨；dev 分支部署（env.CLOCK）要带同步令牌；正式站没有这个接口
    if ((env.DEV || (env.CLOCK && req.headers.get('x-sync-token') === env.SYNC_TOKEN)) && p === '/dev/clock' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), ms = b.date ? Date.parse(`${b.date}T${b.time || '16:00'}:00+08:00`) - Date.now() : 0
      await store.set('dev-clock', ms); return json({ ok: true, offset: ms })
    }
    if (p === '/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie('kid', '', 0) })
    if (p === '/login' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})), name = userName(body.name), admin = name.toLowerCase() === 'admin'
      const fk = `fail:${name.toLowerCase() || '?'}`, fail = await load(fk, { n: 0, until: 0 })
      if (Date.now() < fail.until) return json({ error: '试了太多次，5 分钟后再来' }, 429)
      const u = admin ? null : (await users()).find(x => x.name.toLowerCase() === name.toLowerCase())
      const good = admin ? env.ADMIN_PIN && String(body.pin) === String(env.ADMIN_PIN) : u && !u.off && pinOk(body.pin) && u.hash === await pinHash(u.salt, body.pin)
      if (!good) {
        const n = fail.n + 1; await store.set(fk, n >= 5 ? { n: 0, until: Date.now() + 300000 } : { n, until: 0 })
        return json({ error: u?.off ? '这个账号停用了，找爸爸妈妈' : admin && !env.ADMIN_PIN ? '还没有设置管理员密码（ADMIN_PIN）' : '用户名或密码不对' }, 401)
      }
      await store.set(fk, { n: 0, until: 0 })
      if (admin) return json({ ok: true, admin: true }, 200, { 'set-cookie': cookie('adm', await sign('admin', await digest(`admin:${env.ADMIN_PIN}`)), 86400 * 7) })
      return json({ ok: true, name: u.name }, 200, { 'set-cookie': cookie('kid', await sign(u.id, u.hash)) })
    }
    const me = await whoami(req)
    if (p.startsWith('/admin')) {
      if (p === '/admin/logout') return json({ ok: true }, 200, { 'set-cookie': cookie('adm', '', 0) })
      if (!me.admin) return json({ error: '请先用管理员账号登录' }, 401)
      return admin(req, p, req.method === 'POST' ? await req.json().catch(() => ({})) : {})
    }
    if (!me.user) return json({ error: me.admin ? '管理员账号不能养小狗，换孩子的账号登录' : '请先登录' }, 401)
    const S = scoped(store, me.user.id)
    const ctx = await context(S)
    if (p === '/state' && req.method === 'GET') {
      if (me.user.seen !== ctx.date) { const list = await users(), u = list.find(x => x.id === me.user.id); if (u) { u.seen = ctx.date; await store.set('users', list) } }
      await save(ctx); return json({ ...view(ctx), user: me.user.name })
    }
    if (req.method !== 'POST') return json({ error: '不支持' }, 405)
    const body = await req.json().catch(() => ({}))
    if (p === '/answer') {
      if (!ctx.pack) return json({ error: '还没有题库' }, 400)
      let res
      try { res = answer(ctx, body) } catch (e) { console.error(e); return json({ error: '这道题的作答格式不对，刷新一下再做' }, 400) }
      if (res instanceof Response) return res
      await save(ctx)
      return json({ ...res, view: view(ctx) })
    }
    if (p === '/act') { let res; try { res = act(ctx, body) } catch (e) { console.error(e); return json({ error: '出错了，刷新一下再试' }, 400) } await save(ctx); return json({ ...res, view: view(ctx) }) }
    return json({ error: '找不到' }, 404)
  }
}
