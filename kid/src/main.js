// 孩子端页面：小屋、学期地图、今日任务、题型、本领、小卖部、纪念册。答案和金币都在后端（kid/server/game.js），这里只负责显示和把操作发过去。
import './style.css'
import { SKILLS, SKILL_COST, GOODS, STORY_PAGES, STAGES, SCARF_AT, SEASON, PLACES, POSTCARDS, JAR, TRICKS, POSE_MS, placeOpen, addDays, dayDiff } from '../../shared/contract.js'
import { LINES } from './lines.js'
import { STORY } from './story.js'

const app = document.getElementById('app')
let V = null, page = 'home', Q = null, say = '', act = '', pose = '', poseTimer = 0, sel = '审题', pin = '', loginErr = '', busy = false, taps = [], cere = null
let sheet = null, place = null, card = null, meetBack = false, meetHi = false, grad = 0, toast = '', toastTimer = 0, clockSkew = 0
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* 隐私模式下不保存 */ } } }
let sp = null          // 故事书里正在看的那一页
const POSES = ['eat', 'bath', 'catch', 'shake', 'wag', 'sleep']
const ACT = { blink: 'squish', look: 'look', yawn: 'squish', stretch: 'stretch', hop: 'hop', spin: 'spin', sniff: 'sniff', wave: 'hop', think: 'think', giggle: 'giggle', sleepy: 'squish', walk: 'walk' }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const pick = a => a[Math.floor(Math.random() * a.length)]
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`
const cnDate = d => `${+d.slice(5, 7)} 月 ${+d.slice(8, 10)} 日 星期${'日一二三四五六'[new Date(d + 'T00:00:00Z').getUTCDay()]}`

async function api(path, body) {
  const r = await fetch('/api/kid' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  const d = await r.json().catch(() => ({ error: '网络不太好，再试一次。' }))
  if (r.status === 401 && path !== '/login') { V = null; page = 'login' }
  if (!r.ok) throw new Error(d.error || '出错了，再试一次。')
  const v = d.view || (path === '/state' ? d : null)
  if (v?.now) clockSkew = v.now - Date.now()
  return d
}
async function run(fn) {
  if (busy) return
  busy = true
  try { await fn() } catch (e) { if (page === 'q' && Q) Q.msg = e.message; else showToast(e.message) }
  busy = false; render()
}
function showToast(t) { toast = t; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast = ''; render() }, 2800) }

// ---------- 小狗 ----------
const S = () => V.state
const stage = () => S().stage
const D = () => V.date
const name = () => esc(S().name || '小狗')
const kid = () => esc(S().kid || '小朋友')
const fillNames = t => esc(t).replace(/\{name\}/g, name()).replace(/\{kid\}/g, kid())
const now = () => new Date(Date.now() + clockSkew)
const late = () => { const d = now(), [h, m] = String(V?.tuning?.bedtime || '20:30').split(':').map(Number); return d.getHours() * 60 + d.getMinutes() >= h * 60 + m }
const month = () => +D().slice(5, 7)
const winter = () => D() >= `${D().slice(0, 4)}-12-01` || month() <= 2
const ownOn = k => S().own[k]
// 学士帽、领结、毛线帽、本领徽章：素材还没画，先用代码画
const CAP = '<svg class="cap" viewBox="0 0 100 60" aria-hidden="true"><polygon points="50,4 98,22 50,40 2,22" fill="#1d2430"/><path d="M24 30 v14 q26 14 52 0 v-14 l-26 10z" fill="#2b3442"/><line x1="86" y1="26" x2="88" y2="50" stroke="#ffd766" stroke-width="3"/><circle cx="88" cy="52" r="4" fill="#ffd766"/></svg>'
const HAT = '<svg class="cap" viewBox="0 0 100 64" aria-hidden="true"><path d="M14 52 q2 -44 36 -44 q34 0 36 44z" fill="#d9542e"/><path d="M14 52 h72" stroke="#fff3e0" stroke-width="10" stroke-linecap="round"/><circle cx="50" cy="8" r="9" fill="#fff3e0"/><path d="M30 20 v26 M50 12 v34 M70 20 v26" stroke="#b5401f" stroke-width="3"/></svg>'
const BOW = '<svg viewBox="0 0 60 30" aria-hidden="true"><path d="M30 15 L4 2 Q0 15 4 28 Z" fill="#d9542e"/><path d="M30 15 L56 2 Q60 15 56 28 Z" fill="#e8743b"/><circle cx="30" cy="15" r="6" fill="#b5401f"/></svg>'
function petHtml(o = {}) {
  const st = o.st ?? stage(), p = o.st ? '' : late() && !o.awake ? 'sleep' : pose, a = SCARF_AT[st]
  const src = st && p ? `/pet/s${st}-act-${p}.webp` : `/pet/s${st}.webp`
  const capOn = o.cap ?? S().graduated, still = st && !p
  const neck = still && a ? `left:${a.x - a.w * 0.65}%;top:${a.y - 5}%;width:${a.w * 1.3}%` : ''
  const scarf = neck && ownOn('scarf') && !capOn ? `<img class="scarf" src="/pet/item-scarf.webp" alt="" style="${neck}">` : ''
  const bow = neck && ownOn('bow') && !ownOn('scarf') ? `<span class="bow" style="left:${a.x - 9}%;top:${a.y - 2}%;width:18%">${BOW}</span>` : ''
  const hat = still && (capOn ? CAP : ownOn('hat') && winter() ? HAT : '')
  const full = SKILLS.filter(x => S().skill[x.k] >= 3)
  const badges = neck && full.length ? `<span class="medals" style="left:${a.x - 2 - full.length * 3}%;top:${a.y + 6}%">${full.map(x => `<img src="/pet/badge-${x.badge}.webp" alt="">`).join('')}</span>` : ''
  const cls = o.st ? '' : act ? 'a-' + (ACT[act] || act) : p && p !== 'sleep' ? 'p-' + p : ''
  const bubbles = p === 'bath' ? `<div class="bubbles">${[12, 30, 48, 66, 82].map((x, k) => `<i style="left:${x}%;animation-delay:-${k * 0.45}s"></i>`).join('')}</div>` : ''
  return `<div class="pet"><div class="${cls}"><span class="wear ${p ? '' : 'breathe'}"><img src="${src}" alt="${st ? '小柴犬' : '小窝'}">${scarf}${bow}${hat ? `<span class="hat">${hat}</span>` : ''}${badges}</span></div>${bubbles}</div>`
}
const face = k => stage() ? `/pet/s${stage()}-face-${k}.webp` : '/pet/s0.webp'
const fact = t => t.replace('{kid}', S().kid || '小朋友').replace('{fixed}', V.facts?.fixed ?? 0).replace('{focus}', V.facts?.focus || '今天的题').replace('{days}', S().days).replace('{circled}', ls.get('kid-circled', 0)).replace('{best}', S().best)
function chat(kind) {
  const n = S().needs, f = V.facts || {}
  let pool
  if (kind) pool = LINES[kind]
  else if (late()) pool = LINES.time_late
  else {
    const need = [['state_hungry', n.full], ['state_bored', n.mood], ['state_dirty', n.clean]].filter(([, v]) => v < 40), r = Math.random()
    const mine = LINES.remember.filter(l => (!l.need || f[l.need]) && (!l.kid || S().kid))
    pool = need.length && r < .45 ? LINES[pick(need)[0]] : V.allDone && r < .6 ? LINES.after_practice : r < .72 && mine.length ? mine : r < .85 ? LINES.idle : r < .94 ? LINES.math : LINES[now().getHours() < 11 ? 'time_morning' : 'time_evening']
  }
  const l = pick(pool || LINES.idle)
  say = fact(l.t); act = l.act
}
/** 做动作：动作图停留约 4.5 秒并轻轻晃动；anim 是整只狗的动画（跳、转圈、散步） */
function strike(p, anim = '') {
  if (!POSES.includes(p)) { act = p || anim; return }
  pose = p; act = anim; clearTimeout(poseTimer)
  poseTimer = setTimeout(() => { pose = ''; act = ''; render() }, POSE_MS)
}

// ---------- 画面零件 ----------
const coin = n => `<span class="pill"><i class="ico coin"></i>${n}</span>`
const stars = () => Object.values(S().pts).reduce((a, b) => a + b, 0)
const bar = (n, v, cls) => `<span>${n}</span><span class="bar ${cls} ${v < 40 ? 'low' : ''}"><i style="width:${v}%"></i></span><span>${Math.round(v)}</span>`
const groups = () => V.today || []
const allItems = () => groups().flatMap(g => g.items)
const doneCount = () => allItems().filter(it => it.done).length
const fx = (kind, n = 12) => `<div class="fx ${kind}">${Array.from({ length: n }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-duration:${4 + (i % 5)}s;animation-delay:-${((i * 0.7) % 5).toFixed(1)}s"></i>`).join('')}</div>`
const LANTERN = '<svg class="lantern" viewBox="0 0 40 70" aria-hidden="true"><line x1="20" y1="0" x2="20" y2="12" stroke="#7a5130" stroke-width="2"/><ellipse cx="20" cy="34" rx="17" ry="20" fill="#e23a3a"/><rect x="12" y="12" width="16" height="5" rx="2" fill="#ffd766"/><rect x="12" y="51" width="16" height="5" rx="2" fill="#ffd766"/><path d="M20 56 v12" stroke="#ffd766" stroke-width="2"/></svg>'
const PILLOW = '<svg class="pillow" viewBox="0 0 90 50" aria-hidden="true"><path d="M6 40 q2 -34 39 -34 q37 0 39 34 q-39 10 -78 0z" fill="#fff6e8" stroke="#d9b98a" stroke-width="3"/><path d="M22 14 q4 8 0 16 M36 10 q4 9 0 18 M54 10 q-4 9 0 18 M68 14 q-4 8 0 16" stroke="#d9b98a" stroke-width="2.5" fill="none"/><circle cx="36" cy="32" r="2.5" fill="#5a3418"/><circle cx="54" cy="32" r="2.5" fill="#5a3418"/></svg>'
function room() {
  const s = S(), ev = V.event
  return `<div class="room" data-a="tap" role="button" aria-label="戳一戳小狗">
    ${stage() ? `<div class="win">${fx(winter() ? 'snow' : 'leaf', 10)}</div>` : ''}
    ${s.own.curtain ? '<img class="curtain" src="/pet/item-curtain.webp" alt="">' : ''}
    ${ownOn('lantern') ? LANTERN : ''}${ownOn('pillow') ? PILLOW : ''}
    ${ev ? `<button class="event" data-a="event">${esc(ev.t)}<u>${esc(ev.b)}</u></button>` : ''}
    ${petHtml()}
    <span class="tag">${!stage() ? '小窝' : s.good ? '状态好 · 明早有小礼物' : winter() ? '窗外在下雪' : '窗外是秋天'}</span></div>`
}
function growCard() {
  const s = S(), n = s.days, i = stage(), nx = STAGES[i + 1]
  if (!i) return `<div class="card grow"><b>它还在小窝里睡觉</b><p class="dim">做完第一道题，它就会醒来。</p></div>`
  if (s.graduated) return `<div class="card grow"><b>已陪伴 ${n} 天 · 毕业啦</b><p class="dim">${D() > SEASON.ceremony ? `寒假里${name()}也在家陪你。下学期开学那天，它把小窝留给新朋友。` : `毕业以后${name()}还在小屋里，寒假也一直陪着你。`}</p></div>`
  if (!nx) return `<div class="card grow"><b>已陪伴 ${n} 天</b><div class="conds"><span class="cond ${D() >= SEASON.finale ? 'ok' : ''}">${md(SEASON.finale)} 毕业周${D() >= SEASON.finale ? ' ✓' : ''}</span><span class="cond">周五 ${md(SEASON.ceremony)} 毕业典礼</span></div></div>`
  const cur = STAGES[i], need = n >= nx.days, dok = D() >= nx.from, from = cur.from || SEASON.start
  const pct = Math.min(100, Math.round(Math.max(0, Math.min(n, nx.days) - (cur.days || 0)) / (nx.days - (cur.days || 0)) * 50 + Math.min(1, Math.max(0, dayDiff(from, D()) / Math.max(1, dayDiff(from, nx.from)))) * 50))
  return `<div class="card grow"><b>已陪伴 ${n} 天</b><span class="bar s"><i style="width:${pct}%"></i></span>
    <div class="conds"><span class="cond ${need ? 'ok' : ''}">陪满 ${nx.days} 天${need ? ' ✓' : ''}</span><span class="cond ${dok ? 'ok' : ''}">${md(nx.from)} 以后${dok ? ' ✓' : ''}</span><span class="cond">长成${nx.n}</span></div></div>`
}

function vLogin() {
  return `<div class="top"><h1>团团小屋</h1></div><div class="body login">
    <div class="room"><div class="pet"><span class="wear breathe"><img src="/pet/s1.webp" alt=""></span></div></div>
    <div class="card"><p>输入口令，进小屋找小狗玩。</p><div class="pin">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>${loginErr ? `<p class="dim" style="color:var(--berry);text-align:center">${loginErr}</p>` : ''}</div>
    ${pad(null, '进去')}</div>`
}
function vHome() {
  const s = S(), n = s.needs, st = stage(), bag = kind => GOODS.filter(g => g.kind === kind).reduce((a, g) => a + (s.bag[g.k] || 0), 0)
  const pats = s.pats.date === D() ? s.pats.n : 0, tricks = TRICKS.filter(t => s.skill[t.k] >= 1).length
  const canLearn = SKILLS.filter(x => s.skill[x.k] < 3 && s.pts[x.k] >= SKILL_COST[s.skill[x.k]]).length
  const breakTime = D() > SEASON.ceremony
  const cta = !V.week || (breakTime && !allItems().length) ? `<button class="btn" disabled>${breakTime ? '寒假没有任务' : '还没有任务'}<small>${breakTime ? `来陪${name()}玩吧` : '等爸爸妈妈发这周的题'}</small></button>`
    : late() ? `<button class="btn" disabled>${name()}睡觉了<small>明天见</small></button>`
    : V.allDone ? `<button class="btn" data-a="go" data-v="result">今天完成啦<small>看看今天的成绩</small></button>`
    : `<button class="btn" data-a="go" data-v="quests">今日任务 ${doneCount()} / ${allItems().length}<small>最多可赚 ${allItems().reduce((a, it) => a + it.max, 0)}${canLearn ? ` · 有 ${canLearn} 个本领可以学` : ''}</small></button>`
  const banner = s.graduated ? `<div class="card banner snow"><b>${breakTime ? '寒假中' : '毕业啦'}</b> ${name()}戴着学士帽住在小屋里${breakTime ? '，下学期开学那天会来一位新朋友' : ''}。</div>`
    : D() >= SEASON.finale ? `<button class="btn red" data-a="go" data-v="book">毕业周 · ${D() >= SEASON.ceremony ? '今天可以举行毕业典礼' : `周五 ${md(SEASON.ceremony)} 毕业典礼`}<small>去纪念册看看</small></button>` : ''
  return `<div class="top"><h1>${s.name ? name() + '的小屋' : '团团小屋'}</h1>${coin(s.coins)}<span class="pill"><i class="ico star"></i>${stars()}</span></div>
  <div class="body">
    ${banner}
    <div class="bubble">${esc(say) || (st ? `嗨，${kid()}！今天也一起加油吧。` : '它还在小窝里睡觉。做完第一道题，它就会醒来。')}</div>
    ${room()}
    <div class="duo">${growCard()}<div class="card bars">${bar('饱食', n.full, '')}${bar('心情', n.mood, 'b')}${bar('清洁', n.clean, 'c')}</div></div>
    <div class="acts"><button data-a="care" data-v="food">喂食<small>${bag('food')} 份</small></button><button data-a="care" data-v="soap">洗澡<small>${bag('soap')} 块</small></button><button class="new" data-a="sheet" data-v="play" ${st ? '' : 'disabled'}>陪玩<small>三选一</small></button><button data-a="care" data-v="pat">摸摸<small>今天 ${Math.max(0, 3 - pats)} 次</small></button><button data-a="sheet" data-v="tricks" ${st ? '' : 'disabled'}>把戏<small>会 ${tricks} 个</small></button></div>
    ${cta}
    ${V.wish ? `<p class="dim">心愿单：${esc(V.wish.text)} · 这周做完任务 ${V.wish.got} / ${V.wish.need} 天</p>` : ''}
    ${s.hatched ? `<div class="tri"><button class="card quest" data-a="story" data-v=""><b>故事书</b><span class="pill">${s.story} / ${STORY_PAGES}</span></button><button class="card quest" data-a="go" data-v="diary"><b>日记</b><span class="pill">${s.album.length} 件事</span></button><button class="card quest" data-a="go" data-v="book"><b>纪念册</b><span class="pill">${s.cards.length} / 12</span></button></div>` : ''}
  </div>`
}
function vQuests() {
  const gs = groups(), open = gs.filter(g => !g.boss && !g.extra).every(g => g.items.every(it => it.done))
  return `<div class="top"><h1>今天的任务</h1>${coin(S().coins)}</div><div class="body">${gs.map(g => {
    const left = g.items.filter(it => !it.done).length, top = Math.max(...g.items.map(it => it.max)), mx = g.extra ? Math.ceil(top / 2) : top, lock = g.boss && !open && left > 0
    const tag = g.bucket === '本周重点' && !g.boss ? '<span class="tagx">本周重点</span>' : g.bucket === '往周未过关' ? '<span class="tagx old">以前的</span>' : g.extra ? '<span class="tagx old">金币减半</span>' : ''
    return `<button class="card quest ${left ? '' : 'done'} ${lock ? 'lock' : ''}" ${lock || !left ? 'disabled' : ''} data-a="group" data-v="${g.id}"><b>${esc(g.name)}${tag}</b>${coin((g.items.every(it => it.format === 'oral') ? '每题 ' : '最高 ') + mx)}<span class="dim">${lock ? '做完上面几组后解锁' : `${esc(g.sub || '')} · ${left ? `还有 ${left} 题` : '做完了'}`}</span></button>`
  }).join('')}<p class="dim">金币多的题，是你这周最需要练的题。</p></div>`
}

function pad(units, go = '交卷') {
  const u = units ? units.map(x => `<button class="u" data-a="unit" data-v="${esc(x)}">${esc(x)}</button>`).join('') + '<span></span>'.repeat(Math.max(0, 4 - units.length)) : ''
  return `<div class="pad">${[1, 2, 3, '⌫', 4, 5, 6, 0, 7, 8, 9].map(k => `<button data-a="key" data-v="${k}">${k}</button>`).join('')}<button class="go" data-a="submit">${go}</button>${u}</div>`
}
function segText(it, mode) {
  const k = Q.kw
  return it.segs.map((s, i) => {
    const on = Q.sel.has(i), t = esc(s.t)
    if (mode === 'pick') return `<span class="seg ${on ? 'on' : ''}" role="button" tabindex="0" data-a="seg" data-v="${i}">${t}</span>`
    const key = k.keys.includes(i), noise = k.noise.includes(i), was = k.sel.includes(i)
    if (mode === 'reveal') { const c = key ? (was ? 'key' : 'miss') : noise ? (was ? 'noise' : '') : was ? 'on' : ''; return c ? `<span class="seg fixed ${c}">${t}</span>` : t }
    return key ? `<span class="seg fixed key">${t}</span>` : t
  }).join('')
}
function buddy(it) {
  const sk = SKILLS.find(s => s.k === it.err) || SKILLS[0], p = S().prog[sk.k] || 0
  const f = Q.mood === 'think' ? 'thinking' : Q.fin?.ok ? 'proud' : 'happy'
  return `<span class="buddy"><span class="ava ${Q.mood ? 'a-' + (Q.mood === 'think' ? 'think' : 'hop') : ''}"><img src="${face(f)}" alt=""></span><span class="ring" style="--p:${p * 20}"><b>${p}/5</b></span><small><b>${sk.n}</b>技能点</small></span>`
}
function vQ() {
  const g = groups().find(x => x.id === Q.gid), it = g.items.find(x => x.id === Q.id), idx = g.items.indexOf(it) + 1
  let body = ''
  const msg = Q.msg ? `<div class="bubble plain ${Q.flash ? 'warn' : ''}">${Q.msg}</div>` : ''
  if (Q.fin) {
    const d = Q.fin, more = g.items.some(x => !x.done)
    const b = d.boss
    body = `<div class="card q">${it.format === 'word' ? segText(it, 'fixed') : esc(it.format === 'first' ? it.tokens.join(' ') : it.text || '这一组小题')}</div>
      <div class="fb ${d.ok ? '' : 'zero'}">${d.ok ? `<span class="fly">＋${d.c}</span><b class="c"><i class="ico coin"></i>＋${d.c}</b>${d.w === 0 ? '第一次就答对了！' : '订正对了，拿到一部分金币。'}${d.bonus ? ' 连续 5 题第一次就对，再加 5。' : ''}${d.patrol ? ' 今天没有急着答错的题，得到 1 个「巡逻」技能点。' : ''}${d.extra ? ' 加练的题金币减半。' : ''}` : `<b>这道题先放一放</b><br>${esc(d.explain)}<br>过两天它会换个样子再来。`}</div>
      ${d.w && d.ok ? `<div class="bubble plain">${esc(d.explain)}</div>` : ''}
      ${d.day ? `<div class="bubble plain">今天的任务做完了，${name()}已经陪你 ${d.day} 天。</div>` : ''}
      ${d.grew ? `<div class="bubble plain">${name()}长大了，现在是${STAGES[d.grew].n}！${PLACES.find(p => p.st === d.grew) ? `${PLACES.find(p => p.st === d.grew).n}开放了，` : ''}回小屋看看。</div>` : ''}
      ${d.wish ? `<div class="bubble plain">这周来满啦！可以去找爸爸妈妈兑换心愿：${esc(d.wish)}。</div>` : ''}
      ${b ? `<div class="bubble plain">${b.pass ? `闯关成功！${b.n} 题答对 ${b.okN} 题，再得 ${b.coins} 金币${b.story ? `，解锁了故事书第 ${b.story} 页` : b.card ? `。这一章的故事读完了，${name()}带回一张明信片` : ''}。` : `闯关 ${b.n} 题答对 ${b.okN} 题，差一点。下周五再来。`}</div>` : ''}
      ${b?.pass && b.story ? `<button class="btn" data-a="story" data-v="${b.story - 1}">看新故事</button>` : `<button class="btn" data-a="next">${more ? '下一题' : V.allDone ? '看今天的成绩' : '回到任务'}</button>`}`
  } else if (it.format === 'oral') body = `<div class="card q big">${esc(it.text)} ＝ <span class="box">${Q.input}</span></div>${msg}${pad()}`
  else if (it.format === 'first') body = `<p class="dim">点一下先算的那个符号。</p><div class="card q big">${it.tokens.map((t, i) => /^[+−×÷]$/.test(t) ? `<button class="tok" data-a="tok" data-v="${i}">${t}</button>` : `<span>${esc(t)}</span>`).join(' ')}</div>${msg}`
  else if (it.format === 'clock') body = `<div class="card q">${esc(it.text)}。<span class="dim">点钟面边上的小圆点，时针就会指过去。</span></div>${clock(it)}${msg}<button class="btn" data-a="submit" ${Q.zone == null ? 'disabled' : ''}>拨好了</button>`
  else if (it.format === 'estimate') body = Q.step === 0
    ? `<div class="card q big">${esc(it.text)}</div><p class="dim">先不急着算。估一估，得数大概在哪一段？</p>${msg}<div class="opts">${it.ranges.map((r, i) => `<button data-a="range" data-v="${i}">${esc(r)}</button>`).join('')}</div>`
    : `<div class="card q big">${esc(it.text)} ＝ <span class="box">${Q.input}</span></div><p class="dim">你估的是 ${esc(it.ranges[Q.range] ?? '')}。现在算出准确的得数。</p>${msg}${pad()}`
  else if (it.format === 'steps') body = `<div class="card"><div class="line">${esc(it.text)}</div>${it.lines.map((pre, i) => i > Q.vals.length ? '' : `<div class="line">${esc(pre)}<span class="box">${i < Q.vals.length ? Q.vals[i] : Q.input}</span></div>`).join('')}</div><p class="dim">一行一行填，最后一行是一个数。</p>${msg}${pad()}`
  else if (it.format === 'fix') body = `<p class="dim">${Q.step === 0 ? `这是${name()}做的题，有一步算错了。点出最先出错的那一行。` : '找对了！那正确的得数是多少？'}</p>
    <div class="card"><div class="line">${esc(it.text)}</div>${it.shown.map((t, i) => Q.step === 0 ? `<button class="frow" data-a="spot" data-v="${i}">${esc(t)}</button>` : `<div class="frow ${i === Q.spot ? 'bad' : ''}">${esc(t)}</div>`).join('')}${Q.step ? `<div class="line">正确的得数 ＝ <span class="box">${Q.input}</span></div>` : ''}</div>${msg}${Q.step ? pad() : ''}`
  else if (it.format === 'multi') body = `${it.text ? `<p class="dim">${esc(it.text)}</p>` : ''}<div class="card multi">${it.blanks.map((t, i) => { const ok = Q.okIdx[i], bad = Q.okIdx.length && !ok && Q.vals[i] !== ''; const [l, r = ''] = t.split('□')
      return `<button class="mrow ${i === Q.cur && !ok ? 'cur' : ''} ${ok ? 'ok' : bad ? 'bad' : ''}" ${ok ? 'disabled' : ''} data-a="blank" data-v="${i}">${esc(l)}<span class="box">${esc(Q.vals[i])}</span>${esc(r)}</button>` }).join('')}</div><p class="dim">点一个空再填数。每个空都要填。</p>${msg}${pad()}`
  else if (it.format === 'plan') {
    const st = Q.step, cur = st === 0 ? 0 : st === 3 ? 2 : 1
    const tabs = `<div class="steps">${['先求什么', '选算式', '算和答'].map((n, i) => `<span class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${n}</span>`).join('')}</div><div class="card q">${esc(it.text)}</div>`
    const goal = st ? `<div class="bubble plain">先求：${esc(it.goals[Q.goal] ?? '')}</div>` : ''
    if (st === 0) body = `${tabs}<p class="dim">这道题一步算不出来。要先求出什么？</p>${msg}<div class="opts">${it.goals.map((t, i) => `<button data-a="goal" data-v="${i}">${esc(t)}</button>`).join('')}</div>`
    else if (st < 3) body = `${tabs}${goal}${msg}<div class="opts">${Q.order.map(i => `<button data-a="choice" data-v="${i}">${esc(it.choices[i])}</button>`).join('')}</div>`
    else {
      const slot = Q.unit ? `<button class="uchip" data-a="unit" data-v="">${esc(Q.unit)}</button>` : V.tuning.unit_hint ? '<span class="uslot" aria-label="空着的单位格"></span>' : ''
      body = `${tabs}<div class="card"><div class="expr">${esc(Q.expr)} ＝ <span class="box">${Q.input}</span></div><div class="ans">${esc(it.ask)} <b>${Q.input || '＿＿'}</b> ${slot} ${esc(it.tail || '')}</div></div>${msg}${pad(it.units)}`
    }
  } else {
    const st = Q.step, cur = st <= 1 ? 0 : st - 1          // 第 0、1 步都属于「圈关键词」
    const tabs = `<div class="steps">${['圈关键词', '选算式', '算和答'].map((n, i) => `<span class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${n}</span>`).join('')}</div>`
    if (st === 0) body = `${tabs}<p class="dim">你觉得哪些地方最要紧，就点哪里，可以点好几处。</p><div class="card q">${segText(it, 'pick')}</div>${msg}<button class="btn" data-a="circled" ${Q.sel.size ? '' : 'disabled'}>圈好了，对一对</button>`
    if (st === 1) {
      const k = Q.kw, line = k.kw === 2 ? '圈得刚刚好！关键词一个不落，也没圈多余的。' : k.kw === 1 ? `关键词都圈到了，还多圈了 ${k.extra} 处用不上的。` : `漏了 ${k.missed} 个关键词，橙色虚线的就是。`
      body = `${tabs}<div class="card q">${segText(it, 'reveal')}</div><div class="legend"><span><i style="background:var(--ok);border:2px solid var(--leaf)"></i>圈对了</span><span><i style="background:var(--miss);border:2px dashed var(--coin)"></i>漏了</span><span><i style="background:#f1f1ec;border:2px solid #b9bfb2"></i>用不上</span></div><div class="bubble plain">${line}${S().skill['审题'] && k.kw ? ' 灵鼻子也嗅出来了。' : ''}<br>${esc(k.why)}</div><button class="btn" data-a="kwok">知道了，下一步</button>`
    }
    if (st === 2) body = `${tabs}<div class="card q">${segText(it, 'fixed')}</div>${msg}<div class="opts">${Q.order.map(i => `<button data-a="choice" data-v="${i}">${esc(it.choices[i])}</button>`).join('')}</div>`
    if (st === 3) {
      const slot = Q.unit ? `<button class="uchip" data-a="unit" data-v="">${esc(Q.unit)}</button>` : V.tuning.unit_hint ? '<span class="uslot" aria-label="空着的单位格"></span>' : ''
      body = `${tabs}<div class="card q">${segText(it, 'fixed')}</div><div class="card"><div class="expr">${esc(Q.expr)} ＝ <span class="box">${Q.input}</span></div><div class="ans">${esc(it.ask)} <b>${Q.input || '＿＿'}</b> ${slot} ${esc(it.tail || '')}</div></div>${msg}${pad(it.units)}`
    }
  }
  return `<div class="top"><button class="back" data-a="go" data-v="quests" aria-label="回到任务">‹</button><h1>${esc(g.name)} ${idx}/${g.items.length}</h1>${buddy(it)}</div>
  <div class="body">${Q.cover ? `<div class="cover"><img src="${face('thinking')}" alt=""><b style="font:400 22px var(--kid)">慢慢来</b><span>${name()}在帮你把题目再读一遍……</span></div>` : ''}${body}</div>`
}
function vResult() {
  const its = allItems(), first = its.filter(it => it.done?.w === 0).length, fix = its.filter(it => it.done?.w && it.done?.ok).length, again = its.filter(it => it.done && !it.done.ok).length
  return `<div class="top"><h1>今天完成啦</h1></div><div class="body">
    <div class="room"><div class="pet"><div class="a-hop"><span class="wear"><img src="${stage() ? `/pet/s${stage()}-act-wag.webp` : '/pet/s0.webp'}" alt=""></span></div></div></div><div class="sum"><i class="ico coin"></i>＋${its.reduce((a, it) => a + (it.done?.c || 0), 0)}</div>
    <div class="card rows"><span>第一次就答对</span><b>${first} 题</b><span>订正后答对</span><b>${fix} 题</b><span>过两天换个样子再来</span><b>${again} 题</b><span>最长认真连击</span><b>${S().best} 题</b><span>已陪伴</span><b>${S().days} 天</b></div>
    <button class="btn" data-a="go" data-v="home">回小屋</button>
    <button class="btn alt" data-a="extra">再练一会儿<small>最多再加几题，金币减半</small></button></div>`
}
function vDiary() {
  const a = [...S().album].reverse()
  return `<div class="top"><button class="back" data-a="go" data-v="home" aria-label="回小屋">‹</button><h1>${name()}的日记</h1></div><div class="body">
    ${a.length ? '' : '<div class="bubble plain">日记还是空的。小狗长大、学会本领、散步、闯关成功，都会记在这里。</div>'}
    <div class="diary">${a.map(m => `<div class="card memo"><img src="/pet/s${m.st}.webp" alt=""><span><small>${esc(m.at)}${m.photo ? ' · 照片' : ''}</small>${esc(m.t)}</span></div>`).join('')}</div></div>`
}
// 本领在小屋和地图上解锁的东西（答题时的效果见答题流程方案）
const SKILL_PET = {
  审题: ['把戏「嗅嗅找东西」', '散步时多捡一样东西', '项圈上多一枚徽章，纪念册单独一页'],
  概念不清: ['把戏「叼积木排队」', '每日小事件可能多一件「整理积木」', '项圈上多一枚徽章，纪念册单独一页'],
  计算失误: ['把戏「握手」', '藏骨头可以选「难一点」的杯子', '项圈上多一枚徽章，纪念册单独一页'],
  格式规范: ['把戏「摇尾巴转圈」', '早安时会念一遍昨天的答句', '项圈上多一枚徽章，纪念册单独一页'],
  漏题: ['把戏「绕小屋巡逻」', '地图上提前显示周五闯关考什么', '项圈上多一枚徽章，纪念册单独一页'],
  策略缺失: ['把戏「带路」', '地图上标出下一站还差什么', '项圈上多一枚徽章，纪念册单独一页'],
}
function vSkills() {
  const s = S(), k = SKILLS.find(x => x.k === sel), lv = s.skill[sel], cost = SKILL_COST[lv], have = s.pts[sel]
  return `<div class="top"><h1>本领</h1><span class="pill"><i class="ico star"></i>${stars()}</span></div><div class="body">
    <div class="skills">${SKILLS.map(x => `<button class="skill ${x.k === sel ? 'sel' : ''}" data-a="sel" data-v="${x.k}"><img src="/pet/badge-${x.badge}.webp" alt=""><b>${x.n}</b><small>${x.s} · ${s.pts[x.k]} 点</small><span class="dots">${[0, 1, 2].map(i => `<i class="${i < s.skill[x.k] ? 'f' : ''}"></i>`).join('')}</span></button>`).join('')}</div>
    <div class="card"><b>${k.n} · ${lv ? `第 ${lv} 级` : '还没学会'}</b><p style="margin:4px 0">${k.d}</p>
      ${sel === '漏题' ? '' : `<div class="bars"><span>下一个技能点</span><span class="bar s"><i style="width:${s.prog[sel] * 20}%"></i></span><span>${s.prog[sel]} / 5</span></div>`}
      <p class="dim" style="margin-top:6px">${lv >= 3 ? '已经学满了。' : `学第 ${lv + 1} 级要 ${cost} 个「${k.s}」技能点，现在有 ${have} 个。`}${sel === '漏题' ? '' : '换了样子的题第一次就做对，每 5 道得 1 点。'}</p>
      <ol class="unlock">${SKILL_PET[sel].map((t, i) => `<li class="${i < lv ? 'ok' : ''}">第 ${i + 1} 级：${t}${i < lv ? ' ✓' : ''}</li>`).join('')}</ol></div>
    <button class="btn" data-a="learn" ${lv < 3 && have >= cost ? '' : 'disabled'}>${lv >= 3 ? '学满了' : have >= cost ? `教${name()}学「${k.n}」第 ${lv + 1} 级` : `还差 ${cost - have} 个技能点`}</button></div>`
}
const COLORS = { yard: '#d9682e', park: '#3f9c5f', snow: '#5b8fc9', month: '#cf406a', home: '#e9a23b' }
function vShop() {
  const s = S(), m = month(), left = Math.max(0, JAR.goal - s.jar), open = D() < SEASON.ceremony && !s.graduated
  const icon = (x, color) => x.img || x.kind !== 'keep' ? `<img src="/pet/item-${x.k}.webp" alt="">` : `<span class="ic" style="background:${color}">${esc(x.n[0])}</span>`
  const buy = (x, lock) => s.own[x.k] ? '<span class="dim">已拥有</span>' : lock ? `<span class="dim">${lock}</span>` : `<button class="buy" data-a="buy" data-v="${x.k}" ${s.coins < x.p ? 'disabled' : ''}><i class="ico coin"></i>${x.p}</button>`
  const row = (x, color, sub, lock) => `<div class="srow">${icon(x, color)}<span><b>${esc(x.n)}</b><small>${sub}</small></span>${buy(x, lock)}</div>`
  const bagRow = x => row(x, '', `${x.d} · 背包里 ${x.kind === 'toy' ? (s.toy[x.k] || 0) + ' 次' : (s.bag[x.k] || 0) + ' 份'}`)
  const places = PLACES.filter(p => GOODS.some(g => g.place === p.k)).map(p => { const on = placeOpen(p, stage(), D()); return `<div><h3>${p.n}${on ? '' : ' · 还没开放'}</h3>${GOODS.filter(g => g.place === p.k).map(g => row(g, COLORS[p.k], g.d, on ? '' : '开放后')).join('')}</div>` }).join('')
  const monthly = GOODS.filter(g => g.month).map(g => row(g, COLORS.month, `<span class="tagm">${g.month} 月限定</span>`, g.month === m ? '' : (g.month - m + 12) % 12 < 6 ? `${g.month} 月见` : '已下架')).join('')
  return `<div class="top"><h1>小卖部</h1>${coin(s.coins)}</div><div class="body">${say ? `<div class="bubble plain">${esc(say)}</div>` : ''}
    <div class="card"><div class="jar"><svg viewBox="0 0 56 64" aria-hidden="true"><rect x="8" y="10" width="40" height="50" rx="10" fill="#e6f2fb" stroke="#3b8fd6" stroke-width="2.5"/><rect x="10.5" y="${(12 + 46 * (1 - Math.min(1, s.jar / JAR.goal))).toFixed(1)}" width="35" height="${(46 * Math.min(1, s.jar / JAR.goal)).toFixed(1)}" rx="7" fill="#f6b84a"/><rect x="18" y="4" width="20" height="8" rx="3" fill="#3b8fd6"/></svg>
      <div><b>储蓄罐 · 毕业旅行基金</b><p class="dim">存满 ${JAR.goal.toLocaleString()}，毕业典礼那天和${name()}一起去旅行。</p>
      <div class="math">已经存了 ${s.jar}，还差 ${left}。${left ? `每次存 ${JAR.step}，还要存 ${left} ÷ ${JAR.step} = ${Math.ceil(left / JAR.step)} 次。` : '存满啦！'}</div></div></div>
      <div class="sig"><span>${JAR.sig} 枚可兑换 1 个签名</span><span>罐里 ${s.jar} ÷ ${JAR.sig} = <b>${Math.floor(s.jar / JAR.sig)}</b> 个</span></div>
      ${open ? `<button class="btn" data-a="jar" ${left && s.coins >= Math.min(JAR.step, left) ? '' : 'disabled'}>${left ? `存 ${Math.min(JAR.step, left)} 金币` : '存满啦'}</button>` : '<p class="dim">储蓄罐在毕业典礼上打开了。</p>'}</div>
    <div class="card shop tri3">${places}</div>
    <div class="duo"><div class="card shop"><h3>本月限定</h3>${monthly}</div>
      <div class="card shop"><h3>小屋</h3>${GOODS.filter(g => g.kind === 'keep' && !g.place && !g.month).map(g => row(g, COLORS.home, g.d)).join('')}</div></div>
    <div class="duo"><div class="card shop"><h3>吃的</h3>${GOODS.filter(g => g.kind === 'food').map(bagRow).join('')}</div>
      <div class="card shop"><h3>洗澡和玩具</h3>${GOODS.filter(g => ['soap', 'toy'].includes(g.kind)).map(bagRow).join('')}</div></div>
    ${V.wish ? `<div class="wish"><b>心愿单 · ${esc(V.wish.text)}</b><p>这周做完任务满 ${V.wish.need} 天就能兑换。爸爸妈妈设的，和金币没关系。</p><div class="stamps">${Array.from({ length: V.wish.need }, (_, i) => `<i class="${i < V.wish.got ? 'f' : ''}"></i>`).join('')}</div>${V.wish.got >= V.wish.need ? '<p><b>来满啦，去找爸爸妈妈兑换吧！</b></p>' : ''}</div>` : ''}</div>`
}
function clock(it) {
  const p = (a, r) => [100 + r * Math.sin(a * Math.PI / 180), 100 - r * Math.cos(a * Math.PI / 180)]
  const nums = Array.from({ length: 12 }, (_, i) => { const [x, y] = p((i + 1) * 30, 62); return `<text x="${x}" y="${y}">${i + 1}</text>` }).join('')
  const dots = Array.from({ length: 24 }, (_, z) => { const [x, y] = p(z * 15, 85); return `<circle class="dot ${Q.zone === z ? 'on' : ''}" cx="${x}" cy="${y}" r="${z % 2 ? 6.5 : 9}" data-a="zone" data-v="${z}"/>` }).join('')
  const [mx, my] = p(it.minute === 30 ? 180 : 0, 58), hand = Q.zone == null ? '' : (([x, y]) => `<line class="hh" x1="100" y1="100" x2="${x}" y2="${y}"/>`)(p(Q.zone * 15, 38))
  return `<svg class="clock" viewBox="0 0 200 200"><circle class="face" cx="100" cy="100" r="97"/>${nums}${dots}<line class="mh" x1="100" y1="100" x2="${mx}" y2="${my}"/>${hand}<circle cx="100" cy="100" r="4"/></svg>`
}
function vStory() {
  const n = S().story, cap = Math.min(STORY_PAGES, stage() * 4), fill = t => esc(t).replace(/\{name\}/g, name())
  if (sp != null && sp < n) {
    const pg = STORY[sp], st = sp === 0 ? 0 : pg.ch
    return `<div class="top"><button class="back" data-a="story" data-v="" aria-label="回到目录">‹</button><h1>第 ${sp + 1} 页</h1></div><div class="body">
      <div class="room"><div class="pet"><span class="wear breathe"><img src="/pet/s${st}.webp" alt=""></span></div></div>
      <div class="card story"><h2>${esc(pg.title)}</h2><p>${fill(pg.text)}</p></div>
      ${sp + 1 < n ? `<button class="btn" data-a="story" data-v="${sp + 1}">下一页</button>` : `<button class="btn" data-a="go" data-v="home">回小屋</button>`}</div>`
  }
  const chap = [1, 2, 3, 4].map(c => `<h3 class="chap">第 ${c} 章 · ${STAGES[c].n}</h3><div class="duo">${STORY.map((pg, i) => [pg, i]).filter(([pg]) => pg.ch === c).map(([pg, i]) =>
    `<button class="card quest ${i < n ? '' : 'lock'}" ${i < n ? '' : 'disabled'} data-a="story" data-v="${i}"><b>${i < n ? esc(pg.title) : '还没解锁'}</b><span class="dim">第 ${i + 1} 页${i >= n && i >= cap ? ` · 长成${STAGES[c].n}以后` : ''}</span></button>`).join('')}</div>`).join('')
  return `<div class="top"><button class="back" data-a="go" data-v="home" aria-label="回小屋">‹</button><h1>故事书</h1><span class="pill">${n} / ${STORY_PAGES} 页</span></div><div class="body">
    <div class="bubble plain">${n ? '' : `故事书还是空的。`}每个周五闯关成功，就多一页${name()}的故事。一章读完了，要等${name()}长大才有下一章，这时闯关成功会带回一张明信片。</div>${chap}</div>`
}

// ---------- 学期地图和地方 ----------
const weekOf = d => Math.floor(dayDiff(SEASON.start, d) / 7)
const WEEKS = Math.ceil(dayDiff(SEASON.start, SEASON.ceremony) / 7)
const me = () => `<span class="me"><img src="${stage() ? `/pet/s${stage()}-face-happy.webp` : '/pet/s0.webp'}" alt=""></span>`
const openDate = p => p.finale ? SEASON.finale : STAGES[p.st].from || SEASON.start
function placeCard(p, hintNext) {
  const open = placeOpen(p, stage(), D()), g = STAGES[p.st]
  const lock = p.finale ? `${md(SEASON.finale)} 开放` : `陪满 ${g.days} 天（现在 ${Math.min(S().days, g.days)}）· ${md(g.from)} 以后`
  const miss = !open && hintNext && !p.finale ? `<span class="hint">还差：${[S().days < g.days ? `再陪 ${g.days - S().days} 天` : '', D() < g.from ? `等到 ${md(g.from)}` : ''].filter(Boolean).join('，')}</span>` : ''
  return `<button class="place ${open ? '' : 'lock'}" data-a="${open ? 'place' : 'nope'}" data-v="${p.k}"><span class="th">${scene(p.k, { thumb: true })}</span><span class="t"><b>${p.n}</b><small>${open ? p.sub : lock}</small>${miss}${open ? `<span class="go">${p.k === 'home' ? '回小屋 ›' : '去看看 ›'}</span>` : ''}</span></button>`
}
function vMap() {
  const now = weekOf(D()), s = S(), bossDay = V.boss?.day || 5, at = {}
  PLACES.forEach(p => { (at[Math.max(0, weekOf(openDate(p)))] ||= []).push(p) })
  const next = PLACES.find(p => !placeOpen(p, stage(), D()))
  let rows = ''
  for (let w = 0; w < WEEKS; w++) {
    for (const p of at[w] || []) rows += placeCard(p, s.skill['策略缺失'] >= 2 && p === next)
    const mon = addDays(SEASON.start, w * 7), fri = addDays(mon, (bossDay || 5) - 1)
    const tags = `${w === WEEKS - 1 ? `<span class="flag">${md(SEASON.ceremony)} 毕业典礼</span>` : bossDay ? `<span class="flag">${md(fri)} 闯关</span>` : ''}${mon <= `${mon.slice(0, 4)}-12-31` && addDays(mon, 6) >= `${+mon.slice(0, 4) + 1}-01-01` ? '<span class="hol">1/1 元旦</span>' : ''}`
    const peek = w === now && s.skill['漏题'] >= 2 && V.boss?.groups.length ? `<span class="hint">这周闯关考：${V.boss.groups.map(esc).join('、')}</span>` : ''
    rows += `<div class="wk ${w < now ? 'past' : w === now ? 'now' : ''}" ${w === now ? 'id="now"' : ''}>${w === now ? me() : ''}第 ${w + 1} 周 · ${md(mon)}–${md(addDays(mon, 6))} ${tags}${peek}</div>`
  }
  rows += `<div class="wk ${now >= WEEKS ? 'now' : ''}" ${now >= WEEKS ? 'id="now"' : ''}>${now >= WEEKS ? me() : ''}${md(addDays(SEASON.ceremony, 1))} 以后 · 寒假 <span class="hol">下学期开学换新朋友</span></div>`
  return `<div class="top"><h1>学期地图</h1>${coin(s.coins)}</div><div class="body"><p class="dim">从小屋出发，${md(SEASON.finale)} 走到毕业礼堂。${name()}停在这一周。</p><div class="road">${rows}</div></div>`
}
function vPlace() {
  const p = PLACES.find(x => x.k === place), s = S(), walked = V.walked
  if (!p || !placeOpen(p, stage(), D())) { page = 'map'; return vMap() }
  if (p.finale) return `<div class="top"><button class="back" data-a="go" data-v="map" aria-label="回地图">‹</button><h1>毕业礼堂</h1>${coin(s.coins)}</div><div class="body">
    <div class="scene">${scene('hall')}${petHtml({ cap: true, awake: true })}</div><div class="bubble plain">周五 ${md(SEASON.ceremony)} 在这里举行毕业典礼。典礼上会打开储蓄罐，还会做一本学期纪念册。</div>
    <button class="btn" data-a="ceremony" ${D() >= SEASON.ceremony && !s.graduated ? '' : 'disabled'}>${s.graduated ? '毕业典礼办完啦' : D() >= SEASON.ceremony ? '举行毕业典礼' : `${+SEASON.ceremony.slice(5, 7)} 月 ${+SEASON.ceremony.slice(8)} 日周五举行`}</button></div>`
  const items = GOODS.filter(g => g.place === p.k), got = s.cards.filter(c => c.k === p.k).length
  return `<div class="top"><button class="back" data-a="go" data-v="map" aria-label="回地图">‹</button><h1>${p.n}</h1>${coin(s.coins)}</div><div class="body">
    <div class="bubble">${esc(say) || `这里是${p.n}！${walked ? '今天已经散过步啦。' : '我们去走一走吧？'}`}</div>
    <div class="scene">${scene(p.k)}${p.k === 'snow' ? fx('snow', 18) : p.k === 'yard' ? fx('leaf', 8) : ''}${petHtml({ awake: true })}</div>
    <button class="btn" data-a="trip" ${walked ? 'disabled' : ''}>${walked ? '今天散过步了，明天再来' : `去散步${p.trip ? `（${p.trip} 金币）` : '（自家院子，免费）'}`}<small>心情 ＋20 · 这里的明信片 ${got} / 4</small></button>
    <div class="card"><b>${p.n}的摆设</b><div class="own">${items.map(i => `<button class="${s.own[i.k] ? 'have' : ''}" data-a="buy" data-v="${i.k}" ${s.own[i.k] || s.coins < i.p ? 'disabled' : ''}>${esc(i.n)}<small>${s.own[i.k] ? '摆好了' : `${i.p} 金币`}</small></button>`).join('')}</div><p class="dim">买了就摆在这里，散步时能看到。</p></div></div>`
}
// 地点插画：素材还没画，先用代码画（院子、公园、雪山、礼堂）
let sceneN = 0
function scene(k, o = {}) {
  const own = x => S().own[x] && (!o.thumb || o.card), id = `g${k}${++sceneN}`
  const sky = (a, b) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="360" height="270" fill="url(#${id})"/>`
  let s = ''
  if (k === 'home') s = '<image href="/pet/room.webp" width="360" height="640" preserveAspectRatio="xMidYMin slice"/>'
  if (k === 'yard') s = sky('#bfe4f6', '#eaf7fb') + '<rect y="150" width="360" height="120" fill="#a8d88f"/>'
    + Array.from({ length: 12 }, (_, i) => `<rect x="${i * 30 + 4}" y="108" width="22" height="56" rx="4" fill="#e7bf86" stroke="#8a5a2b" stroke-width="2"/>`).join('')
    + '<rect x="0" y="124" width="360" height="7" fill="#d9a865"/><rect x="282" y="58" width="16" height="104" fill="#8a5a2b"/><circle cx="290" cy="56" r="44" fill="#e8743b"/><circle cx="254" cy="78" r="28" fill="#f0a040"/><circle cx="322" cy="82" r="30" fill="#d9542e"/>'
    + [[60, 240], [110, 252], [300, 236], [210, 258], [30, 214]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="4" fill="#e8743b"/>`).join('')
    + (own('house') ? '<polygon points="14,178 66,140 118,178" fill="#d9542e" stroke="#6b3d1c" stroke-width="3"/><rect x="24" y="176" width="84" height="62" fill="#c98a4b" stroke="#6b3d1c" stroke-width="3"/><path d="M52 238 v-26 a14 14 0 0 1 28 0 v26z" fill="#5a3418"/>' : '')
    + (own('swing') ? '<line x1="252" y1="92" x2="252" y2="182" stroke="#6b3d1c" stroke-width="2"/><line x1="278" y1="92" x2="278" y2="182" stroke="#6b3d1c" stroke-width="2"/><rect x="244" y="180" width="42" height="8" rx="3" fill="#8a5a2b"/>' : '')
    + (own('flower') ? '<rect x="288" y="232" width="64" height="22" rx="5" fill="#b0703c"/>' + [298, 314, 330, 344].map((x, i) => `<circle cx="${x}" cy="226" r="7" fill="${['#e0527a', '#ffd766', '#f08a1c', '#c45ad6'][i]}"/>`).join('') : '')
  if (k === 'park') s = sky('#cfeafc', '#f1fafe') + '<ellipse cx="70" cy="196" rx="210" ry="70" fill="#9dd28a"/><ellipse cx="310" cy="206" rx="200" ry="66" fill="#8cc879"/><rect y="200" width="360" height="70" fill="#a8d88f"/><polygon points="150,270 210,270 196,200 170,200" fill="#efdcb0"/>'
    + [[36, 120], [330, 130]].map(([x, y]) => `<rect x="${x - 6}" y="${y}" width="12" height="60" fill="#7a5130"/><circle cx="${x}" cy="${y - 4}" r="30" fill="#4caa6a"/>`).join('')
    + (own('kite') ? '<polygon points="290,24 312,48 290,78 268,48" fill="#e0527a" stroke="#8a2747" stroke-width="2"/><polyline points="290,78 282,98 296,112 284,130" fill="none" stroke="#8a2747" stroke-width="2"/>' : '')
    + (own('mat') ? '<polygon points="18,236 104,236 120,264 2,264" fill="#e8574d"/><polygon points="40,236 62,236 70,264 30,264" fill="#fff"/><polygon points="84,236 104,236 114,264 92,264" fill="#fff"/>' : '')
    + (own('pond') ? '<ellipse cx="300" cy="244" rx="54" ry="16" fill="#69b6e6"/><ellipse cx="288" cy="240" rx="18" ry="4" fill="#bfe4f6"/>' : '')
  if (k === 'snow') s = sky('#d7e5f3', '#f4f8fc') + '<polygon points="-10,170 70,78 150,170" fill="#c9d8ea"/><polygon points="44,108 70,78 96,108 84,102 70,112 56,102" fill="#fff"/><polygon points="90,170 200,56 310,170" fill="#b9cce3"/><polygon points="168,90 200,56 232,90 216,84 200,96 184,84" fill="#fff"/><polygon points="230,170 305,96 380,170" fill="#c9d8ea"/><rect y="166" width="360" height="104" fill="#f7fbff"/>'
    + [[34, 150], [330, 156]].map(([x, y]) => `<polygon points="${x},${y - 60} ${x + 26},${y} ${x - 26},${y}" fill="#3f8a5a"/><polygon points="${x},${y - 60} ${x + 10},${y - 38} ${x - 10},${y - 38}" fill="#fff"/><rect x="${x - 4}" y="${y}" width="8" height="14" fill="#7a5130"/>`).join('')
    + (own('snowman') ? '<circle cx="56" cy="232" r="24" fill="#fff" stroke="#c4d3e4" stroke-width="2"/><circle cx="56" cy="196" r="16" fill="#fff" stroke="#c4d3e4" stroke-width="2"/><circle cx="51" cy="193" r="2" fill="#333"/><circle cx="61" cy="193" r="2" fill="#333"/><polygon points="56,198 70,201 56,202" fill="#f08a1c"/>' : '')
    + (own('sled') ? '<rect x="270" y="236" width="66" height="12" rx="3" fill="#c0392b"/><path d="M266 254 h72 q8 0 8 -8" fill="none" stroke="#6b3d1c" stroke-width="3"/>' : '')
    + (own('stove') ? '<ellipse cx="300" cy="214" rx="40" ry="16" fill="#ffd76655"/><rect x="286" y="198" width="28" height="26" rx="4" fill="#7a5130"/><path d="M294 200 q6 -16 12 0" fill="#f08a1c"/>' : '')
  if (k === 'hall') s = '<rect width="360" height="270" fill="#7a1f2b"/><rect y="196" width="360" height="74" fill="#c98a4b"/><rect y="196" width="360" height="6" fill="#8a5a2b"/><path d="M0 0 h70 q-20 100 0 200 h-70z" fill="#c0392b"/><path d="M360 0 h-70 q20 100 0 200 h70z" fill="#c0392b"/><rect x="100" y="18" width="160" height="34" rx="6" fill="#ffd766"/><text x="180" y="42" text-anchor="middle" font-size="20" fill="#7a1f2b" font-family="ZCOOL KuaiLe, sans-serif">毕业典礼</text>'
    + [[92, 70], [268, 70]].map(([x, y]) => `<line x1="${x}" y1="52" x2="${x}" y2="${y - 16}" stroke="#ffd766"/><ellipse cx="${x}" cy="${y}" rx="18" ry="16" fill="#e23a3a"/><rect x="${x - 3}" y="${y + 14}" width="6" height="12" fill="#ffd766"/>`).join('')
  return `<svg viewBox="0 0 360 270" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${s}</svg>`
}
// 明信片：地点插画 + 一层天气或时间 + 邮票
function cardSvg(c) {
  const v = POSTCARDS[c.k][c.i].v, ov = {
    sun: '<circle cx="312" cy="46" r="24" fill="#ffd766"/><circle cx="312" cy="46" r="34" fill="#ffd76644"/>',
    dusk: '<rect width="360" height="270" fill="#f08a1c" opacity=".28"/><circle cx="60" cy="120" r="26" fill="#ffb15a"/>',
    night: '<rect width="360" height="270" fill="#0c1a3a" opacity=".55"/><path d="M300 40 a18 18 0 1 0 14 30 a14 14 0 1 1 -14 -30z" fill="#fff6c8"/>' + [[40, 30], [90, 60], [150, 24], [220, 50], [260, 20], [120, 90]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#fff"/>`).join(''),
    rainbow: ['#e0527a', '#f08a1c', '#ffd766', '#5cc48a', '#3b8fd6'].map((col, k) => `<path d="M40 190 A140 140 0 0 1 320 190" fill="none" stroke="${col}" stroke-width="8" transform="translate(0 ${k * 8}) scale(1 ${1 - k * 0.02})" opacity=".8"/>`).join(''),
    birds: [[70, 50], [100, 36], [130, 56], [240, 40]].map(([x, y]) => `<path d="M${x - 10} ${y} q5 -7 10 0 q5 -7 10 0" fill="none" stroke="#34424a" stroke-width="2.5"/>`).join(''),
    leaves: [[40, 60], [120, 40], [200, 90], [280, 30], [320, 110], [90, 120]].map(([x, y], k) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="4" fill="${k % 2 ? '#f1a63a' : '#e8743b'}" transform="rotate(${k * 35} ${x} ${y})"/>`).join(''),
    snow: Array.from({ length: 30 }, (_, k) => `<circle cx="${(k * 53) % 360}" cy="${(k * 37) % 250}" r="${2 + k % 3}" fill="#fff"/>`).join(''),
  }[v] || ''
  const inner = scene(c.k, { thumb: true, card: true }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  return `<svg viewBox="0 0 360 270" aria-hidden="true">${inner}${ov}<g transform="translate(296 200)"><rect width="52" height="58" rx="3" fill="#fff" stroke="#e0527a" stroke-width="2" stroke-dasharray="4 3"/><circle cx="26" cy="30" r="13" fill="#f2c27a"/><circle cx="20" cy="26" r="2.5" fill="#5a3418"/><circle cx="32" cy="26" r="2.5" fill="#5a3418"/></g></svg>`
}
const cardHtml = c => `<div class="pcard">${cardSvg(c)}<p>${fillNames(POSTCARDS[c.k][c.i].t)}</p><small>${md(c.at)} · ${PLACES.find(p => p.k === c.k).n}</small></div>`

// ---------- 纪念册 ----------
function pcGrid() {
  const cards = S().cards, ps = PLACES.filter(p => POSTCARDS[p.k])
  const cell = (p, r) => {
    const mine = cards.filter(x => x.k === p.k), c = mine[r]
    if (c) return cardHtml(c)
    if (!placeOpen(p, stage(), D())) return `<div class="empty lock">${r ? '' : `${md(STAGES[p.st].from)} 以后<br>开放`}</div>`
    return `<div class="empty">${r === mine.length ? '散步时<br>带回来' : ''}</div>`
  }
  return ps.map(p => `<div class="ph">${p.n} ${cards.filter(x => x.k === p.k).length}/4</div>`).join('') + [0, 1, 2, 3].map(r => ps.map(p => cell(p, r)).join('')).join('')
}
function vBook() {
  const s = S(), fin = D() >= SEASON.finale, learned = SKILLS.filter(x => s.skill[x.k] >= 1).length
  const months = Object.entries(s.months || {}).sort(([a], [b]) => a.localeCompare(b))
  const rate = months.length ? `<div class="mrate">${months.map(([m, [n, f]]) => `<span><i style="height:${n ? Math.round(f / n * 100) : 0}%"></i><b>${n ? Math.round(f / n * 100) : 0}%</b><small>${+m.slice(5)} 月</small></span>`).join('')}</div><p class="dim">每个月第一次就做对的比例（屏幕练习，只做参考）。</p>` : ''
  const head = fin ? `<div class="grad"><h2>${kid()}和${name()}的学期纪念册</h2><div class="stats">
      <div><b>${s.days}</b><small>陪伴天数</small></div><div><b>${s.qn}</b><small>一起做的题</small></div><div><b>${learned}</b><small>学会的本领</small></div>
      <div><b>${s.cards.length} / 12</b><small>明信片</small></div><div><b>${s.story} / ${STORY_PAGES}</b><small>故事书</small></div><div><b>${(s.visited || []).length} / 3</b><small>去过的地方</small></div></div>
      ${rate}<p class="dim">毕业旅行基金：${s.jar} / ${JAR.goal}</p>
      ${s.graduated ? `<p><b>毕业典礼办完啦（${md(s.grad)}）。</b></p>` : `<button class="btn" data-a="ceremony" ${D() >= SEASON.ceremony ? '' : 'disabled'}>${D() >= SEASON.ceremony ? '举行毕业典礼' : `周五 ${md(SEASON.ceremony)} 举行毕业典礼`}</button>`}</div>`
    : `<div class="card"><b>毕业周还有 ${dayDiff(D(), SEASON.finale)} 天</b><p class="dim">${md(SEASON.finale)} 起，这里会变成${name()}的学期纪念册，周五 ${md(SEASON.ceremony)} 举行毕业典礼。</p></div>`
  const full = SKILLS.filter(x => s.skill[x.k] >= 3)
  const pages = full.map(x => { const m = s.album.filter(a => a.t.includes(`「${x.n}」`)); return `<div class="card memo"><img src="/pet/badge-${x.badge}.webp" alt=""><span><b>${x.n} · 学满三级</b><small>${m.map(a => md(a.at)).join(' → ')}</small>${x.s}的好习惯，${name()}都记住了。</span></div>` }).join('')
  return `<div class="top"><button class="back" data-a="go" data-v="home" aria-label="回小屋">‹</button><h1>纪念册</h1></div><div class="body">${head}
    <div class="card"><b>明信片 ${s.cards.length} / 12</b><div class="pgrid">${pcGrid()}</div></div>
    ${pages ? `<h3 class="chap">学满的本领</h3><div class="duo">${pages}</div>` : ''}
    <div class="card"><b>老朋友墙</b><div class="alumni">${(s.alumni || []).map(a => `<div><img src="/pet/s${a.st || 4}.webp" alt=""><b>${esc(a.name)}</b>${esc(a.season)} · 陪伴 ${a.days} 天<br>去小镇当巡逻队长了</div>`).join('')}<div class="empty">${s.graduated ? `下学期开学那天，<br>${name()}会住进这里` : '毕业的小狗<br>会住在这里'}</div></div></div>
    <button class="btn alt" data-a="go" data-v="diary">看${name()}的日记<small>${s.album.length} 件事</small></button></div>`
}

// ---------- 弹层 ----------
const meetStep = () => !V || !S() ? 0 : !S().name || meetBack ? 1 : !S().kid ? 2 : meetHi ? 3 : 0
function vSheet() {
  const m = meetStep()
  if (m === 1) return `<div class="sheet"><div class="hello"><div class="meet"><img src="/pet/s0.webp" alt=""><h2>小窝里有一只小柴犬</h2><p class="dim">它刚刚睁开眼睛，还没有名字。给它起一个吧。</p></div>
    <input id="nm-pet" maxlength="6" placeholder="写一个名字" aria-label="小狗的名字" value="${esc(S().name)}"><div class="picks">${['团团', '豆豆', '阿柴', '小橘'].map(x => `<button data-a="petname" data-v="${x}">${x}</button>`).join('')}</div>
    <button class="btn" data-a="petname">就叫它这个</button></div></div>`
  if (m === 2) return `<div class="sheet"><div class="hello"><div class="meet"><img src="/pet/s1-act-wag.webp" alt=""><h2>我叫${name()}！那你叫什么名字？</h2><p class="dim">以后${name()}会这样叫你。</p></div>
    <input id="nm-kid" maxlength="6" placeholder="你的名字或小名" aria-label="你的名字" value="${esc(S().kid)}">
    <button class="btn" data-a="kidname">告诉${name()}</button><button class="btn alt" data-a="meetback">回去改小狗的名字</button></div></div>`
  if (m === 3) return `<div class="sheet"><div class="hello"><div class="meet"><img src="/pet/s1-act-wag.webp" alt=""><h2>${kid()}，你好！</h2><p>我是${name()}。以后每天做完题来小屋看我，我们一起过完这个学期，${+SEASON.ceremony.slice(5, 7)} 月 ${+SEASON.ceremony.slice(8)} 日一起毕业。</p></div>
    <button class="btn" data-a="meetdone">好呀，进小屋</button></div></div>`
  if (page === 'home' && !sheet && V.morning) {
    const M = V.morning, f = M.facts, gift = M.gift === 'cookie' ? '一块骨头饼干（放进背包了）' : M.gift === 'coins' ? '10 金币' : ''
    const said = [f.fixed ? `昨天你订正对了 ${f.fixed} 道题，我都看见了。` : f.firstOk ? `昨天你有 ${f.firstOk} 道题第一次就做对了！` : '', f.focus ? `这周我们一起练「${esc(f.focus)}」。` : '', f.lastSay ? `昨天的答句我还记得：「${esc(f.lastSay)}」` : ''].filter(Boolean).join('')
    return `<div class="sheet"><div class="morning"><div class="hello"><img src="${stage() ? `/pet/s${stage()}-act-wag.webp` : '/pet/s0.webp'}" alt=""><div><h2>早上好，${kid()}！</h2><p class="dim">${cnDate(D())} · 已陪伴 ${S().days} 天</p></div></div>
      ${gift ? `<div class="gift"><i class="ico coin"></i>昨天你把我照顾得好好的，我叼来了${gift}。</div>` : ''}
      ${M.note ? `<div class="note">${esc(M.note)}<br><small class="dim">爸爸妈妈的留言，${name()}来转达</small></div>` : ''}
      ${said ? `<div class="bubble plain">${said}</div>` : ''}
      <button class="btn" data-a="greet">${gift ? '收下，' : ''}进小屋</button></div></div>`
  }
  if (sheet === 'card' && card) return `<div class="sheet" data-a="close"><div><h2>带回来一张明信片！</h2>${cardHtml(card)}<p class="dim">已经放进纪念册。下一张要过一两天才会出现。</p><button class="btn" data-a="close">收好啦</button></div></div>`
  if (sheet === 'play') {
    const H = V.hide, toys = Object.values(S().toy).reduce((a, b) => a + b, 0)
    return `<div class="sheet" data-a="close"><div><h2>陪${name()}玩什么？</h2>
      <button class="opt" data-a="ball"><span class="ic" style="background:#3b8fd6">球</span><span><b>捡球</b><small>${toys ? `扔出去，它叼回来。用掉 1 次玩具，还剩 ${toys} 次。` : '没有玩具了，小卖部有小球和飞盘。'}</small></span><span class="r">心情 ＋15</span></button>
      <button class="opt" data-a="hidestart" ${H?.win ? 'disabled' : ''}><span class="ic" style="background:#e9a23b">骨</span><span><b>藏骨头</b><small>${H?.win ? '今天找到过了，明天再藏。' : '看线索，猜骨头在哪只杯子下面。不计时。'}</small></span><span class="r">心情 ＋20</span></button>
      <button class="opt" data-a="go" data-v="map"><span class="ic" style="background:#3f9c5f">走</span><span><b>去散步</b><small>${V.walked ? '今天散过步了。' : '打开学期地图，去开放了的地方。有时会带回明信片。'}</small></span><span class="r">›</span></button>
      <button class="btn alt" data-a="close">算了</button></div></div>`
  }
  if (sheet === 'hide' && V.hide) {
    const H = V.hide, opened = i => H.open.find(o => o.i === i), canHard = S().skill['计算失误'] >= 2 && !H.open.length && !H.win
    const bone = '<g class="bone"><g transform="translate(45 112)"><rect x="-22" y="-5" width="44" height="10" rx="5" fill="#fff6e0" stroke="#c99a52" stroke-width="2"/>' + [[-22, -5], [-22, 5], [22, -5], [22, 5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#fff6e0" stroke="#c99a52" stroke-width="2"/>`).join('') + '</g></g>'
    const msg = H.win ? `找到骨头啦！心情 ＋20。` : H.open.length ? `这只下面是 ${H.open.at(-1).v}，骨头不在这儿。再看看线索。` : '先在心里算一算，再翻杯子。'
    return `<div class="sheet"><div><h2>藏骨头</h2><div class="clue">骨头藏在得数是 ${H.target} 的杯子下面</div>
      ${canHard ? `<button class="btn alt" data-a="hard">${H.hard ? '换回简单的杯子' : '稳稳爪：换难一点的（两步算式）'}</button>` : ''}
      <div class="cups">${H.cups.map((e, i) => { const o = opened(i); return `<button class="cup ${o ? 'up' : ''}" data-a="cup" data-v="${i}" ${o || H.win ? 'disabled' : ''}>
        <svg viewBox="0 0 90 130" aria-hidden="true"><ellipse cx="45" cy="121" rx="38" ry="5" fill="#00000018"/>${o && o.v === H.target ? bone : ''}<g class="lid"><path d="M18 40 h54 l10 72 h-74z" fill="${['#e0527a', '#3b8fd6', '#2f8f5b'][i]}"/><path d="M24 52 h8 l-4 50 h-8z" fill="#ffffff33"/><rect x="12" y="108" width="66" height="8" rx="4" fill="#00000022"/></g></svg>
        <span>${esc(e)}</span>${o ? `<small>＝ ${o.v}</small>` : ''}</button>` }).join('')}</div>
      <div class="bubble plain">${msg}</div>
      ${H.win ? '<button class="btn" data-a="close">好耶，回小屋</button>' : '<button class="btn alt" data-a="close">先不玩了</button>'}</div></div>`
  }
  if (sheet === 'tricks') return `<div class="sheet" data-a="close"><div><h2>${name()}的把戏</h2><p class="dim">学会一级本领，就多一个把戏。点一下让它表演。</p>
      ${TRICKS.map(t => { const on = S().skill[t.k] >= 1, sk = SKILLS.find(x => x.k === t.k); return `<button class="opt" data-a="trick" data-v="${t.k}" ${on ? '' : 'disabled'}><span class="ic" style="background:${on ? '#2f8f5b' : '#b8c4bb'}">${t.n[0]}</span><span><b>${t.n}</b><small>${on ? `来自本领「${sk.n}」` : `学会「${sk.n}」第 1 级后解锁`}</small></span><span class="r">${on ? '表演' : ''}</span></button>` }).join('')}
      <button class="btn alt" data-a="close">关上</button></div></div>`
  return ''
}
function vGrad() {
  if (!grad) return ''
  const s = S(), conf = `<div class="conf">${Array.from({ length: 24 }, (_, i) => `<i style="left:${(i * 29) % 100}%;background:${['#ffd766', '#e0527a', '#3b8fd6', '#5cc48a'][i % 4]};animation-delay:-${((i * 0.37) % 3).toFixed(2)}s"></i>`).join('')}</div>`
  if (grad === 1) return `<div class="gradcere">${conf}<h2>${name()}毕业啦！</h2>${petHtml({ st: stage(), cap: true, awake: true })}<p>${kid()}，谢谢你陪我一整个学期。陪伴 ${s.days} 天，一起做了 ${s.qn} 道题，学会了 ${SKILLS.filter(x => s.skill[x.k] >= 1).length} 个本领，带回 ${s.cards.length} 张明信片。${s.jar >= JAR.goal ? '毕业旅行基金存满了，我们去海边旅行！' : s.jar ? `毕业旅行基金存了 ${s.jar}，我们去公园野餐一次。` : ''}</p><button class="btn" data-a="gradnext">下一页</button></div>`
  return `<div class="gradcere green"><h2>寒假也在一起</h2>${petHtml({ st: stage(), cap: true, awake: true })}<p>${name()}戴着学士帽回到小屋，寒假里照样陪你吃饭、散步、藏骨头。下学期开学那天，它去小镇当巡逻队长，住进老朋友墙，把小窝留给新朋友。</p><button class="btn" data-a="gradnext">回小屋</button></div>`
}
const NAV = [['home', '小屋'], ['map', '地图'], ['quests', '任务'], ['skills', '本领'], ['shop', '小卖部']]
const NAV_OF = { result: 'home', story: 'home', diary: 'home', book: 'home', place: 'map' }
let lastPage = ''
function render() {
  if (page === 'login' || !V) { app.innerHTML = vLogin(); return }
  const v = { home: vHome, quests: vQuests, q: vQ, result: vResult, skills: vSkills, shop: vShop, story: vStory, diary: vDiary, map: vMap, place: vPlace, book: vBook }[page]()
  app.innerHTML = v + (page === 'q' ? '' : `<div class="nav">${NAV.map(([k, n]) => `<button class="${page === k || NAV_OF[page] === k ? 'on' : ''}" data-a="go" data-v="${k}">${n}</button>`).join('')}</div>`)
    + vSheet() + vGrad()
    + (cere ? `<div class="cere" aria-hidden="true"><div class="stars">${[[-80, -40], [80, -40], [-60, 60], [65, 50], [0, -90]].map(([x, y]) => `<i style="--x:${x}px;--y:${y}px"></i>`).join('')}</div><span class="ava"><img src="${face('proud')}" alt=""></span><b>叮！「${cere}」技能点 ＋1</b><span>${name()}又离新本领近了一步</span></div>` : '')
    + (toast ? `<div class="toast" role="status">${esc(toast)}</div>` : '')
  if (page !== lastPage) { if (page === 'map') document.getElementById('now')?.scrollIntoView({ block: 'center' }); else if (page !== 'q') window.scrollTo(0, 0) }
  lastPage = page
  if (!pose) act = ''
  cere = null; if (Q) Q.mood = ''
}

// ---------- 做题 ----------
const curItem = () => groups().find(x => x.id === Q.gid).items.find(x => x.id === Q.id)
function startQ(g, it) {
  // 刷新后接着做：服务器记着每道题做到第几步（it.step、it.p）
  Q = { gid: g.id, id: it.id, step: it.format === 'word' && it.step === 1 ? 2 : it.step, kw: it.kw, expr: it.expr, sel: new Set(it.kw?.sel || []), input: '', unit: null, msg: '', flash: false, fin: null, cover: false, mood: '', t0: Date.now(), order: (it.choices || []).map((_, i) => i),
    zone: null, range: it.p?.range, spot: it.p?.spot, goal: it.p?.goal, vals: it.format === 'multi' ? (it.p?.vals || it.blanks.map(() => '')) : (it.p?.vals || []), okIdx: it.p?.ok || [], cur: 0 }
  if (it.format === 'multi') Q.cur = Math.max(0, Q.vals.findIndex((v, i) => !Q.okIdx[i]))
  if (S().slow > 0 && S().slowFrom !== it.id) {      // 「慢慢来」：先盖住 3 秒，剩几题由服务器记
    Q.cover = true
    setTimeout(() => { if (Q?.id === it.id) { Q.cover = false; Q.t0 = Date.now(); render() } }, 3000)
  }
  page = 'q'
}
async function send(payload) {
  const res = await api('/answer', { item: Q.id, ms: Date.now() - Q.t0, ...payload })
  V = res.view
  if (res.fin) { Q.fin = res.fin; Q.msg = ''; Q.mood = res.fin.ok ? 'hop' : 'think'; if (res.fin.point) cere = res.fin.point; return }
  if (res.ok) return res
  Q.flash = !!res.flash; Q.mood = 'think'
  if (res.okIdx) Q.okIdx = res.okIdx
  Q.msg = (res.flash ? '太快啦，还没看清题。接下来几题我们慢慢来。<br>' : '') + esc(res.msg)
  if (!res.keepInput) Q.input = ''
  Q.order.sort(() => Math.random() - .5)
  Q.t0 = Date.now()
}
const A = {
  go(v) { if (v === 'home' && page !== 'home') chat(); if (['shop', 'place'].includes(v)) say = ''; page = v; Q = null; sheet = null },
  story(i) { sp = i === '' || i == null ? null : +i; page = 'story'; Q = null },
  key(k) {
    if (page === 'login') { pin = k === '⌫' ? pin.slice(0, -1) : (pin + k).slice(0, 8); return }
    if (!Q || Q.cover || Q.fin) return
    const edit = v => k === '⌫' ? v.slice(0, -1) : (v + k).slice(0, 5)
    if (curItem().format === 'multi') { if (!Q.okIdx[Q.cur]) Q.vals[Q.cur] = edit(Q.vals[Q.cur]) } else Q.input = edit(Q.input)
  },
  submit() {
    if (page === 'login') return run(async () => { try { await api('/login', { pin }); loginErr = ''; V = await api('/state'); page = 'home'; chat() } catch (e) { loginErr = e.message } pin = '' })
    if (!Q || Q.cover || Q.fin) return
    const it = curItem(), now = () => { Q.input = ''; Q.msg = ''; Q.t0 = Date.now() }
    if (it.format === 'clock') return run(() => send({ zone: Q.zone }))
    if (it.format === 'multi') {
      const empty = Q.vals.filter(v => v === '').length
      if (empty && V.tuning.blank_hint) { Q.msg = `还有 ${empty} 个空没填，填完再交卷。`; return }   // 提醒档：不让交；不提醒档：交了算漏题
      return run(() => send({ values: Q.vals }))
    }
    if (!Q.input) { Q.msg = '还没填得数呢。'; return }
    if (it.format === 'steps') return run(async () => { const res = await send({ value: Q.input }); if (res) { Q.vals = res.vals; now() } })
    return run(() => send(['word', 'plan'].includes(it.format) ? { step: 'answer', value: Q.input, unit: Q.unit } : { value: Q.input }))
  },
  goal(i) { return run(async () => { const res = await send({ step: 'goal', index: +i }); if (res) { Q.step = 1; Q.goal = res.goal; Q.msg = ''; Q.t0 = Date.now() } }) },
  extra() { return run(async () => { const r = await api('/act', { kind: 'extra' }); V = r.view; if (r.extra) page = 'quests'; else say = r.msg, page = 'home' }) },
  zone(z) { Q.zone = +z },
  blank(i) { Q.cur = +i },
  range(i) { return run(async () => { const res = await send({ index: +i }); if (res) { Q.step = 1; Q.range = res.range; Q.msg = ''; Q.t0 = Date.now() } }) },
  spot(i) { return run(async () => { const res = await send({ index: +i }); if (res) { Q.step = 1; Q.spot = res.spot; Q.msg = ''; Q.t0 = Date.now() } }) },
  tok(i) { return run(() => send({ index: +i })) },
  seg(i) { i = +i; Q.sel.has(i) ? Q.sel.delete(i) : Q.sel.add(i) },
  circled() { return run(async () => { const res = await send({ step: 'keywords', sel: [...Q.sel] }); if (res) { Q.kw = res; Q.step = 1; Q.mood = res.kw === 2 ? 'hop' : 'think'; ls.set('kid-circled', ls.get('kid-circled', 0) + 1) } }) },
  kwok() { Q.step = 2; Q.t0 = Date.now() },
  choice(i) { return run(async () => { const res = await send({ step: 'choice', index: +i }); if (res) { Q.step = 3; Q.expr = res.expr; Q.msg = ''; Q.t0 = Date.now() } }) },
  unit(u) { if (Q && !Q.fin) Q.unit = u || null },
  next() { const g = groups().find(x => x.id === Q.gid), it = g.items.find(x => !x.done); if (it) return startQ(g, it); Q = null; page = V.allDone ? 'result' : 'quests'; if (V.allDone) chat('after_practice') },
  group(id) { const g = groups().find(x => x.id === id), it = g?.items.find(x => !x.done); if (it) startQ(g, it) },
  // 初次见面：先给小狗起名，再问孩子的名字
  petname(v) { const n = v ?? document.getElementById('nm-pet')?.value; return run(async () => { const r = await api('/act', { kind: 'name', name: n }); V = r.view; if (S().name) meetBack = false; else showToast(r.msg) }) },
  kidname() { const n = document.getElementById('nm-kid')?.value; return run(async () => { const r = await api('/act', { kind: 'kidname', name: n }); V = r.view; if (S().kid) meetHi = true; else showToast(r.msg) }) },
  meetback() { meetBack = true },
  meetdone() { meetHi = false; say = `${S().kid}，以后请多关照！`; strike('wag') },
  greet() { return run(async () => { const r = await api('/act', { kind: 'greet' }); V = r.view; say = r.msg; strike('wag') }) },
  care(kind) { return run(async () => { const r = await api('/act', { kind }); V = r.view; say = r.msg; if (r.act) strike(r.act) }) },
  buy(k) { return run(async () => { const r = await api('/act', { kind: 'buy', k }); V = r.view; say = r.msg; if (page !== 'shop') showToast(r.msg) }) },
  learn() { return run(async () => { const r = await api('/act', { kind: 'learn', k: sel }); V = r.view; say = r.msg; page = 'home'; strike(r.act || 'hop') }) },
  sel(k) { sel = k },
  tap() { const t = Date.now(); taps = [...taps.filter(x => t - x < 3000), t]; const l = pick(LINES[taps.length >= 5 ? 'tap_too_much' : 'tap']); say = fact(l.t); strike(taps.length >= 5 ? 'spin' : pick(['wag', l.act])) },
  sheet(v) { sheet = v },
  close() { sheet = null; card = null },
  event() { return run(async () => { const r = await api('/act', { kind: 'event' }); V = r.view; say = r.msg; strike(r.act || 'wag') }) },
  ball() { sheet = null; return A.care('toy') },
  hidestart() { return run(async () => { const r = await api('/act', { kind: 'hide' }); V = r.view; if (V.hide) sheet = 'hide'; else showToast(r.msg) }) },
  hard() { return run(async () => { const r = await api('/act', { kind: 'hide', hard: !V.hide.hard }); V = r.view }) },
  cup(i) { return run(async () => { const r = await api('/act', { kind: 'cup', i: +i }); V = r.view; if (V.hide?.win) { say = r.msg; strike('wag') } }) },
  trick(k) { const t = TRICKS.find(x => x.k === k); sheet = null; say = fact(t.say); strike(t.pose || t.anim, t.pose ? t.anim || '' : '') },
  place(k) { if (k === 'home') return A.go('home'); place = k; page = 'place'; say = '' },
  nope() { showToast('还没开放，看看卡片上还差什么。') },
  trip() { return run(async () => { const r = await api('/act', { kind: 'trip', k: place }); V = r.view; say = r.msg; strike(r.act || 'wag', r.anim || ''); if (r.card) { card = r.card; sheet = 'card' } }) },
  jar() { return run(async () => { const r = await api('/act', { kind: 'jar' }); V = r.view; say = r.msg }) },
  ceremony() { return run(async () => { const r = await api('/act', { kind: 'ceremony' }); V = r.view; if (S().graduated && S().grad === D()) grad = 1; else showToast(r.msg) }) },
  gradnext() { grad = grad >= 2 ? 0 : grad + 1; if (!grad) { page = 'home'; say = `${S().kid || '小朋友'}，寒假也要一起玩哦！`; strike('wag') } },
}
const onAct = e => {
  const t = e.target.closest('[data-a]')
  if (!t || t.disabled || (Q?.cover && page === 'q' && t.dataset.a !== 'go')) return
  if (t.classList.contains('sheet') && e.target !== t) return        // 点弹层里面不关
  const r = A[t.dataset.a]?.(t.dataset.v)
  if (!(r instanceof Promise)) render()
}
document.addEventListener('click', onAct)
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.seg[data-a],.room[data-a]')) { e.preventDefault(); onAct(e) }
  if (e.key === 'Enter' && e.target.id === 'nm-pet') A.petname()
  if (e.key === 'Enter' && e.target.id === 'nm-kid') A.kidname()
})
setInterval(() => { if (V && page === 'home' && !busy && !sheet && !pose && !meetStep() && !V.morning && S().name) { chat(); render() } }, 12000)

;(async () => {
  try { V = await api('/state'); page = 'home'; if (S().name) chat() } catch (e) { if (page !== 'login') { app.innerHTML = `<p class="boot">${esc(e.message)}</p>`; return } }
  render()
})()
