// 孩子端后端：判分、金币、照顾、存档都在这里，页面拿不到答案。
// 存储只要有 get(key) / set(key, value) 两个方法：线上是 Netlify Blobs（kid/functions/kid.mjs），本地开发是文件（kid/vite.config.js）。
import { PACK_VERSION, FORMATS, MIN_SECONDS, SKILLS, SKILL_COST, GOODS, DECAY, NEED_FLOOR, PATS_PER_DAY, LEVELS, LEVEL_MIX, STORY_PAGES, BOSS_SIZE, BOSS_PASS, BOSS_COINS, EXTRA_STEP, STAGES,
  SEASON, PLACES, POSTCARDS, POSTCARD_DAYS, JAR, TRIP_MOOD, EVENT_COINS, coinsFor, publicItem, stageOf, placeOpen, eventOf, cleanName, addDays } from '../../shared/contract.js'

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
  alumni: [], grad: '', qn: 0, months: {}, visited: [], lastSay: '' })

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
  const groups = pack.groups.filter(g => !(friday && g.boss)).map(g => {
    const pool = items.filter(it => it.group === g.id), fresh = pool.filter(it => !seen.has(it.id))
    const ordered = [...order(fresh.filter(it => redo.has(it.tpl))), ...order(fresh.filter(it => !redo.has(it.tpl))), ...order(pool.filter(it => seen.has(it.id)))]
    const want = friday ? Math.ceil((g.daily || 4) / 2) : g.daily || 4, out = [], perTpl = {}
    for (const it of ordered) { if (out.length >= want) break; if ((perTpl[it.tpl] || 0) >= 2) continue; perTpl[it.tpl] = (perTpl[it.tpl] || 0) + 1; out.push(it.id) }
    return { id: g.id, items: out }
  }).filter(g => g.items.length)
  if (friday) {
    const taken = new Set(groups.flatMap(g => g.items))
    const cand = items.filter(it => !seen.has(it.id) && !taken.has(it.id)).sort((p, q) => LEVELS.indexOf(q.level) - LEVELS.indexOf(p.level) || hash(date + p.id) - hash(date + q.id))
    const out = [], perTpl = {}
    for (const round of [1, 2]) for (const it of cand) { if (out.length >= BOSS_SIZE) break; if ((perTpl[it.tpl] || 0) >= round || out.includes(it.id)) continue; perTpl[it.tpl] = (perTpl[it.tpl] || 0) + 1; out.push(it.id) }
    if (out.length) groups.push({ id: 'friday', items: out })
  }
  return groups
}

export function createApi(store, env) {
  const load = async (k, d) => (await store.get(k)) ?? d
  const session = async () => digest(`kid:${env.KID_PIN}`)
  // 本地开发可以拨时间（POST /api/kid/dev/clock），线上没有这个接口
  let offset = 0
  const nowMs = () => Date.now() + offset

  async function context() {
    if (env.DEV) offset = await load('dev-clock', 0)
    const pack = await store.get('pack')
    const now = nowMs(), date = today(new Date(now))
    const raw = await store.get('state')
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
    let day = await store.get(`day:${date}`)
    const ids = new Set(pack?.items.map(it => it.id))   // 家长重新推送后题号对不上，就重抽今天的题
    if (pack && (!day || day.week !== pack.week || day.groups.some(g => g.items.some(id => !ids.has(id))))) { day = { date, week: pack.week, groups: pickToday(pack, log, date, state.ladder), items: {}, flash: 0, done: false }; await store.set(`day:${date}`, day) }
    return { pack, state, date, log, day, now }
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
      today: day ? day.groups.map(dg => ({ ...(dg.id === 'friday' ? FRIDAY : dg.id === 'extra' ? EXTRA : pack.groups.find(g => g.id === dg.id)), items: dg.items.map(id => ({ ...publicItem(byId[id]), done: day.items[id]?.fin || null, step: day.items[id]?.step || 0, kw: day.items[id]?.kwRes || null, expr: day.items[id]?.expr || null, p: day.items[id]?.pub || null })) })) : [],
      allDone: !!day?.done,
      wish: pack?.tuning?.wish ? { text: String(pack.tuning.wish), need: Number(pack.tuning.wish_days) || 4, got: s.att.week === pack.week ? s.att.days.length : 0 } : null,
      morning: s.hatched && s.name && s.kid && s.greet !== date ? { gift: s.gift?.date === date ? s.gift.what : null, note: pack?.tuning?.note ? String(pack.tuning.note) : '', facts: facts(ctx) } : null,
      facts: facts(ctx),
      event: ev && { t: ev.t, b: ev.b },
      hide: H && { cups: H.cups.map(c => c.e), target: H.target, open: H.open.map(i => ({ i, v: H.cups[i].v })), win: H.win, hard: H.hard },
      walked: s.trip?.date === date ? s.trip.k : '',
      boss: pack ? { day: Number(pack.tuning?.boss_day ?? 5), groups: pack.groups.filter(g => g.bucket === '本周重点' && !g.boss).map(g => g.name) } : null,
    }
  }
  const save = async ctx => { await store.set('state', ctx.state); if (ctx.day) await store.set(`day:${ctx.date}`, ctx.day); if (ctx.pack) await store.set(`log:${ctx.pack.week}`, ctx.log) }
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

  // ---------- 做题 ----------
  function finish(ctx, it, rec) {
    const s = ctx.state, w = rec.w
    const q = w === 0 ? 1 : w === 1 ? (it.format === 'first' ? 0.3 : 0.5) : w === 2 ? 0.3 : 0
    const pb = { word: rec.kw ?? 0, steps: 2, estimate: rec.rangeOk ? 2 : 0, multi: rec.blankMiss ? 0 : 2, plan: rec.goalOk ? 2 : 0 }[it.format] || 0
    const extra = ctx.day.groups.find(g => g.id === 'extra')?.items.includes(it.id)
    let { c, core } = coinsFor(it.price, q, pb), bonus = false, point = ''
    if (extra) c = Math.ceil(c / 2)                      // 加练的题金币减半
    if (w === 0) { s.combo++; s.best = Math.max(s.best, s.combo); if (s.combo % 5 === 0) { c += 5; bonus = true } } else s.combo = 0
    if (w === 0 && it.level !== '同构' && s.prog[it.err] != null) { if (++s.prog[it.err] >= 5) { s.prog[it.err] = 0; s.pts[it.err]++; point = SKILLS.find(x => x.k === it.err).n } }
    if (!s.hatched) { s.hatched = true; s.st = 1; s.gift = { date: ctx.date, what: null }; mark(s, ctx.date, `从小窝里醒来了，${s.kid || '小主人'}给我起名叫${s.name || '小狗'}`) }
    s.coins += c; s.grow += c                            // grow 只是「一共赚过多少金币」，和长大无关
    s.qn++; const ym = ctx.date.slice(0, 7), M = s.months[ym] ||= [0, 0]; M[0]++; if (w === 0) M[1]++
    if (q > 0 && ['word', 'plan'].includes(it.format)) s.lastSay = `${it.ask} ${it.answer}${it.unit || ''}${it.tail || ''}`
    if (s.slow > 0 && s.slowFrom !== it.id) s.slow--
    // 难度阶梯：只看每道题的第一次作答。最近 10 题 ≥85% 且跨两天升一档；最近 8 题 <60% 或连错 3 题降一档
    const L = s.ladder[`${it.kp}|${it.err}`] ||= { lv: 1, hist: [] }, rate = a => a.reduce((n, x) => n + x[0], 0) / a.length
    L.hist.push([w === 0 ? 1 : 0, ctx.date]); if (L.hist.length > 10) L.hist.shift()
    const h = L.hist
    if (L.lv < 2 && h.length >= 10 && rate(h) >= 0.85 && new Set(h.map(x => x[1])).size >= 2) Object.assign(L, { lv: L.lv + 1, hist: [], moved: { dir: 'up', at: ctx.date } })
    else if (L.lv > 0 && ((h.length >= 8 && rate(h.slice(-8)) < 0.6) || (h.length >= 3 && h.slice(-3).every(x => !x[0])))) Object.assign(L, { lv: L.lv - 1, hist: [], moved: { dir: 'down', at: ctx.date } })
    rec.fin = { c, core, q, w, pb, bonus, point, extra: !!extra, grew: 0, ok: q > 0, explain: it.explain }
    if (q > 0) ctx.log.push(row(ctx, it, { try: w + 1, correct: true, given: it.format === 'first' ? '先算 ' + it.tokens[it.first] : it.format === 'multi' ? it.blanks.map(b => b.a).join(',') : it.answer + (it.unit || ''), coins: c }))
    const all = ctx.day.groups.flatMap(g => g.items)
    if (all.every(id => ctx.day.items[id]?.fin) && !ctx.day.done) {
      ctx.day.done = true; if (!ctx.day.flash) { s.pts['漏题']++; rec.fin.patrol = true }
      // 陪伴天数：做完当天的任务算陪了 1 天，周末也算，只增不减；毕业典礼以后不再计
      if (s.lastDay !== ctx.date && ctx.date <= SEASON.end) { s.days++; s.lastDay = ctx.date; rec.fin.day = s.days }
      // 出勤：心愿单按这个兑换
      if (s.att.week !== ctx.pack.week) s.att = { week: ctx.pack.week, days: [] }
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
  function wrong(ctx, it, rec, { given, err, step, ms, note }) {
    const strict = Number(ctx.pack.tuning?.slow ?? 1)      // 「慢慢来」严格度：0 关掉，1 标准，1.5 更严
    const fast = strict > 0 && !['忘写单位', '漏空'].includes(step) && ms != null && ms < MIN_SECONDS[it.format] * 1000 * strict
    rec.w++; ctx.state.combo = 0
    if (fast) { ctx.day.flash++; ctx.state.slow = 3; ctx.state.slowFrom = it.id }   // 接下来 3 道题先盖住几秒
    ctx.log.push(row(ctx, it, { try: rec.w, correct: false, given, trap_error_type: err, step_failed: step, ms }))
    if (rec.w >= 3) return { ...finish(ctx, it, rec), ok: false }
    return { ok: false, flash: fast, msg: note || (rec.w === 1 ? '提示：' + it.hint : '讲解：' + it.explain + ' 再试一次。') }
  }
  function answer(ctx, body) {
    const it = ctx.pack?.items.find(x => x.id === body.item)
    if (!it || !ctx.day.groups.some(g => g.items.includes(it.id))) return json({ error: '这道题不在今天的任务里' }, 400)
    const rec = ctx.day.items[it.id] ||= { w: 0, step: 0 }
    if (rec.fin) return json({ error: '这道题已经做完了' }, 400)
    const ms = Number(body.ms) || null
    ctx.day.ms = (ctx.day.ms || 0) + Math.min(ms || 0, 180000)      // 今天做题用了多久（单步最多算 3 分钟）
    let res
    if (it.format === 'oral') {
      const n = Number(body.value)
      res = n === it.answer ? finish(ctx, it, rec) : wrong(ctx, it, rec, { given: n, err: it.traps.find(t => t.value === n)?.error_type || it.err, step: '得数', ms })
    } else if (it.format === 'first') {
      const i = Number(body.index)
      res = i === it.first ? finish(ctx, it, rec) : wrong(ctx, it, rec, { given: '先算 ' + it.tokens[i], err: it.err, step: '先算哪一步', ms })
    } else if (it.format === 'clock') {
      const z = Number(body.zone)
      res = z === it.answer ? finish(ctx, it, rec) : wrong(ctx, it, rec, { given: `钟面位置 ${z}`, err: it.traps.find(t => t.value === z)?.error_type || it.err, step: '拨时针', ms })
    } else if (it.format === 'estimate' && rec.step === 0) {
      const i = Number(body.index)
      if (it.ranges[i]?.ok) { rec.step = 1; rec.rangeOk = rec.w === 0; rec.pub = { range: i }; res = { ok: true, range: i } }
      else res = wrong(ctx, it, rec, { given: it.ranges[i]?.t, err: '计算失误', step: '估范围', ms, note: '再估一估：先看最高位，大概是几百、几十？' })
    } else if (it.format === 'estimate') {
      const n = Number(body.value)
      res = n === it.answer ? finish(ctx, it, rec) : wrong(ctx, it, rec, { given: n, err: it.traps.find(t => t.value === n)?.error_type || it.err, step: '得数', ms })
    } else if (it.format === 'steps') {
      const ln = it.lines[rec.step], n = Number(body.value)
      if (n === ln.a) { rec.step++; rec.pub = { vals: it.lines.slice(0, rec.step).map(l => l.a) }; res = rec.step >= it.lines.length ? finish(ctx, it, rec) : { ok: true, vals: rec.pub.vals } }
      else res = wrong(ctx, it, rec, { given: n, err: ln.traps.find(t => t.value === n)?.error_type || '计算失误', step: `第 ${rec.step + 1} 行`, ms, note: ln.hint && rec.w === 0 ? '提示：' + ln.hint : undefined })
    } else if (it.format === 'fix' && rec.step === 0) {
      const i = Number(body.index)
      if (i === it.bad) { rec.step = 1; rec.pub = { spot: i }; res = { ok: true, spot: i } }
      else res = wrong(ctx, it, rec, { given: `第 ${i + 1} 行`, err: it.err, step: '找错行', ms, note: '不是这一行。从上往下一行一行对，看哪一步开始不对。' })
    } else if (it.format === 'fix') {
      const n = Number(body.value)
      res = n === it.answer ? finish(ctx, it, rec) : wrong(ctx, it, rec, { given: n, err: '计算失误', step: '得数', ms })
    } else if (it.format === 'multi') {
      const vals = Array.isArray(body.values) ? body.values : [], blank = i => String(vals[i] ?? '') === ''
      const okIdx = it.blanks.map((b, i) => !blank(i) && Number(vals[i]) === b.a), empty = it.blanks.filter((_, i) => blank(i)).length
      rec.pub = { ok: okIdx, vals: okIdx.map((x, i) => x ? String(it.blanks[i].a) : '') }
      if (okIdx.every(Boolean)) res = finish(ctx, it, rec)
      else if (empty) { rec.blankMiss = true; res = wrong(ctx, it, rec, { given: `空了 ${empty} 处`, err: '漏题', step: '漏空', ms, note: `还有 ${empty} 处没填就交卷了。每个空都要填。` }) }
      else res = wrong(ctx, it, rec, { given: vals.join(','), err: '计算失误', step: '得数', ms, note: rec.w === 0 ? '有的空不对，标红的再算一遍。' : undefined })
      res = { ...res, okIdx, keepInput: true }
    } else if (!['word', 'plan'].includes(it.format)) {
      return json({ error: '不认识的题型' }, 400)
    } else if (it.format === 'plan' && body.step === 'goal' && rec.step === 0) {
      const i = Number(body.index)
      if (it.goals[i]?.ok) { rec.step = 1; rec.goalOk = rec.w === 0; rec.pub = { goal: i }; res = { ok: true, goal: i } }
      else res = wrong(ctx, it, rec, { given: it.goals[i]?.t, err: it.err, step: '先求什么', ms })
    } else if (it.format === 'word' && body.step === 'keywords' && rec.step === 0) {
      const sel = new Set((body.sel || []).map(Number)), keys = it.segs.flatMap((s, i) => s.k ? [i] : []), noise = it.segs.flatMap((s, i) => s.n ? [i] : [])
      const hit = keys.filter(i => sel.has(i)).length, extra = noise.filter(i => sel.has(i)).length
      rec.kw = hit < keys.length ? 0 : extra ? 1 : 2; rec.step = 1
      rec.kwRes = { keys, noise, sel: [...sel], kw: rec.kw, why: it.why, missed: keys.length - hit, extra }
      res = { ok: true, ...rec.kwRes }
    } else if (body.step === 'choice' && rec.step >= 1 && rec.step < 3) {
      const i = Number(body.index), ch = it.choices[i]
      if (ch?.ok) { rec.step = 3; rec.expr = ch.t; res = { ok: true, expr: ch.t } }
      else res = wrong(ctx, it, rec, { given: ch?.t, err: it.traps.find(t => t.value === ch?.v)?.error_type || it.err, step: '选算式', ms })
    } else if (body.step === 'answer' && rec.step === 3) {
      const n = Number(body.value), unit = body.unit || ''
      if (n !== it.answer) res = wrong(ctx, it, rec, { given: n, err: it.traps.find(t => t.value === n)?.error_type || '计算失误', step: '得数', ms })
      else if (!unit) res = { ...wrong(ctx, it, rec, { given: `${n}（没写单位）`, err: '格式规范', step: '忘写单位', ms, note: ctx.pack.tuning.unit_hint ? '得数算对了！答句里还有一个空格没填。' : '得数算对了！再读一遍答句，是不是少了点什么？' }), keepInput: true }
      else if (unit !== it.unit) res = { ...wrong(ctx, it, rec, { given: n + unit, err: '格式规范', step: '单位不对', ms, note: `得数对了，「${unit}」放在这里对吗？` }), keepInput: true }
      else res = finish(ctx, it, rec)
    } else return json({ error: '步骤不对，请刷新一下' }, 400)
    return res
  }

  // ---------- 照顾、买东西、学本领、散步、陪玩 ----------
  function act(ctx, b) {
    const s = ctx.state, date = ctx.date, st = stageOf(s, date), kid = s.kid || '小主人'
    if (b.kind === 'name') { const n = cleanName(b.name); if (!n) return { msg: '先给它起个名字吧。' }; if (!s.name) mark(s, date, `给小狗起名叫${n}`); s.name = n; return { msg: `我叫${n}！那你叫什么名字？` } }
    if (b.kind === 'kidname') { const n = cleanName(b.name); if (!n) return { msg: `写上你的名字，${s.name || '小狗'}才知道怎么叫你。` }; s.kid = n; return { msg: `${n}，你好！` } }
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

  // ---------- 路由 ----------
  return async function handle(req) {
    const url = new URL(req.url), p = url.pathname.replace(/^\/api\/kid/, '')
    if (!env.KID_PIN || !env.SYNC_TOKEN) return json({ error: '孩子端还没有设置口令' }, 503)
    // 家长端同步：用同步令牌，不用孩子的口令
    if (p === '/pack' || p === '/log') {
      if (req.headers.get('x-sync-token') !== env.SYNC_TOKEN) return json({ error: '同步令牌不对' }, 401)
      if (p === '/pack' && req.method === 'PUT') {
        const pack = await req.json()
        if (pack?.v !== PACK_VERSION || !/^\d{4}-W\d{2}$/.test(pack.week || '') || !Array.isArray(pack.items) || !pack.items.length) return json({ error: '题库包格式不对' }, 400)
        await store.set('pack', pack)
        // 家长用 tune 改了名字：推送时写进存档
        const t = pack.tuning || {}, st = await store.get('state')
        if (st && (cleanName(t.kid_name) || cleanName(t.pet_name))) { if (cleanName(t.kid_name)) st.kid = cleanName(t.kid_name); if (cleanName(t.pet_name)) st.name = cleanName(t.pet_name); await store.set('state', st) }
        return json({ ok: true, week: pack.week, items: pack.items.length })
      }
      if (p === '/log' && req.method === 'GET') return json({ week: url.searchParams.get('week'), log: await load(`log:${url.searchParams.get('week')}`, []), state: await store.get('state') })
      return json({ error: '不支持' }, 405)
    }
    if (env.DEV && p === '/dev/clock' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), ms = b.date ? Date.parse(`${b.date}T${b.time || '16:00'}:00+08:00`) - Date.now() : 0
      await store.set('dev-clock', ms); return json({ ok: true, offset: ms })
    }
    if (p === '/login' && req.method === 'POST') {
      const fail = await load('fail', { n: 0, until: 0 })
      if (Date.now() < fail.until) return json({ error: '试了太多次，5 分钟后再来' }, 429)
      const body = await req.json().catch(() => ({}))
      if (String(body.pin) !== String(env.KID_PIN)) { const n = fail.n + 1; await store.set('fail', n >= 5 ? { n: 0, until: Date.now() + 300000 } : { n, until: 0 }); return json({ error: '口令不对' }, 401) }
      await store.set('fail', { n: 0, until: 0 })
      return json({ ok: true }, 200, { 'set-cookie': `kid=${await session()}; Path=/; HttpOnly; ${env.DEV ? '' : 'Secure; '}SameSite=Lax; Max-Age=${86400 * 180}` })
    }
    if (cookies(req).kid !== await session()) return json({ error: '请先输入口令' }, 401)
    const ctx = await context()
    if (p === '/state' && req.method === 'GET') { await save(ctx); return json(view(ctx)) }
    if (req.method !== 'POST') return json({ error: '不支持' }, 405)
    const body = await req.json().catch(() => ({}))
    if (p === '/answer') {
      if (!ctx.pack) return json({ error: '还没有题库' }, 400)
      const res = answer(ctx, body)
      if (res instanceof Response) return res
      await save(ctx)
      return json({ ...res, view: view(ctx) })
    }
    if (p === '/act') { const res = act(ctx, body); await save(ctx); return json({ ...res, view: view(ctx) }) }
    return json({ error: '找不到' }, 404)
  }
}
