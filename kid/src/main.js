// 孩子端页面：小屋、学期地图、今日任务、题型、本领、小卖部、纪念册。答案和金币都在后端（kid/server/game.js），这里只负责显示和把操作发过去。
import './style.css'
import { SKILLS, SKILL_COST, GOODS, STORY_PAGES, STAGES, SCARF_AT, SEASON, PLACES, POSTCARDS, JAR, TRICKS, POSE_MS, placeOpen, addDays, dayDiff,
  SKILL_AT, SKILL_L2, STEP_NAME, toTokens, showExpr, validExpr, stripParens, nextOp, canTap, calcOp, reduceAt, isOp } from '../../shared/contract.js'
import { LINES } from './lines.js'
import { STORY } from './story.js'

const app = document.getElementById('app')
let V = null, page = 'home', Q = null, say = '', act = '', pose = '', poseTimer = 0, sel = '审题', pin = '', loginErr = '', busy = false, taps = [], cere = null
let learned = null, sheet = null, place = null, card = null, meetBack = false, meetHi = false, grad = 0, toast = '', toastTimer = 0, clockSkew = 0
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
  if (r.status === 401 && path !== '/login') { V = null; page = 'login'; if (path.startsWith('/admin')) ADM = null }
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
const hello = () => { const h = (now().getUTCHours() + 8) % 24; return h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好' }
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
// 只有喂食、洗澡、玩球、摸摸、把戏换动作图（动作图上不戴配饰）；其他时候只让整只狗跳一跳、转一转，配饰一直戴着
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

// ---------- 登录和账号管理 ----------
let loginName = ls.get('kid-user', ''), adminMode = false, ADM = null, ADMP = null, ADMW = [], admMsg = '', admEdit = null
function vLogin() {
  const n = adminMode ? 8 : 4
  return `<div class="top"><h1>${adminMode ? '管理员登录' : house(ls.get('kid-pet', ''))}</h1></div><div class="body login">
    ${adminMode ? '' : '<div class="room"><div class="pet"><span class="wear breathe"><img src="/pet/s1.webp" alt=""></span></div></div>'}
    <div class="card"><p>${adminMode ? '输入管理员密码。' : '写上你的名字，再输入 4 位密码，进小屋找小狗玩。'}</p>
      ${adminMode ? '' : `<input id="login-name" class="lname" maxlength="12" autocomplete="username" placeholder="你的名字" aria-label="用户名" value="${esc(loginName)}">`}
      <div class="pin">${Array.from({ length: adminMode ? Math.max(4, pin.length) : n }, (_, i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>${loginErr ? `<p class="dim" style="color:var(--berry);text-align:center">${esc(loginErr)}</p>` : ''}</div>
    ${pad(null, '进去')}
    <button class="link" data-a="adminmode">${adminMode ? '‹ 回到孩子登录' : '管理员登录'}</button></div>`
}
function vAdmin() {
  const us = ADM || [], row = u => `<div class="card urow ${u.off ? 'off' : ''}"><div><b>${esc(u.name)}</b>${u.off ? ' <span class="tagx">停用</span>' : ''}<small>${u.kid ? `孩子「${esc(u.kid)}」· ` : ''}${u.pet ? `小狗「${esc(u.pet)}」· ` : ''}陪伴 ${u.days} 天 · ${u.seen ? `最近来过 ${md(u.seen)}` : '还没来过'}</small></div>
    ${admEdit?.id === u.id ? `<div class="field"><input id="adm-v" ${{ pin: 'inputmode="numeric" maxlength="4" placeholder="新的 4 位密码"', name: 'maxlength="12" placeholder="新的用户名"', kid: `maxlength="6" placeholder="孩子的名字" value="${esc(u.kid)}"`, pet: `maxlength="6" placeholder="小狗的名字" value="${esc(u.pet)}"` }[admEdit.k]} aria-label="新值"><button class="btn" data-a="admsave">保存</button><button class="btn alt" data-a="admcancel">取消</button></div>`
      : `<div class="ubtns"><button class="buy" data-a="admedit" data-v="${u.id}:pin">重置密码</button><button class="buy" data-a="admedit" data-v="${u.id}:name">改用户名</button><button class="buy" data-a="admedit" data-v="${u.id}:kid">改孩子名字</button><button class="buy" data-a="admedit" data-v="${u.id}:pet">改小狗名字</button><button class="buy" data-a="admoff" data-v="${u.id}">${u.off ? '启用' : '停用'}</button></div>`}</div>`
  return `<div class="top"><h1>账号管理</h1><button class="pill scr" data-a="admout">退出</button></div><div class="body">
    ${admMsg ? `<div class="bubble plain">${esc(admMsg)}</div>` : ''}
    <div class="card"><b>新建孩子账号</b><p class="dim">每个账号有自己的小狗和存档，题目大家共用。用户名最多 12 个字，密码是 4 位数字。</p>
      <div class="field"><input id="adm-name" maxlength="12" placeholder="用户名" aria-label="用户名"><input id="adm-pin" inputmode="numeric" maxlength="4" placeholder="4 位密码" aria-label="密码"><button class="btn" data-a="admadd">新建</button></div></div>
    ${us.map(row).join('') || '<p class="dim">还没有账号。</p>'}
    <div class="card"><b>导入题库</b><p class="dim">${ADMP ? `现在是 ${esc(ADMP.week)} 的题库（${ADMP.created ? md(ADMP.created.slice(0, 10)) + ' ' : ''}生成），${ADMP.items} 道题，按每天都来做够 ${ADMP.days} 天${ADMP.days < 14 ? '（不够两周）' : ''}。` : '还没有题库，孩子进来会看到「还没有题」。'}每周家长端归集完，会在数据文件夹的「孩子端题库」里生成 <code>pack-周.json</code>，选它导入。导入新的就换掉旧的，孩子的存档不受影响。</p>
      <div class="field"><input id="adm-pack" type="file" accept=".json,application/json" aria-label="题库文件"><button class="btn" data-a="admpack">导入</button></div></div>
    <div class="card"><b>导出答题记录</b><p class="dim">每周归集前导出，放进家长端的「孩子端题库」文件夹，家长端会读入，用来决定哪些题要再练。</p>
      <div class="field"><select id="adm-lu" aria-label="账号">${us.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select><select id="adm-lw" aria-label="哪一周的题库">${[...ADMW].reverse().map(w => `<option>${esc(w)}</option>`).join('')}</select><button class="btn" data-a="admlog" ${us.length && ADMW.length ? '' : 'disabled'}>导出</button></div></div>
    <p class="dim">管理员只管账号、题库和答题记录文件，网页上不显示孩子的答题。停用的账号登录不了，存档还在，启用后接着玩。</p></div>`
}
async function loadAdmin() { const r = await api('/admin/users'); ADM = r.users; ADMP = r.pack; ADMW = r.weeks || []; page = 'admin' }
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
  return `<div class="top"><h1>${house(s.name)}</h1><button class="pill scr" data-a="sound" aria-label="声音">${ls.get('kid-sound', true) ? '声音开' : '声音关'}</button><button class="pill scr" data-a="logout" aria-label="换人">换人</button>${coin(s.coins)}<span class="pill"><i class="ico star"></i>${stars()}</span></div>
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
    return `<button class="card quest ${left ? '' : 'done'} ${lock ? 'lock' : ''}" ${lock || !left ? 'disabled' : ''} data-a="group" data-v="${g.id}"><b>${esc(g.name)}${tag}</b>${coin((g.items.every(it => it.format === 'oral') ? '每题 ' : '最高 ') + mx)}<span class="dim">${lock ? '做完上面几组后解锁' : `${esc(g.sub || '')} · ${left ? `还有 ${left} 题${(n => n ? `（跳过了 ${n} 题，待会儿回来做）` : '')(g.items.filter(x => !x.done && skips().includes(x.id)).length)}` : '做完了'}`}</span></button>`
  }).join('')}<p class="dim">金币多的题，是你这周最需要练的题。</p></div>`
}

// ---------- 做题：题目由积木拼成，每一步只收作答，整道题做完再判 ----------
function pad(units, go = '交卷', goAct = 'submit', off = false) {
  const u = units ? units.map(x => `<button class="u ${Q?.unit === x ? 'on' : ''}" data-a="unit" data-v="${esc(x)}">${esc(x)}</button>`).join('') + '<span></span>'.repeat(Math.max(0, 4 - units.length)) : ''
  return `<div class="pad">${[1, 2, 3, '⌫', 4, 5, 6, 0, 7, 8, 9].map(k => `<button data-a="key" data-v="${k}">${k}</button>`).join('')}<button class="go" data-a="${goAct}" ${go && !off ? '' : 'disabled'}>${go || '　'}</button>${u}</div>`
}
// ---------- 声音：电子宠物那种「哔哔」声，用 Web Audio 现场合成，不用声音文件；小屋顶上可以关 ----------
const SFX = {
  chirp: [[880, 60], [1320, 90]], spin: [[660, 50], [880, 50], [1100, 50], [1320, 80]], eat: [[330, 50], [0, 40], [330, 50], [0, 40], [392, 70]],
  bath: [[600, 40], [900, 40], [700, 40], [1100, 60]], bounce: [[523, 60], [784, 60], [1047, 100]], trick: [[523, 70], [659, 70], [784, 70], [1047, 150]],
  coin: [[988, 60], [1319, 170]], no: [[220, 90, 'triangle']], happy: [[784, 90], [988, 90], [1175, 180]], sad: [[440, 140, 'triangle'], [349, 220, 'triangle']],
  win: [[523, 80], [659, 80], [784, 80], [1047, 80], [784, 80], [1047, 240]],
}
let actx = null
function sfx(k) {
  if (!SFX[k] || !ls.get('kid-sound', true)) return
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)()
    let t = actx.currentTime + 0.01
    for (const [f, ms, type = 'square'] of SFX[k]) {
      if (f) { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + ms / 1000) }
      t += ms / 1000
    }
  } catch { /* 不支持声音就算了 */ }
}
// iPad 上声音要在点屏幕的那一下启动；喂食之类的声音要等服务器回来才响，所以每次点屏幕都先把声音叫醒
document.addEventListener('pointerdown', () => { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume() } catch { /* 不支持声音 */ } })
/** 圈关键词的点评：圈对了夸一句；漏圈的、多圈的分别点出来 */
function cfbMsg(fb) {
  const q0 = a => a.map(t => `「${t.replace(/[，。,.]$/, '').trim()}」`).join('')
  if (fb.kw === 2) return fb.missed.length ? `圈得很好！${q0(fb.missed)}也可以圈上。${fb.why || ''}` : `要紧的地方都圈到了，没有多圈。${fb.why || ''}`
  const must = fb.must || [], rest = fb.missed.filter(t => !must.includes(t))
  return [must.length ? `${q0(must)}是解这道题最要紧的，一定要圈上！` : '', rest.length ? `${q0(rest)}也可以圈上。` : '', fb.extra.length ? `${q0(fb.extra)}和算数没关系，不用圈。` : '', fb.why].filter(Boolean).join('')
}
// 跳过的题（当天有效，按跳过的先后排）和做到一半的草稿（每题一份）
const skips = () => { const k = ls.get('kid-skip', null); return k?.date === V.date ? k.ids : [] }
const setSkip = ids => ls.set('kid-skip', { date: V.date, ids })
const drafts = () => { const d = ls.get('kid-draft', null); return d?.date === V.date && d.all ? d.all : {} }
/** 这一组下一道：先做没跳过的，都做完了再按跳过的先后回来做 */
function nextItem(g) {
  const left = g.items.filter(x => !x.done), sk = skips()
  return left.find(x => !sk.includes(x.id)) || sk.map(id => left.find(x => x.id === id)).find(Boolean) || left[0]
}
const house = n => n ? `${n}的小屋` : '小柴犬的家'
const greyed = i => [Q.fx.grey ?? []].flat().includes(i)
const curItem = () => Q.demo || groups().find(x => x.id === Q.gid).items.find(x => x.id === Q.id)
// 「试一试」用的示范题：学会新等级后停在这个本领用得上的那一步，菜单直接打开，不扣次数、不计分
const DEMO_WORD = { id: 'demo', format: 'word', max: 0, segs: [{ t: '妈妈' }, { t: '带了 100 元，' }, { t: '去文具店。' }, { t: '店门口趴着 2 只小猫。' }, { t: '一盒彩笔' }, { t: ' 12 元，' }, { t: '买了' }, { t: ' 3 盒，' }, { t: '应找回' }, { t: '多少元？' }],
  flow: [{ type: 'circle' }, { type: 'build', tier: 1, chips: [{ v: 100, seg: 1 }, { v: 12, seg: 5 }, { v: 3, seg: 7 }] }, { type: 'chain' }, { type: 'say', ask: '答：应找回', units: ['元', '盒', '支'], tail: '' }], hide: { grey: [3], digits: 2 } }
const DEMO_PLAN = { id: 'demo', format: 'plan', max: 0, text: '图书馆上午借出 45 本书，下午借出的是上午的 2 倍。这一天一共借出多少本书？',
  flow: [{ type: 'goal', opts: ['下午借出多少本', '一共借出多少本', '上午比下午少借多少本'] }, { type: 'build', tier: 0, choices: ['45 + 45 × 2', '45 × 2', '45 + 2'] }, { type: 'chain' }, { type: 'say', ask: '答：这一天一共借出', units: ['本', '倍'], tail: '' }], hide: { strike: 2, digits: 3 } }
function startDemo(k) {
  const plan = k === '策略缺失', it = plan ? DEMO_PLAN : DEMO_WORD
  const at = { 审题: 0, 概念不清: 2, 计算失误: 2, 格式规范: 3, 漏题: 3, 策略缺失: 0 }[k]
  const rec = [{ sel: [0, 3, 4, 5] }, { expr: [100, '−', 12, '×', 3], chips: [0, null, 1, null, 2] }, { lines: [{ k: 3, v: 36 }, { k: 1, v: 64 }] }].slice(0, at)
  Q = { demo: it, gid: 'demo', id: 'demo', flow: it.flow, i: at, rec, t0: Date.now(), say: '', sk: '', menu: k, fire: null, fin: null, catch: null, cover: false, mood: '', guard: null, caught: null }
  enter(); page = 'q'; sayPet('点菜单里的一级试试看，这次不扣次数。', 'skill')
}
const step = () => Q.flow[Q.i]
const lastStep = () => Q.i === Q.flow.length - 1
const sayPet = (t, kind = '') => { Q.say = t; Q.sk = kind }
const TIPS = { fill: '算好了填进去。', first: '点一下你觉得要先算的那个符号。', clock: '点钟面边上的小圆点，时针就会指过去。', range: '先不急着算。估一估，得数大概在哪一段？', chain: '每一行先点你要先算的符号，再填得数。',
  spot: '这是小狗做的题，有一步算错了。点出最先出错的那一行。', blanks: '点一个空再填数。每个空都要填。', circle: '你觉得哪些地方最要紧，就点哪里，可以点好几处。', goal: '这道题一步算不出来。要先求出什么？', build: '点下面的数和符号，自己拼出算式。', say: '把答句写完整。' }
function startQ(g, it) {
  Q = { gid: g.id, id: it.id, flow: it.flow, i: 0, rec: [], t0: Date.now(), say: '', sk: '', menu: null, fire: null, fin: null, catch: null, cover: false, mood: '', guard: it.guard, caught: it.caught }
  const d = drafts()[it.id]       // 刷新页面前、或者跳过之前做到一半的，接着做
  if (d && d.i < it.flow.length) Object.assign(Q, { rec: d.rec || [], i: d.i })
  setSkip(skips().filter(x => x !== it.id))
  enter()
  if (S().slow > 0 && S().slowFrom !== it.id) {      // 「慢慢来」：先盖住 3 秒，剩几题由服务器记
    Q.cover = true
    setTimeout(() => { if (Q?.id === it.id) { Q.cover = false; Q.t0 = Date.now(); render() } }, 3000)
  }
  page = 'q'
}
/** 进入一步：沿用这一步以前填过的内容（被守护拦下回来改时要用） */
function enter() {
  const b = step(), r = Q.rec[Q.i] || {}
  Object.assign(Q, { input: r.v != null ? String(r.v) : '', unit: r.unit ?? null, sel: new Set(r.sel || []), pick: r.i ?? null, expr: (r.expr || []).map((x, j) => ({ x, chip: r.chips?.[j] })), zone: r.zone ?? null,
    vals: r.vals ? [...r.vals] : r.vs ? r.vs.map(String) : Array(b.blanks ? b.blanks.join('').split('□').length - 1 : b.type === 'check' ? (b.kind === 'mul' ? 4 : b.kind === 'back' ? 3 : 2) : b.cells || (b.rem ? 2 : 0)).fill(''), units: r.units ? [...r.units] : [], cur: 0, lines: null, op: null, fx: {},
    cells: r.cells ? (Array.isArray(r.cells) ? [...r.cells] : { ...r.cells }) : b.type === 'column' ? {} : (b.cats || []).map(() => '').concat(''), pos: 0 })
  if (b.type === 'column' && b.op === '÷') { Q.seq = divSeq(b); Q.pos = Math.max(0, Q.seq.findIndex(k => Q.cells[k] == null)) }
  else if (b.type === 'column') { Q.seq = colSeq(b); Q.pos = Math.max(0, Q.seq.findIndex(k => k[0] === 'd' && Q.cells[k] == null)) }
  sayPet(TIPS[b.type] || '')
  if (b.type === 'chain') {
    const start = b.start || built()
    Q.lines = [{ t: stripParens(start) }]
    if (Q.lines[0].t.length < 2) { save({ lines: [] }); return next() }     // 列出来就是一个数，不用算
    autoOp()
  }
}
const fi = type => Q.flow.findIndex(b => b.type === type)
// 数字卡的值：统计表取孩子自己填的格子，分步题「第一步」卡取孩子上一步写的得数；没填就是 NaN，页面显示「？」
const num = x => x === '' || x == null ? NaN : Number(x)
const chipVal = (b, i) => b.stat ? num(Q.rec[0]?.cells?.[b.chips[i].cat]) : b.chips[i].from != null ? num(Q.rec[Q.flow.findIndex(x => x.type === 'say' && x.ms === b.chips[i].from)]?.v) : b.chips[i].v
/** 竖式填格子的顺序：个位得数 → 写在十位上的进位 → 十位得数 → …… */
const colSeq = b => { const out = []; for (let c = 0; c < b.width; c++) { out.push('d' + c); if (c < b.width - 1) out.push('c' + (c + 1)) } return out }
const divSeq = b => { const n = String(b.a).length, out = [...Array(n).keys()].map(j => 'q' + j); b.rows.forEach((r, k) => { for (let p = 0; p < r.len; p++) out.push(`r${k}_${p}`) }); return out }
/** 除法竖式：商在上面，除数在左边，下面一行乘积、一行减下来再落下一位 */
function divGrid(b) {
  const n = String(b.a).length, cell = (k, small) => { const v = Q.cells[k], cur = Q.seq[Q.pos] === k
    return `<button class="cslot ${small ? 'sm' : ''} ${cur ? 'cur' : ''} ${Q.fx.flash && v == null && k[0] === 'q' ? 'bad' : ''}" data-a="ccell" data-v="${k}">${v ?? ''}</button>` }
  const line = xs => `<div class="drow"><span></span>${xs.join('')}</div>`, span = x => `<span>${x}</span>`
  let out = line([...Array(n).keys()].map(j => span(cell('q' + j))))
  out += `<div class="drow dtop"><span class="dv">${b.b}</span>${[...String(b.a)].map((x, j) => `<span class="${j === 0 ? 'br' : ''}">${x}</span>`).join('')}</div>`
  b.rows.forEach((r, k) => {
    const from = r.col - r.len + 1
    out += `<div class="drow"><span></span>${[...Array(n).keys()].map(j => j >= from && j <= r.col ? `<span class="${r.kind === 'prod' ? 'u' : ''}">${cell(`r${k}_${j - from}`, true)}</span>` : span('')).join('')}</div>`
  })
  return `<div class="card col div">${out}</div>`
}
function colGrid(b) {
  const w = b.width, A = String(b.a).padStart(w, ' '), B = String(b.b).padStart(w, ' '), cell = k => {
    const v = Q.cells[k], cur = Q.seq[Q.pos] === k, paw = k[0] === 'c' && Q.fx.paws?.includes(+k.slice(1))
    return `<button class="${k[0] === 'd' ? 'cslot' : 'ccarry'} ${cur ? 'cur' : ''} ${paw ? 'paw' : ''} ${Q.fx.flash && k[0] === 'd' && v == null ? 'bad' : ''}" data-a="ccell" data-v="${k}">${v ?? ''}</button>` }
  const row = (xs, cls = '') => `<div class="crow ${cls}">${xs.join('')}</div>`, cols = [...Array(w).keys()].reverse()
  return `<div class="card col">${row(cols.map(c => `<span>${c < w - 1 ? cell('c' + (c + 1)) : ''}</span>`), 'carry')}
    ${row([...A].map(x => `<span>${x.trim()}</span>`))}${row([...B].map((x, i) => `<span>${i === 0 ? b.op : x.trim()}</span>`))}<div class="rule"></div>
    ${row(cols.map(c => `<span>${cell('d' + c)}</span>`))}</div>`
}
const lastOf = type => { for (let j = Math.min(Q.i, Q.flow.length - 1); j >= 0; j--) if (Q.flow[j].type === type) return j; return Q.flow.findIndex(b => b.type === type) }
const built = () => { const bi = lastOf('build'), r = Q.rec[bi]; return !r ? [] : r.expr || (r.i != null ? toTokens(curItem().flow[bi].choices[r.i]) : []) }
const chainFinal = () => { const r = Q.rec[fi('chain')]; if (!r) return null; let t = stripParens(curItem().flow[fi('chain')].start || built()); for (const L of r.lines) t = reduceAt(t, L.k, L.v); return t.length === 1 ? t[0] : null }
/** 这一行只剩一个能算的符号（其他的被括号挡着），就直接选上，出填写的框 */
function autoOp() { const L = Q.lines.at(-1), ks = L.t.flatMap((x, k) => canTap(L.t, k) ? [k] : []); Q.op = ks.length === 1 ? ks[0] : null }
function save(x) { Q.rec[Q.i] = { ...(Q.rec[Q.i] || {}), ...x } }
function next() { if (lastStep()) return submitQ(); Q.i++; enter() }
function submitQ() {
  if (Q.demo) { Q = null; page = 'skills'; showToast('试过了！真正做题时，点亮着的徽章就能用。'); return }
  return run(async () => {
    const res = await api('/answer', { item: Q.id, ms: Date.now() - Q.t0, steps: Q.rec })
    V = res.view; Q.t0 = Date.now()
    if (res.caught) { Q.catch = res.caught; Q.guard = null; Q.mood = 'think'; return }
    const d = res.fin
    Q.fin = d; Q.menu = null; Q.mood = d.ok ? 'hop' : 'think'; sayPet(''); sfx(d.ok ? 'happy' : d.c ? 'chirp' : 'sad')
    if (d.points?.length) cere = d.points.join('」「')
  })
}

// 题干：应用题按段显示（圈关键词时能点），其他题型一句话
function qText(mode) {
  const it = curItem()
  if (it.format === 'stat') {
    const tb = Q.flow[0], own = Q.rec[0]?.cells || Q.cells, q = step()?.t || ''
    return `${statTable(tb, own, false)}${q && step()?.type !== 'say' ? `<div class="bubble plain good">${esc(q)}</div>` : ''}`
  }
  if (it.segs) {
    const ci = fi('circle'), circ = new Set(Q.rec[ci]?.sel || []), last = it.segs.length - 1
    return `<div class="card q">${speaker()}${it.segs.map((s, i) => {
      let c = mode === 'pick' ? 'seg' : 'seg flat'
      const fb = Q.rec[ci]?.cfb
      if (mode === 'pick') { if (Q.sel.has(i)) c += ' on'; if (greyed(i)) c += ' grey' }
      else if (mode === 'review' && fb) c = 'seg fixed ' + (fb.keys.includes(i) ? (circ.has(i) ? 'key' : fb.mustIdx?.includes(i) ? 'miss must' : 'miss') : fb.noise.includes(i) && circ.has(i) ? 'noise' : circ.has(i) ? 'on' : '')
      else if (circ.has(i)) c += ' on'
      if (Q.fx.trail && i === last) c += ' trail'
      return `<span class="${c}" ${mode === 'pick' && !greyed(i) ? `role="button" tabindex="0" data-a="seg" data-v="${i}"` : ''}>${esc(s.t)}</span>`
    }).join('')}</div>`
  }
  return it.text ? `<div class="card q">${speaker()}${esc(it.text)}</div>` : ''
}
const speaker = () => V.tuning.read_aloud ? '<button class="spk" data-a="read" aria-label="读题">🔊</button>' : ''
/** 统计记录：每一类后面是正字或 ✓；稳稳爪 2 级时在每个整的「正」下面标 5 */
const record = b => `<div class="card rec"><p class="dim">${esc(curItem().title)}，记录如下。</p>${b.cats.map((c, i) => `<div><b>${esc(c)}</b><span>${[...b.marks[i]].map(m => m === '正' && Q.fx.five ? '<i>正<sub>5</sub></i>' : esc(m)).join('')}</span></div>`).join('')}</div>`
function statTable(b, cells, live) {
  const n = b.cats.length, td = i => live ? `<td><button class="tc ${i === Q.pos ? 'cur' : ''} ${Q.fx.flash && (cells[i] ?? '') === '' ? 'bad' : ''}" data-a="tcell" data-v="${i}" aria-label="${i < n ? esc(b.cats[i]) : '合计'}">${esc(cells[i] ?? '')}</button></td>` : `<td><b>${esc(cells[i] ?? '')}</b></td>`
  return `<div class="card stab"><p class="dim">${esc(curItem().title)}统计表</p><table><tr><th>种类</th>${b.cats.map(c => `<th>${esc(c)}</th>`).join('')}<th>合计</th></tr><tr><th>${esc(b.head || '数量')}</th>${b.cats.map((_, i) => td(i)).join('')}${td(n)}</tr></table></div>`
}
const box = (v, cur = true, cls = '') => `<span class="box ${cur ? 'cur' : ''} ${cls}">${v === '' || v == null ? '&nbsp;' : esc(v)}</span>`
function vStep() {
  const it = curItem(), b = step(), go = lastStep() ? '交卷' : '下一步'
  if (b.type === 'column' && b.op === '÷') return `<p class="dim">用竖式计算 ${b.a} ÷ ${b.b}。从最高位除起，商写在上面；一位不够除，商就写 0。下面一行写乘积，一行写减下来的数和落下来的一位。</p>${divGrid(b)}${pad(null, go, 'stepgo')}`
  if (b.type === 'check') {
    const tpl = { mul: '□ × □ + □ = □', back: it.op === '+' ? '□ − □ = □' : '□ + □ = □', estimate: `□ × ${b.b} ≈ □` }[b.kind], parts = tpl.split('□')
    return `<div class="bubble plain good">验算一下：${b.kind === 'mul' ? '商 × 除数 + 余数，应该等于被除数（没有余数就填 0）' : b.kind === 'back' ? (it.op === '+' ? '和 − 一个加数 = 另一个加数' : '差 + 减数 = 被减数') : `把 ${b.a} 看成接近它的整十或整百数，估一估`}</div>
      <div class="card"><div class="ans big2">${parts.map((x, j) => esc(x) + (j < parts.length - 1 ? `<button class="bx" data-a="blank" data-v="${j}">${box(Q.vals[j], Q.cur === j)}</button>` : '')).join('')}</div></div>${pad(null, go, 'stepgo')}`
  }
  if (b.type === 'column') return `<p class="dim">用竖式计算 ${b.a} ${b.op} ${b.b}，从个位算起。${b.op === '−' ? '退位' : '进位'}写在上面的小格里，没有就空着。点格子可以改。</p>${colGrid(b)}${pad(null, go, 'stepgo')}`
  if (b.type === 'table') return `${record(b)}${statTable(b, Q.cells, true)}<p class="dim">点一个格子再填数，合计也要填。</p>${pad(null, go, 'stepgo')}`
  if (b.type === 'pickcat') return `${qText()}<div class="opts">${b.opts.map((o, i) => `<button data-a="pickgo" data-v="${i}">${esc(o)}</button>`).join('')}</div>`
  if (b.type === 'tapnum') {
    const order = b.nums.map((_, i) => i); if (Q.fx.sorted) order.sort((x, y) => b.nums[x] - b.nums[y])
    const slot = Q.unit ? `<button class="uchip" data-a="unit" data-v="">${esc(Q.unit)}</button>` : V.tuning.unit_hint ? '<span class="uslot" aria-label="空着的单位格"></span>' : ''
    return `${it.segs ? qText() : `<div class="card q">${esc(b.text)}</div>`}<div class="card nums">${order.map(i => `<button class="${Q.sel.has(i) ? 'on' : ''}" data-a="seg" data-v="${i}">${b.nums[i]}</button>`).join('')}</div>
      <div class="card"><div class="ans">${esc(b.ask)} ${box(Q.input)} ${slot}</div></div>${pad(b.units, go, 'stepgo')}`
  }
  if (b.type === 'fill') {
    const r = fi('range'), spot = fi('spot')
    if (it.format === 'fix') return `<div class="card"><div class="line">${esc(curItem().flow[spot].text)}</div>${curItem().flow[spot].shown.map((t, i) => `<div class="frow ${i === Q.rec[spot]?.i ? 'bad' : ''}">${esc(t)}</div>`).join('')}<div class="line">正确的得数 ＝ ${box(Q.input)}</div></div>${pad(null, go, 'stepgo')}`
    if (b.rem) return `<div class="card q big">${esc(b.text)} ＝ <button class="bx" data-a="blank" data-v="0">${box(Q.vals[0], Q.cur === 0)}</button> …… <button class="bx" data-a="blank" data-v="1">${box(Q.vals[1], Q.cur === 1)}</button></div><p class="dim">左边填商，右边填余数。点格子可以换。</p>${pad(null, go, 'stepgo')}`
    return `<div class="card q big">${esc(b.text)} ＝ ${box(Q.input)}</div>${r >= 0 ? `<p class="dim">你估的是 ${esc(curItem().flow[r].opts[Q.rec[r]?.i] ?? '')}。现在算出准确的得数。</p>` : ''}${pad(null, go, 'stepgo')}`
  }
  if (b.type === 'first') return `<div class="card q big">${b.tokens.map((t, i) => /^[+−×÷]$/.test(t) ? `<button class="tok ${Q.pick === i ? 'on' : ''}" data-a="pick" data-v="${i}">${t}</button>` : `<span>${esc(t)}</span>`).join(' ')}</div><button class="btn" data-a="stepgo" ${Q.pick == null ? 'disabled' : ''}>就先算它</button>`
  if (b.type === 'clock') return `${qText()}${clock(b)}<button class="btn" data-a="stepgo" ${Q.zone == null ? 'disabled' : ''}>拨好了</button>`
  if (b.type === 'range') return `<div class="card q big">${esc(b.text)}</div><div class="opts">${b.opts.map((o, i) => `<button data-a="pickgo" data-v="${i}">${esc(o)}</button>`).join('')}</div>`
  if (b.type === 'spot') return `<div class="card"><div class="line">${esc(b.text)}</div>${b.shown.map((t, i) => `<button class="frow" data-a="pickgo" data-v="${i}">${esc(t)}</button>`).join('')}</div>`
  if (b.type === 'blanks') {
    let g = 0
    const rows = b.blanks.map(t => { const parts = t.split('□'), start = g; g += parts.length - 1
      return `<div class="mrow ${Q.cur >= start && Q.cur < g ? 'cur' : ''}">${parts.map((x, j) => esc(x) + (j < parts.length - 1 ? `<button class="bx ${Q.fx.flash && Q.vals[start + j] === '' ? 'bad' : ''}" data-a="blank" data-v="${start + j}">${box(Q.vals[start + j], Q.cur === start + j)}</button>` : '')).join('')}</div>` }).join('')
    return `${it.text ? `<p class="dim">${esc(it.text)}</p>` : ''}<div class="card multi">${rows}</div><p class="dim">点一个空再填数。每个空都要填。</p>${pad(null, go, 'stepgo')}`
  }
  if (b.type === 'circle' && Q.rec[Q.i]?.cfb) {
    // 圈完马上点评：绿色是圈对的，橙色虚线是漏圈的，灰色划掉的是不用圈的。点评过就定下来了，回到这一步只能看
    const fb = Q.rec[Q.i].cfb
    return `${qText('review')}<div class="review ${fb.kw === 2 ? 'good' : ''}"><img src="/pet/s${stage() || 1}-face-${fb.kw === 2 ? "proud" : "thinking"}.webp" alt=""><div><b>${name()}说：</b>${esc(cfbMsg(fb))}</div></div>
      <p class="dim">绿色是圈对的${fb.must?.length ? '，红色虚线是漏掉的最要紧的' : ''}${fb.missed.length > (fb.must?.length || 0) ? '，橙色虚线是还可以圈的' : ''}${fb.extra.length ? '，灰色划掉的是和算数没关系的' : ''}。</p><button class="btn" data-a="stepgo">知道了，${Q.flow[Q.i + 1]?.type === 'build' ? '去列式' : '下一步'}</button>`
  }
  if (b.type === 'circle') return `${qText('pick')}<p class="dim">可以点好几处，再点一下取消。圈完不会马上对答案，整道题做完再一起看。</p><button class="btn" data-a="stepgo" ${Q.sel.size ? '' : 'disabled'}>圈好了，${Q.flow[Q.i + 1]?.type === 'build' ? '去列式' : '下一步'}</button>`
  if (b.type === 'goal') return `${qText()}<div class="opts">${b.opts.map((o, i) => `<button class="${i === Q.fx.strike ? 'struck' : ''}" data-a="pickgo" data-v="${i}" ${i === Q.fx.strike ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>`
  if (b.type === 'build') {
    const gi = fi('goal'), head = b.head ? `<div class="bubble plain good">${esc(b.head)}</div>` : gi >= 0 ? `<div class="bubble plain good">先求：${esc(it.flow[gi].opts[Q.rec[gi]?.i] ?? '')}</div>` : ''
    if (b.tier === 0) return `${qText()}${head}<p class="dim">选一个算式。选了直接进下一步，交卷后再看对不对。</p><div class="opts">${b.choices.map((o, i) => `<button data-a="pickgo" data-v="${i}">${esc(o)}</button>`).join('')}</div>`
    // 数字卡只写数，不注明是哪一类、哪一步、有没有圈过：每个数的意思让孩子自己记住
    const chips = b.chips.map((c, i) => `<button class="chip" data-a="chip" data-v="${i}" ${Q.expr.some(e => e.chip === i) ? 'disabled' : ''}>${b.stat || c.from != null ? esc(Number.isFinite(chipVal(b, i)) ? chipVal(b, i) : '？') : c.v}</button>`).join('')
    return `${qText()}${head}<div class="card"><div class="expr">${Q.expr.length ? esc(showExpr(Q.expr.map(e => e.x))) : '<span class="ph">点下面的数和符号拼算式</span>'}</div></div>
      <div class="chips">${chips}</div>
      <div class="ops">${['+', '−', '×', '÷', '(', ')'].map(o => `<button data-a="op" data-v="${o}">${o}</button>`).join('')}<button data-a="del" aria-label="退一格">⌫</button><button data-a="clr">清空</button></div>
      <button class="btn" data-a="stepgo" ${Q.expr.length ? '' : 'disabled'}>列好了</button>`
  }
  if (b.type === 'chain') {
    const rows = Q.lines.map((L, r) => {
      const live = r === Q.lines.length - 1
      return `<div class="line">${r ? '= ' : ''}${L.t.map((x, k) => {
        if (live && isOp(x)) return `<button class="op ${Q.fx.mark && k === nextOp(L.t) ? 'mark' : ''} ${Q.op === k ? 'used' : ''}" data-a="tapop" data-v="${k}" ${canTap(L.t, k) ? '' : 'disabled'}>${x}</button>`
        if (!live && k >= L.k - 1 && k <= L.k + 1) return `<span class="used">${x}</span>`
        return `<span>${x}</span>`
      }).join(' ')}</div>`
    }).join('')
    const L = Q.lines.at(-1), nl = Q.op == null ? '' : `<div class="line">= ${[...L.t.slice(0, Q.op - 1), '□', ...L.t.slice(Q.op + 2)].map(x => x === '□' ? box(Q.input) : `<span>${x}</span>`).join(' ')}</div>`
    return `${qText()}<div class="card">${rows}${nl}</div><p class="dim">算错了也不会被打断，交卷后一起看。</p>${pad(null, Q.op == null ? '先点符号' : '填好了', 'stepgo', Q.op == null)}`
  }
  if (b.type === 'say') {
    const slot = Q.unit ? `<button class="uchip" data-a="unit" data-v="">${esc(Q.unit)}</button>` : V.tuning.unit_hint ? '<span class="uslot" aria-label="空着的单位格"></span>' : ''
    const ex = built(), fin = ['stat', 'multistep'].includes(curItem().format) ? null : chainFinal()
    if (b.cells) {
      const parts = b.ask.split('□'), cell = j => `<button class="bx" data-a="blank" data-v="${j}">${box(Q.vals[j], Q.cur === j)}</button>${Q.units[j] ? `<span class="uchip">${esc(Q.units[j])}</span>` : V.tuning.unit_hint ? '<span class="uslot"></span>' : ''}`
      return `${qText()}${ex.length ? `<div class="card"><div class="expr">${esc(showExpr(ex))}</div></div>` : ''}<div class="card"><div class="ans">${parts.map((x, j) => esc(x) + (j < parts.length - 1 ? cell(j) : '')).join('')} ${esc(b.tail || '')}</div></div><p class="dim">点一格，填数，再点下面的单位。</p>${pad(b.units, go, 'stepgo')}`
    }
    return `${qText()}${ex.length ? `<div class="card"><div class="expr">${esc(showExpr(ex))}${fin != null ? ` ＝ ${fin}` : ''}</div></div>` : ''}<div class="card"><div class="ans">${esc(b.ask)} ${box(Q.input, true, Q.fx.flash && !Q.input ? 'bad' : '')} ${slot} ${esc(b.tail || '')}</div></div>${pad(b.units, go, 'stepgo')}`
  }
  return ''
}
// 陪伴条：小狗、它说的话、这一步用得上的本领徽章
function vDock() {
  const it = curItem(), b = Q.fin ? null : step(), sk = b ? SKILLS.filter(x => S().skill[x.k] > 0 && SKILL_AT[x.k].includes(b.type)) : []
  const f = Q.catch ? 'shy' : Q.fin ? (Q.fin.ok ? 'proud' : 'thinking') : Q.mood === 'think' ? 'thinking' : 'happy'
  const badges = sk.map(x => {
    const lv = S().skill[x.k], any = [1, 2, 3].some(L => L <= lv && canUse(x.k, L, b) === '')
    return `<button class="badge ${any ? 'can' : 'used'} ${Q.guard === x.k ? 'guard' : ''} ${Q.fire?.k === x.k ? 'fire' : ''}" data-a="menu" data-v="${x.k}" aria-label="${x.n} ${lv} 级"><img src="/pet/badge-${x.badge}.webp" alt=""><b>${x.n}</b><span class="dots">${[1, 2, 3].map(i => `<i class="${i <= lv ? 'f' : ''}"></i>`).join('')}</span>${Q.guard === x.k ? '<span class="shield">守护中</span>' : ''}</button>`
  }).join('')
  const said = Q.say || (Q.fin ? (Q.fin.ok ? '做对啦！' : Q.fin.c ? '大部分都做对了，就差一点！看看哪里不一样。' : '没关系，看看正确做法。') : '我陪着你。')
  return `<div class="dock"><span class="dog ${Q.mood ? 'a-' + (Q.mood === 'think' ? 'think' : 'hop') : ''}"><img src="${face(f)}" alt=""></span><div class="say ${Q.sk}">${esc(said)}</div><div class="badges">${badges}</div></div>${it ? '' : ''}`
}
const LV = ['', '提醒', '帮忙', '守护']
const GUARD = { 审题: '题目里的条件用错', 概念不清: '先算错了顺序', 计算失误: '算错了数', 格式规范: '答句单位没写对', 漏题: '有空着的就交', 策略缺失: '先求的东西选错' }
const HELP2 = { 审题: '把一句用不上的话变灰', 概念不清: '给先算的那块标 ①', 计算失误: '说出得数是几位数', 格式规范: '把答句读出声', 漏题: '陪你验算', 策略缺失: '划掉一个走不通的' }
const HELP1 = { 审题: '提醒先看它问什么', 概念不清: '提醒运算顺序的规矩', 计算失误: '提醒估一估', 格式规范: '提醒从头读一遍答句', 漏题: '看看还有几个空着', 策略缺失: '告诉你这题要走几步' }
/** 这一级现在能不能用：'' 能用，否则是原因 */
function canUse(k, L, b) {
  if (L === 2 && !SKILL_L2[k].includes(b.type)) return '这一步用不上'
  if (L === 3 && (Q.guard || Q.caught)) return Q.guard === k ? '正在守着这道题' : '这题已经有本领守着了'
  if (!Q.demo && (V.uses?.[k]?.[L] ?? 0) <= 0) return `${L === 3 ? '这周' : '今天'}的次数用完了`
  return ''
}
function vMenu() {
  const k = Q.menu, x = SKILLS.find(s => s.k === k), b = step()
  const rows = [1, 2, 3].filter(L => L <= S().skill[k]).map(L => {
    const why = canUse(k, L, b), d = L === 1 ? HELP1[k] : L === 2 ? HELP2[k] : `守着这道题：交卷时如果${GUARD[k]}，先拦下让你改`
    return `<button class="opt pw" data-a="use" data-v="${k}:${L}" ${why ? 'disabled' : ''}><span class="ic lv">${L}</span><span><b>${L} 级 · ${LV[L]}</b><small>${esc(why && why !== `${L === 3 ? '这周' : '今天'}的次数用完了` ? why : d)}</small></span><span class="r">${L === 3 ? '这周' : '今天'}剩 ${Math.max(0, V.uses?.[k]?.[L] ?? 0)}</span></button>`
  }).join('')
  return `<div class="sheet" data-a="shut"><div><h2><img class="hb" src="/pet/badge-${x.badge}.webp" alt="">请${x.n}帮什么？</h2>${rows}<p class="dim">${L2note()}</p><button class="btn alt" data-a="shut">先不用了</button></div></div>`
}
const L2note = () => '用了 2 级帮忙，这题就没有过程奖；3 级守护没用上，次数会退回。'
async function useSkill(k, L) {
  const it = curItem(), b = step(), sk = SKILLS.find(x => x.k === k)
  const r = Q.demo ? { fx: { k, L, ...it.hide } } : await api('/act', { kind: 'skill', k, L, item: it.id, step: Q.i })
  if (r.view) V = r.view
  Q.menu = null
  if (!r.fx) { if (r.msg) sayPet(r.msg); return }
  const fx = r.fx, L1 = {
    审题: { pickcat: '（嗅嗅）看清楚问的是最多还是最少。', tapnum: '（嗅嗅）看清楚条件：「超过」包不包括它本身？', circle: '（嗅嗅）先看最后一句，它问的是什么？我在下面留了一串脚印。', build: '（嗅嗅）看清楚题目问的是什么，要用的数都在题目里。', goal: '（嗅嗅）想想问题问的是什么，要知道它，先得知道什么？' },
    概念不清: '有括号先算括号里的；没括号先算乘除，再算加减。',
    计算失误: { column: '每算完一位，想想要不要往前进位（减法看要不要退位）。', table: '一个「正」是 5。先数整的正，再数零头。', range: '先看最高位，大概是几百、几十？', blanks: '每个空算完，再对一遍。', default: '交之前估一估：得数大概几位数？和你写的对得上吗？' },
    格式规范: '写完了从头读一遍答句，看看有没有落下什么。',
    策略缺失: '（拿出小地图）这题要走两步：先求一个中间的数，再求问题问的。',
  }
  if (L === 3) { Q.guard = k; sayPet(`${sk.n}守着这道题。交卷时如果${GUARD[k]}，它会先拦下来。`, 'skill') }
  if (L === 1) {
    if (k === '审题' && b.type === 'circle') Q.fx.trail = true
    if (k === '漏题') { const n = b.type === 'column' ? Q.seq.filter(x => x[0] === 'd' && Q.cells[x] == null).length : b.type === 'blanks' ? Q.vals.filter(v => v === '').length : b.type === 'table' ? Q.cells.filter(v => v === '').length : (Q.input ? 0 : 1) + (Q.unit ? 0 : 1); Q.fx.flash = true; sayPet(n ? `（巡逻绕一圈）还有 ${n} 个格子空着。` : '（巡逻绕一圈）每个格子都填了。', 'skill') }
    else { const t = L1[k], line = typeof t === 'string' ? t : t[b.type] || t.default || ''; sayPet(fx.hint ? `${line} ${fx.hint}` : line, 'skill') }
  }
  if (L === 2) {
    if (k === '审题') { Q.fx.grey = [fx.grey].flat(); Q.fx.grey.forEach(i => Q.sel.delete(i)); sayPet('（嗅嗅）变灰的这句和算数没关系，不用管它。', 'skill') }
    if (k === '概念不清') { Q.fx.mark = true; sayPet('先算标着 ① 的那块。', 'skill') }
    if (k === '计算失误') {
      if (b.type === 'column') { Q.fx.paws = fx.paws; sayPet('亮着爪印的小格要写进位（或退位）。', 'skill') }
      else if (b.type === 'table') { Q.fx.five = true; sayPet('每个整的「正」下面都标了 5，零头自己数。', 'skill') }
      else if (b.type === 'chain') { const L = Q.lines.at(-1), j = nextOp(L.t); sayPet(`（爪子比一比）这一行先算的那块，得数是 ${String(calcOp(L.t[j - 1], L.t[j], L.t[j + 1])).length} 位数。`, 'skill') }
      else sayPet(`（爪子比一比）得数是 ${fx.digits} 位数。`, 'skill')
    }
    if (k === '格式规范') {
      const text = `${b.ask} ${Q.input || '……'} ${Q.unit || '……'} ${b.tail || ''}`
      try { const u = new SpeechSynthesisUtterance(text.replace(/……/g, '，嗯，')); u.lang = 'zh-CN'; speechSynthesis.cancel(); speechSynthesis.speak(u) } catch { /* 不支持朗读就只显示文字 */ }
      sayPet(`（读出声）「${text}」${Q.unit ? '' : '……读到最后好像停住了？'}`, 'skill')
    }
    if (k === '漏题' && b.type === 'column') sayPet(`（巡逻陪你估一估）${fx.est}`, 'skill')
    else if (k === '漏题') { if (b.type === 'tapnum') Q.fx.sorted = true; sayPet(b.type === 'say' ? '验算：把答句里的得数代回题目想一想，说得通吗？' : b.type === 'table' ? '验算：把各类加起来，和合计对一对。' : b.type === 'tapnum' ? '我把数从小到大排好了，你再找。' : '验算：每个空填好后，从头到尾再算一遍。', 'skill') }
    if (k === '策略缺失') { Q.fx.strike = fx.strike; sayPet('（探路跑了一圈）这条路走不通，我先帮你划掉。', 'skill') }
  }
  Q.fire = { k, text: `${sk.n} ${L} 级 · ${LV[L]}` }
}
function vCatch() {
  const c = Q.catch, x = SKILLS.find(s => s.k === c.k)
  return `<div class="sheet"><div class="catch"><img class="big" src="/pet/badge-${x.badge}.webp" alt=""><h2>${x.n}接住了！</h2><p>${esc(c.msg)}。</p><p class="dim">回去改这一步再交。这次金币照给，但不算第一次就做对。</p><button class="btn" data-a="fix">回去改</button></div></div>`
}
const HABIT = { 审题: '圈得刚刚好', 格式规范: '单位第一次就写对', 概念不清: '先算的顺序都对', 计算失误: '每一步都算对了', 策略缺失: '先求什么找对了' }
function vQResult(g) {
  const d = Q.fin, more = g.items.some(x => !x.done), b = d.boss, mark = { y: '✓', n: '✗', h: '!' }
  const sk = cat => { const x = SKILLS.find(s => s.k === cat); return x && S().skill[cat] ? `<small class="dim"> · ${x.n}管这个</small>` : '' }
  const it = curItem(), lab = h => it.format === 'stat' ? { 审题: '看清了问的是什么', 计算失误: '统计表填对了' }[h] || HABIT[h] : it.format === 'data' ? { 审题: '条件看清楚了' }[h] || HABIT[h] : HABIT[h]
  const habits = (d.habits || []).filter(h => lab(h)).map(h => `<span class="cond ok">${lab(h)}</span>`).join('')
  const extra = [...(d.help || []).map(h => `<div class="h"><i>★</i><span>本领帮了你 · ${esc(h)}</span></div>`),
    ...(d.caught ? [`<div class="h"><i>◆</i><span>被${esc(d.caught.n)}接住了一次（不算第一次就做对，金币照给）</span></div>`] : []),
    ...(d.refund ? [`<div class="y"><i>↺</i><span>${esc(d.refund)}守着这题，没用上，这周的守护次数退回去了</span></div>`] : [])].join('')
  return `<div class="verdict"><b>${d.ok ? '做对了！' : d.c ? '差一点点！做对的部分有金币' : '这题没做对，一起看看'}</b>${d.ok || d.c ? `<span class="sum"><i class="ico coin"></i>＋${d.c}</span>` : ''}</div>
    ${habits ? `<div class="conds">${habits}</div>` : ''}
    <div class="card items">${(d.items || []).map(x => `<div class="${x.good}"><i>${mark[x.good]}</i><span>${esc(x.msg)}${x.good !== 'y' ? sk(x.cat) : ''}</span></div>`).join('')}${extra}</div>
    ${d.ok ? '' : `<div class="right"><b>正确做法</b><br>${d.lines.map(esc).join('<br>')}${d.explain ? `<br><span class="dim">${esc(d.explain)}</span>` : ''}</div>`}
    <p class="dim">${d.ok ? [d.bonus ? '连续 5 题第一次就对，再加 5。' : '', d.l2 ? '用了 2 级帮忙，这题没有过程奖。' : d.pb ? `过程奖 ＋${d.pb} 已算在里面。` : '', d.patrol ? '今天没有急着答错的题，得到 1 个「巡逻」技能点。' : '', d.extra ? '加练的题金币减半。' : ''].join('') : (d.flash ? '太快啦，还没看清题。接下来几题我们慢慢来。' : (d.c ? `做对的部分给了 ${d.c} 金币，错的那一处看看正确做法。过两天它会换个样子再来。` : '这题没有做对的部分，所以没有金币。过两天它会换个样子再来。'))}</p>
    ${d.day ? `<div class="bubble plain">今天的任务做完了，${name()}已经陪你 ${d.day} 天。</div>` : ''}
    ${d.grew ? `<div class="bubble plain">${name()}长大了，现在是${STAGES[d.grew].n}！${PLACES.find(p => p.st === d.grew) ? `${PLACES.find(p => p.st === d.grew).n}开放了，` : ''}回小屋看看。</div>` : ''}
    ${d.wish ? `<div class="bubble plain">这周来满啦！可以去找爸爸妈妈兑换心愿：${esc(d.wish)}。</div>` : ''}
    ${b ? `<div class="bubble plain">${b.pass ? `闯关成功！${b.n} 题答对 ${b.okN} 题，再得 ${b.coins} 金币${b.story ? `，解锁了故事书第 ${b.story} 页` : b.card ? `。这一章的故事读完了，${name()}带回一张明信片` : ''}。` : `闯关 ${b.n} 题答对 ${b.okN} 题，差一点。下周五再来。`}</div>` : ''}
    ${!d.ok && d.walk ? '<button class="btn alt" data-a="walk">跟着正确做法再做一遍<small>不计金币，亲手做对一次</small></button>' : ''}
    ${b?.pass && b.story ? `<button class="btn" data-a="story" data-v="${b.story - 1}">看新故事</button>` : `<button class="btn" data-a="next">${more ? '下一题' : V.allDone ? '看今天的成绩' : '回到任务'}</button>`}`
}
/** 跟着做一遍：一步一个空，填对了才往下走，不计金币 */
function vWalk() {
  const W = Q.walk, st = Q.fin.walk[W.i]
  if (!st) return `<div class="verdict"><b>你亲手做对了一遍！</b></div><div class="right">${Q.fin.lines.map(esc).join('<br>')}</div><button class="btn" data-a="next">${groups().find(x => x.id === Q.gid)?.items.some(x => !x.done) ? '下一题' : '回到任务'}</button>`
  const done = Q.fin.walk.slice(0, W.i).map(x => `<div class="y"><i>✓</i><span>${esc(x.q.replace('□', x.a + (x.unit ? ' ' + x.unit : '')))}</span></div>`).join('')
  const slot = st.unit ? (W.unit ? `<button class="uchip" data-a="unit" data-v="">${esc(W.unit)}</button>` : '<span class="uslot"></span>') : ''
  const [l, r = ''] = st.q.split('□')
  return `<div class="bubble plain good">跟着正确做法再做一遍，不计金币。第 ${W.i + 1} / ${Q.fin.walk.length} 步</div><div class="right"><b>正确做法</b><br>${Q.fin.lines.map(esc).join('<br>')}</div>${done ? `<div class="card items">${done}</div>` : ''}
    <div class="card"><div class="ans">${esc(l)} ${box(W.input, true, W.bad ? 'bad' : '')} ${slot} ${esc(r)}</div></div>${pad(st.units || null, '填好了', 'walkgo')}`
}
function vQ() {
  const g = Q.demo ? { name: '试一试', items: [Q.demo] } : groups().find(x => x.id === Q.gid), it = curItem(), idx = g.items.indexOf(it) + 1
  // 做过的步骤可以点回去改，不扣分；回去改完再往后走，后面填过的还在
  const live = !Q.fin && !Q.catch && !Q.walk && !Q.cover
  const bar = Q.flow.length > 1 ? `<div class="stepbar">${live && Q.i > 0 ? '<button class="pill" data-a="backto" data-v="">‹ 上一步</button>' : ''}<div class="steps" style="grid-template-columns:repeat(${Q.flow.length},1fr)">${Q.flow.map((t, i) => live && i < Q.i ? `<button class="done" data-a="backto" data-v="${i}">${STEP_NAME[t.type]}</button>` : `<span class="${Q.fin || i < Q.i ? 'done' : i === Q.i ? 'now' : ''}">${STEP_NAME[t.type]}</span>`).join('')}</div></div>` : ''
  return `<div class="top"><button class="back" data-a="go" data-v="quests" aria-label="回到任务">‹</button><h1>${esc(g.name)} ${idx}/${g.items.length}</h1>${!Q.demo && !Q.fin && !Q.catch && !Q.walk ? '<button class="pill scr" data-a="skip">跳过</button>' : ''}<button class="pill scr" data-a="scratch">草稿</button>${coin('最高 ' + (g.extra ? Math.ceil(it.max / 2) : it.max))}</div>
  <div class="body qbody">${Q.cover ? `<div class="cover"><img src="${face('thinking')}" alt=""><b style="font:400 30px var(--kid)">慢慢来</b><span>${name()}在帮你把题目再读一遍……</span></div>` : ''}${bar}${Q.walk ? vWalk() : Q.fin ? (it.segs || it.format === 'stat' ? qText() : '') + vQResult(g) : vStep()}</div>
  ${vDock()}${Q.menu ? vMenu() : ''}${Q.scratch ? '<div class="scratch"><canvas id="scratch"></canvas><div class="duo"><button class="btn alt" data-a="sclear">擦干净</button><button class="btn" data-a="scratch">关上</button></div></div>' : ''}${Q.catch ? vCatch() : ''}${Q.fire ? `<div class="toast fire"><img src="/pet/badge-${SKILLS.find(x => x.k === Q.fire.k).badge}.webp" alt="">${esc(Q.fire.text)}</div>` : ''}`
}
/** 草稿纸：随手写画，不保存、不判分 */
function initScratch() {
  const c = document.getElementById('scratch'); if (!c || c.dataset.on) return
  c.dataset.on = 1; c.width = c.clientWidth * 2; c.height = c.clientHeight * 2
  const g = c.getContext('2d'); g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1d3327'
  let down = false
  const at = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2] }
  c.addEventListener('pointerdown', e => { down = true; c.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...at(e)) })
  c.addEventListener('pointermove', e => { if (down) { g.lineTo(...at(e)); g.stroke() } })
  c.addEventListener('pointerup', () => { down = false })
}
const QA = {
  scratch() { Q.scratch = !Q.scratch },
  backto(v) {
    if (!Q || Q.fin || Q.catch || Q.walk || Q.i === 0) return
    let j = v === '' || v == null ? Q.i - 1 : Math.min(+v, Q.i - 1)
    Q.menu = null
    // 自动跳过的步骤（比如列出来就是一个数的递等式）回去会马上往前走，再往前退一步
    do { Q.i = j; enter() } while (Q.i > j && --j >= 0)
    sayPet('回到这一步，改好了再往下走。')
  },
  sclear() { const c = document.getElementById('scratch'); c?.getContext('2d').clearRect(0, 0, c.width, c.height) },
  read() { const it = curItem(), t = it.segs ? it.segs.map(x => x.t).join('') : it.text || ''; try { const u = new SpeechSynthesisUtterance(t.replace(/×/g, '乘').replace(/÷/g, '除以').replace(/−/g, '减')); u.lang = 'zh-CN'; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u) } catch { /* 不支持朗读 */ } },
  key(k) {
    if (page === 'login') { pin = k === '⌫' ? pin.slice(0, -1) : (pin + k).slice(0, adminMode ? 8 : 4); return }
    if (Q?.walk) { Q.walk.input = k === '⌫' ? Q.walk.input.slice(0, -1) : (Q.walk.input + k).slice(0, 5); Q.walk.bad = false; return }
    if (!Q || Q.cover || Q.fin || Q.catch) return
    const b = step(), edit = v => k === '⌫' ? v.slice(0, -1) : (v + k).slice(0, 5)
    if (b.type === 'blanks' || b.type === 'check' || (b.type === 'fill' && b.rem) || (b.type === 'say' && b.cells)) { Q.vals[Q.cur] = edit(Q.vals[Q.cur]); return }
    if (b.type === 'chain' && Q.op == null) { sayPet('先点你要先算的那个符号。'); return }
    if (b.type === 'column') { const key = Q.seq[Q.pos]; if (k === '⌫') { delete Q.cells[key]; return } Q.cells[key] = String(k); const nx = Q.seq.findIndex((x, i) => i > Q.pos && Q.cells[x] == null); Q.pos = nx >= 0 ? nx : Math.min(Q.pos + 1, Q.seq.length - 1); return }
    if (b.type === 'table') { Q.cells[Q.pos] = (k === '⌫' ? Q.cells[Q.pos].slice(0, -1) : (Q.cells[Q.pos] + k).slice(0, 3)); return }
    if (['fill', 'chain', 'say', 'tapnum'].includes(b.type)) Q.input = edit(Q.input)
  },
  submit() {
    if (page !== 'login') return
    const name = adminMode ? 'admin' : (document.getElementById('login-name')?.value || loginName).trim()
    if (!name) { loginErr = '先写上你的名字。'; return }
    return run(async () => {
      try {
        const r = await api('/login', { name, pin }); loginErr = ''
        if (r.admin) { await loadAdmin(); admMsg = '' } else { loginName = r.name; ls.set('kid-user', r.name); V = await api('/state'); page = 'home'; chat() }
      } catch (e) { loginErr = e.message }
      pin = ''
    })
  },
  adminmode() { adminMode = !adminMode; pin = ''; loginErr = '' },
  logout() { return run(async () => { await api('/logout', {}).catch(() => {}); V = null; Q = null; page = 'login'; loginName = ''; ls.set('kid-user', ''); ls.set('kid-pet', ''); ls.set('kid-draft', null); ls.set('kid-skip', null); pin = '' }) },
  admout() { return run(async () => { await api('/admin/logout', {}).catch(() => {}); ADM = null; adminMode = false; page = 'login' }) },
  admadd() { const name = document.getElementById('adm-name')?.value, p2 = document.getElementById('adm-pin')?.value; return run(async () => { try { const r = await api('/admin/users', { name, pin: p2 }); admMsg = `建好了：${r.user.name}`; await loadAdmin() } catch (e) { admMsg = e.message } }) },
  admedit(v) { const [id, k] = v.split(':'); admEdit = { id, k } },
  admcancel() { admEdit = null },
  admsave() { const v = document.getElementById('adm-v')?.value, e = admEdit; return run(async () => { try { const r = await api('/admin/users/' + e.id, { [e.k]: v }); admMsg = { pin: `「${r.user.name}」的密码改好了，告诉孩子新密码。`, name: `用户名改成了：${r.user.name}`, kid: `「${r.user.name}」里孩子的名字改好了。`, pet: `「${r.user.name}」的小狗改名了，小屋的名字也跟着变。` }[e.k]; admEdit = null; await loadAdmin() } catch (er) { admMsg = er.message } }) },
  admpack() {
    const f = document.getElementById('adm-pack')?.files?.[0]
    if (!f) { admMsg = '先选一个题库包文件。'; return }
    return run(async () => { try { const r = await api('/admin/pack', { pack: JSON.parse(await f.text()) }); admMsg = `导入好了：${r.week} 的题库，${r.items} 道题，按每天都来做够 ${r.days} 天。`; await loadAdmin() } catch (e) { admMsg = e instanceof SyntaxError ? '这个文件不是题库文件（打不开）。' : e.message } })
  },
  admlog() {
    const u = document.getElementById('adm-lu')?.value, w = document.getElementById('adm-lw')?.value, name = ADM.find(x => x.id === u)?.name || u
    return run(async () => { try {
      const d = await api(`/admin/log?user=${encodeURIComponent(u)}&week=${encodeURIComponent(w)}`)
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' })); a.download = `log-${w}-${u}.json`; document.body.append(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href) }, 1000)
      admMsg = `导出了「${name}」${w} 的答题记录（${d.log.length} 条，文件 log-${w}-${u}.json）。放进家长端的「孩子端题库」文件夹。`
    } catch (e) { admMsg = e.message } })
  },
  admoff(id) { const u = ADM.find(x => x.id === id); return run(async () => { try { await api('/admin/users/' + id, { off: !u.off }); admMsg = `「${u.name}」${u.off ? '启用' : '停用'}了。`; await loadAdmin() } catch (e) { admMsg = e.message } }) },
  stepgo() {
    if (!Q || Q.cover || Q.fin || Q.catch) return
    const b = step()
    if (b.type === 'fill' && b.rem) { if (Q.vals.some(v => v === '')) return sayPet('商和余数都要填。'); save({ vs: Q.vals.map(Number) }); return next() }
    if (b.type === 'fill') { if (!Q.input) return sayPet('还没填得数呢。'); save({ v: Number(Q.input) }); return next() }
    if (b.type === 'first') { save({ i: Q.pick }); return next() }
    if (b.type === 'clock') { save({ zone: Q.zone }); return next() }
    if (b.type === 'blanks') { const empty = Q.vals.filter(v => v === '').length; if (empty && V.tuning.blank_hint) return sayPet(`还有 ${empty} 个空没填，填完再交卷。`); save({ vals: Q.vals }); return next() }
    if (b.type === 'circle') {
      if (Q.rec[Q.i]?.cfb || Q.demo) { if (!Q.rec[Q.i]?.cfb) save({ sel: [...Q.sel] }); return next() }
      // 先让小狗点评一下圈得对不对，再去列式
      return run(async () => {
        const r = await api('/act', { kind: 'circle', item: Q.id, sel: [...Q.sel] })
        if (!r.circle) { save({ sel: [...Q.sel] }); return next() }
        save({ sel: r.circle.sel, cfb: r.circle }); Q.mood = r.circle.kw === 2 ? 'hop' : 'think'; sayPet(r.circle.kw === 2 ? (r.circle.missed.length ? '圈得不错！' : '圈得真准！') : r.circle.must?.length ? '有最要紧的没圈到，看看我标出来的地方。' : '看看我标出来的地方。'); sfx(r.circle.kw === 2 ? 'happy' : 'chirp')
      })
    }
    if (b.type === 'build') { const t = Q.expr.map(e => e.x); if (!validExpr(t)) return sayPet('算式还没写完整：数和符号要一个隔一个，括号要成对。'); save({ expr: t, chips: Q.expr.map(e => e.chip) }); return next() }
    if (b.type === 'chain') {
      if (!Q.input) return sayPet('还没填得数呢。')
      const L = Q.lines.at(-1), v = Number(Q.input); Object.assign(L, { k: Q.op, v }); Q.input = ''
      const nt = reduceAt(L.t, Q.op, v); Q.op = null; Q.fx.mark = false
      if (nt.length === 1) { save({ lines: Q.lines.map(x => ({ k: x.k, v: x.v })) }); return next() }
      Q.lines.push({ t: nt }); autoOp(); sayPet(Q.op != null ? '这一行只能先算这一个，直接算。' : '下一行，先点你要先算的符号。'); return
    }
    if (b.type === 'say' && b.cells) { if (Q.vals.some(v => v === '')) return sayPet('答句里还有空着的格子。'); save({ vs: Q.vals.map(Number), units: [...Q.units] }); return next() }
    if (b.type === 'say') { if (!Q.input) return sayPet('还没填得数呢。'); save({ v: Number(Q.input), unit: Q.unit }); return next() }
    if (b.type === 'table') { save({ cells: [...Q.cells] }); return next() }
    if (b.type === 'column') { save({ cells: { ...Q.cells } }); return next() }
    if (b.type === 'check') { save({ vs: Q.vals.map(v => v === '' ? null : Number(v)) }); return next() }
    if (b.type === 'tapnum') { if (!Q.input) return sayPet('还没填个数呢。'); save({ sel: [...Q.sel], v: Number(Q.input), unit: Q.unit }); return next() }
  },
  pick(i) { Q.pick = +i },
  pickgo(i) { if (Q.fin || Q.catch) return; save({ i: +i }); return next() },
  zone(z) { Q.zone = +z },
  blank(i) { Q.cur = +i },
  seg(i) { i = +i; if (greyed(i)) return; Q.sel.has(i) ? Q.sel.delete(i) : Q.sel.add(i) },
  chip(i) { i = +i; if (Q.expr.some(e => e.chip === i)) return; const x = chipVal(step(), i); if (!Number.isFinite(x)) return sayPet('这张卡要用上一步的得数，上一步还没填。点「上一步」回去填上。'); Q.expr.push({ x, chip: i }) },
  tcell(i) { Q.pos = +i },
  ccell(k) { Q.pos = Q.seq.indexOf(k) },
  op(o) { Q.expr.push({ x: o }) },
  del() { Q.expr.pop() },
  clr() { Q.expr = [] },
  tapop(k) { k = +k; const L = Q.lines.at(-1); if (Q.op === k) { Q.op = null; return } if (canTap(L.t, k)) Q.op = k },
  unit(u) { if (Q?.walk) { Q.walk.unit = u && Q.walk.unit !== u ? u : null; return } if (Q && !Q.fin && step().cells) { Q.units[Q.cur] = Q.units[Q.cur] === u ? null : u; return } if (Q && !Q.fin) Q.unit = u && Q.unit !== u ? u : null },
  walk() { Q.walk = { i: 0, input: '', unit: null, bad: false }; sayPet('一步一步来，我陪着你。') },
  walkgo() {
    const W = Q.walk, st = Q.fin.walk[W.i]
    if (!W.input) return sayPet('还没填呢。')
    if (Number(W.input) !== st.a) { W.bad = true; return sayPet('再算一算，看看上面的正确做法。') }
    if (st.unit && W.unit !== st.unit) { W.bad = true; return sayPet(W.unit ? '单位再想想。' : '得数对了，单位呢？') }
    Object.assign(W, { i: W.i + 1, input: '', unit: null, bad: false }); sayPet(W.i >= Q.fin.walk.length ? '做对啦！' : '对，下一步。')
  },
  menu(k) { if (Q.fin || Q.catch) return; Q.menu = Q.menu === k ? null : k },
  shut() { Q.menu = null },
  use(v) { const [k, L] = v.split(':'); return run(() => useSkill(k, +L)) },
  fix() { const c = Q.catch; Q.catch = null; Q.caught = c; Q.rec = Q.rec.slice(0, c.step + 1); Q.i = c.step; enter(); sayPet(`${c.n}接住了：${c.msg}。改好再交。`, 'skill'); Q.t0 = Date.now() },
  next() { const g = groups().find(x => x.id === Q.gid), it = nextItem(g); if (it) return startQ(g, it); Q = null; page = V.allDone ? 'result' : 'quests'; if (V.allDone) chat('after_practice') },
  group(id) { const g = groups().find(x => x.id === id), it = g && nextItem(g); if (it) startQ(g, it) },
  skip() {
    // 跳过：这题先放到这一组最后，做了一半的留着，回来接着做
    if (!Q || Q.demo || Q.fin || Q.catch) return
    const g = groups().find(x => x.id === Q.gid), left = g.items.filter(x => !x.done && x.id !== Q.id)
    if (!left.length) { showToast('这一组只剩这一题了。可以先去做别的组，待会儿再回来。'); Q = null; page = 'quests'; return }
    setSkip([...skips().filter(x => x !== Q.id), Q.id]); sfx('chirp')
    startQ(g, nextItem(g)); showToast('先跳过，待会儿再回来做这题。')
  },
}

function vResult() {
  const its = allItems(), first = its.filter(it => it.done?.ok && !it.done.caught).length, fix = its.filter(it => it.done?.ok && it.done.caught).length, again = its.filter(it => it.done && !it.done.ok).length
  return `<div class="top"><h1>今天完成啦</h1></div><div class="body">
    <div class="room"><div class="pet"><div class="a-hop"><span class="wear"><img src="${stage() ? `/pet/s${stage()}-act-wag.webp` : '/pet/s0.webp'}" alt=""></span></div></div></div><div class="sum"><i class="ico coin"></i>＋${its.reduce((a, it) => a + (it.done?.c || 0), 0)}</div>
    <div class="card rows"><span>第一次就答对</span><b>${first} 题</b>${fix ? `<span>本领接住后改对</span><b>${fix} 题</b>` : ''}<span>过两天换个样子再来</span><b>${again} 题</b><span>最长认真连击</span><b>${S().best} 题</b><span>已陪伴</span><b>${S().days} 天</b></div>
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
    <div class="duo"><div class="card shop"><h3>吃的</h3>${GOODS.filter(g => g.kind === 'food').map(bagRow).join('')}</div>
      <div class="card shop"><h3>洗澡和玩具</h3>${GOODS.filter(g => ['soap', 'toy'].includes(g.kind)).map(bagRow).join('')}</div></div>
    <div class="card"><div class="jar"><svg viewBox="0 0 56 64" aria-hidden="true"><rect x="8" y="10" width="40" height="50" rx="10" fill="#e6f2fb" stroke="#3b8fd6" stroke-width="2.5"/><rect x="10.5" y="${(12 + 46 * (1 - Math.min(1, s.jar / JAR.goal))).toFixed(1)}" width="35" height="${(46 * Math.min(1, s.jar / JAR.goal)).toFixed(1)}" rx="7" fill="#f6b84a"/><rect x="18" y="4" width="20" height="8" rx="3" fill="#3b8fd6"/></svg>
      <div><b>储蓄罐 · 毕业旅行基金</b><p class="dim">存满 ${JAR.goal.toLocaleString()}，毕业典礼那天和${name()}一起去旅行。</p>
      <div class="math">已经存了 ${s.jar}，还差 ${left}。${left ? `每次存 ${JAR.step}，还要存 ${left} ÷ ${JAR.step} = ${Math.ceil(left / JAR.step)} 次。` : '存满啦！'}</div></div></div>
      <div class="sig"><span>${JAR.sig} 枚可兑换 1 个签名</span><span>罐里 ${s.jar} ÷ ${JAR.sig} = <b>${Math.floor(s.jar / JAR.sig)}</b> 个</span></div>
      ${open ? `<button class="btn" data-a="jar" ${left && s.coins >= Math.min(JAR.step, left) ? '' : 'disabled'}>${left ? `存 ${Math.min(JAR.step, left)} 金币` : '存满啦'}</button>` : '<p class="dim">储蓄罐在毕业典礼上打开了。</p>'}</div>
    <div class="card shop tri3">${places}</div>
    <div class="duo"><div class="card shop"><h3>本月限定</h3>${monthly}</div>
      <div class="card shop"><h3>小屋</h3>${GOODS.filter(g => g.kind === 'keep' && !g.place && !g.month).map(g => row(g, COLORS.home, g.d)).join('')}</div></div>
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
  // 毕业礼堂：明亮的学校礼堂，红底黄字横幅、彩旗、气球、木地板舞台、台前一排花
  if (k === 'hall') s = sky('#e3f3ff', '#c4e4fb')
    + '<rect x="34" y="66" width="292" height="132" rx="14" fill="#ffffff" opacity=".75"/>'
    + [[70, 92], [120, 80], [240, 84], [292, 98], [180, 74]].map(([x, y], i) => `<polygon points="${x},${y - 7} ${x + 2},${y - 2} ${x + 7},${y - 2} ${x + 3},${y + 1} ${x + 5},${y + 6} ${x},${y + 3} ${x - 5},${y + 6} ${x - 3},${y + 1} ${x - 7},${y - 2} ${x - 2},${y - 2}" fill="${['#ffd766', '#f6a5c0', '#9ad7ff', '#ffd766', '#b6e3a1'][i]}"/>`).join('')
    + '<path d="M0 10 Q90 34 180 14 Q270 34 360 10" fill="none" stroke="#c99a52" stroke-width="1.5"/>'
    + Array.from({ length: 13 }, (_, i) => { const x = 8 + i * 27, y = 13 + Math.sin(i / 12 * Math.PI) * 12; return `<polygon points="${x},${y} ${x + 16},${y} ${x + 8},${y + 16}" fill="${['#e0322f', '#ffc928', '#3b8fd6', '#2f9e5b', '#f08a1c'][i % 5]}"/>` }).join('')
    + '<rect x="78" y="36" width="204" height="40" rx="5" fill="#d92b2b"/><rect x="82" y="40" width="196" height="32" rx="3" fill="none" stroke="#ffd766" stroke-width="1.5"/>'
    + '<text x="180" y="64" text-anchor="middle" font-size="24" fill="#ffe27a" font-family="ZCOOL KuaiLe, sans-serif" letter-spacing="6">毕业典礼</text>'
    + '<rect y="196" width="360" height="74" fill="#f0c78a"/>' + Array.from({ length: 8 }, (_, i) => `<line x1="${i * 48}" y1="196" x2="${i * 48 - 20}" y2="270" stroke="#dcae6c" stroke-width="2"/>`).join('') + '<rect y="192" width="360" height="8" fill="#c98f4f"/>'
    + [[22, 150], [338, 150]].map(([cx, cy], side) => [0, 1, 2, 3].map(j => { const x = cx + (side ? -1 : 1) * (j % 2) * 16, y = cy - j * 26; return `<line x1="${x}" y1="${y + 16}" x2="${cx}" y2="196" stroke="#8aa0b0" stroke-width="1"/><ellipse cx="${x}" cy="${y}" rx="12" ry="15" fill="${['#e0322f', '#ffc928', '#3b8fd6', '#2f9e5b'][(j + side) % 4]}"/><ellipse cx="${x - 4}" cy="${y - 5}" rx="3" ry="4" fill="#fff" opacity=".5"/>` }).join('')).join('')
    + Array.from({ length: 12 }, (_, i) => { const x = 14 + i * 30; return `<rect x="${x + 6}" y="238" width="3" height="20" fill="#3f9c5f"/><circle cx="${x + 7}" cy="234" r="8" fill="${['#ffc928', '#f6a5c0', '#f08a1c'][i % 3]}"/><circle cx="${x + 7}" cy="234" r="3" fill="#8a5a2b"/>` }).join('')
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
    return `<div class="sheet"><div class="morning"><div class="hello"><img src="${stage() ? `/pet/s${stage()}-act-wag.webp` : '/pet/s0.webp'}" alt=""><div><h2>${hello()}，${kid()}！</h2><p class="dim">${cnDate(D())} · 已陪伴 ${S().days} 天</p></div></div>
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
  if (sheet === 'learned' && learned) {
    const x = SKILLS.find(s => s.k === learned.k), L = learned.lv, d = L === 1 ? HELP1[x.k] : L === 2 ? HELP2[x.k] : `守着一道题：交卷时如果${GUARD[x.k]}，先拦下让你改`
    return `<div class="sheet"><div class="catch"><img class="big" src="/pet/badge-${x.badge}.webp" alt=""><h2>${x.n}学会第 ${L} 级！</h2>
      <p>${L} 级${LV[L]}：${esc(d)}。${L === 3 ? '每周 1 次，没用上会退回。' : `每天 ${L === 1 ? 3 : 1} 次。`}</p><p class="dim">做题时，陪伴条上的徽章亮着就能点。${L === 1 ? `小屋里也多了一个把戏。` : ''}</p>
      <button class="btn" data-a="tryit">试一试</button><button class="btn alt" data-a="close">以后再说</button></div></div>`
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
  if (page === 'admin' && ADM) { app.innerHTML = vAdmin(); return }
  // 小屋的名字跟着小狗的名字走（浏览器标签和登录页也是，这台设备记住上一次的）
  if (V?.state?.name && ls.get('kid-pet', '') !== V.state.name) ls.set('kid-pet', V.state.name)
  document.title = house(page === 'login' || !V ? ls.get('kid-pet', '') : V.state?.name)
  if (page === 'login' || !V) { app.innerHTML = vLogin(); return }
  const v = { home: vHome, quests: vQuests, q: vQ, result: vResult, skills: vSkills, shop: vShop, story: vStory, diary: vDiary, map: vMap, place: vPlace, book: vBook }[page]()
  app.innerHTML = v + (page === 'q' ? '' : `<div class="nav">${NAV.map(([k, n]) => `<button class="${page === k || NAV_OF[page] === k ? 'on' : ''}" data-a="go" data-v="${k}">${n}</button>`).join('')}</div>`)
    + vSheet() + vGrad()
    + (cere ? `<div class="cere" aria-hidden="true"><div class="stars">${[[-80, -40], [80, -40], [-60, 60], [65, 50], [0, -90]].map(([x, y]) => `<i style="--x:${x}px;--y:${y}px"></i>`).join('')}</div><span class="ava"><img src="${face('proud')}" alt=""></span><b>叮！「${cere}」技能点 ＋1</b><span>${name()}又离新本领近了一步</span></div>` : '')
    + (toast ? `<div class="toast" role="status">${esc(toast)}</div>` : '')
  if (page !== lastPage) { if (page === 'map') document.getElementById('now')?.scrollIntoView({ block: 'center' }); else if (page !== 'q') window.scrollTo(0, 0) }
  lastPage = page
  if (page === 'q' && Q && !Q.demo) { const all = drafts(); if (Q.fin) delete all[Q.id]; else all[Q.id] = { i: Q.i, rec: Q.rec }; ls.set('kid-draft', { date: V.date, all }) }
  if (Q?.scratch) initScratch()
  if (!pose) act = ''
  cere = null; if (Q) { Q.mood = ''; Q.fire = null }
}

const A = {
  ...QA,
  go(v) { if (v === 'home' && page !== 'home') chat(); if (['shop', 'place'].includes(v)) say = ''; page = v; Q = null; sheet = null },
  story(i) { sp = i === '' || i == null ? null : +i; page = 'story'; Q = null },
  extra() { return run(async () => { const r = await api('/act', { kind: 'extra' }); V = r.view; if (r.extra) page = 'quests'; else say = r.msg, page = 'home' }) },
  // 初次见面：先给小狗起名，再问孩子的名字
  petname(v) { const n = v ?? document.getElementById('nm-pet')?.value; return run(async () => { const r = await api('/act', { kind: 'name', name: n }); V = r.view; if (S().name) meetBack = false; else showToast(r.msg) }) },
  kidname() { const n = document.getElementById('nm-kid')?.value; return run(async () => { const r = await api('/act', { kind: 'kidname', name: n }); V = r.view; if (S().kid) meetHi = true; else showToast(r.msg) }) },
  meetback() { meetBack = true },
  meetdone() { meetHi = false; say = `${S().kid}，以后请多关照！`; strike('hop') },
  greet() { return run(async () => { const r = await api('/act', { kind: 'greet' }); V = r.view; say = r.msg; strike('hop'); sfx('chirp') }) },
  care(kind) { return run(async () => { const r = await api('/act', { kind }); V = r.view; say = r.msg; if (r.act) { strike(r.act); sfx({ food: 'eat', soap: 'bath', pat: 'chirp', toy: 'bounce' }[kind]) } }) },
  buy(k) { const c0 = S().coins; return run(async () => { const r = await api('/act', { kind: 'buy', k }); V = r.view; say = r.msg; sfx(S().coins < c0 ? 'coin' : 'no'); if (page !== 'shop') showToast(r.msg) }) },
  learn() { return run(async () => { const r = await api('/act', { kind: 'learn', k: sel }); V = r.view; say = r.msg; if (r.act) { learned = { k: sel, lv: S().skill[sel] }; sheet = 'learned'; sfx('win') } }) },
  tryit() { sheet = null; startDemo(learned.k) },
  sel(k) { sel = k },
  tap() { const t = Date.now(); taps = [...taps.filter(x => t - x < 3000), t]; const l = pick(LINES[taps.length >= 5 ? 'tap_too_much' : 'tap']); say = fact(l.t); strike(taps.length >= 5 ? 'spin' : pick(['hop', l.act])); sfx(taps.length >= 5 ? 'spin' : 'chirp') },   // 点小狗只让它跳一跳、转一转，不换动作图，配饰一直戴着
  sheet(v) { sheet = v },
  sound() { ls.set('kid-sound', !ls.get('kid-sound', true)); sfx('chirp') },
  close() { sheet = null; card = null },
  event() { return run(async () => { const r = await api('/act', { kind: 'event' }); V = r.view; say = r.msg; strike('hop'); sfx('chirp') }) },
  ball() { sheet = null; return A.care('toy') },
  hidestart() { return run(async () => { const r = await api('/act', { kind: 'hide' }); V = r.view; if (V.hide) sheet = 'hide'; else showToast(r.msg) }) },
  hard() { return run(async () => { const r = await api('/act', { kind: 'hide', hard: !V.hide.hard }); V = r.view }) },
  cup(i) { return run(async () => { const r = await api('/act', { kind: 'cup', i: +i }); V = r.view; if (V.hide?.win) { say = r.msg; strike('hop'); sfx('win') } else sfx('no') }) },
  trick(k) { const t = TRICKS.find(x => x.k === k); sheet = null; say = fact(t.say); strike(t.pose || t.anim, t.pose ? t.anim || '' : ''); sfx('trick') },
  place(k) { if (k === 'home') return A.go('home'); place = k; page = 'place'; say = '' },
  nope() { showToast('还没开放，看看卡片上还差什么。') },
  trip() { return run(async () => { const r = await api('/act', { kind: 'trip', k: place }); V = r.view; say = r.msg; strike(r.anim || 'hop'); sfx(r.card ? 'win' : 'bounce'); if (r.card) { card = r.card; sheet = 'card' } }) },
  jar() { return run(async () => { const r = await api('/act', { kind: 'jar' }); V = r.view; say = r.msg }) },
  ceremony() { return run(async () => { const r = await api('/act', { kind: 'ceremony' }); V = r.view; if (S().graduated && S().grad === D()) { grad = 1; sfx('win') } else showToast(r.msg) }) },
  gradnext() { grad = grad >= 2 ? 0 : grad + 1; if (!grad) { page = 'home'; say = `${S().kid || '小朋友'}，寒假也要一起玩哦！`; strike('hop') } },
}
const onAct = e => {
  const t = e.target.closest('[data-a]')
  if (!t || t.disabled || (Q?.cover && page === 'q' && t.dataset.a !== 'go')) return
  if (t.classList.contains('sheet') && e.target !== t) return        // 点弹层里面不关
  const r = A[t.dataset.a]?.(t.dataset.v)
  if (!(r instanceof Promise)) render()
}
document.addEventListener('click', onAct)
document.addEventListener('input', e => { if (e.target.id === 'login-name') loginName = e.target.value })
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.seg[data-a],.room[data-a]')) { e.preventDefault(); onAct(e) }
  if (e.key === 'Enter' && e.target.id === 'nm-pet') A.petname()
  if (e.key === 'Enter' && e.target.id === 'nm-kid') A.kidname()
})
setInterval(() => { if (V && page === 'home' && !busy && !sheet && !pose && !meetStep() && !V.morning && S().name) { chat(); render() } }, 12000)

;(async () => {
  try { V = await api('/state'); page = 'home'; if (S().name) chat() } catch (e) {
    if (page !== 'login') { app.innerHTML = `<p class="boot">${esc(e.message)}</p>`; return }
    try { await loadAdmin() } catch { page = 'login' }   // 管理员登录过，直接进账号管理
  }
  render()
})()
