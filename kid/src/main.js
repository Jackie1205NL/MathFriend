// 孩子端页面：小屋、今日任务、三种题型、本领、小卖部。答案和金币都在后端（kid/server/game.js），这里只负责显示和把操作发过去。
import './style.css'
import { SKILLS, SKILL_COST, GOODS, levelOf } from '../../shared/contract.js'
import { LINES } from './lines.js'

const app = document.getElementById('app')
let V = null, page = 'home', Q = null, say = '', act = '', pose = '', poseTimer = 0, sel = '审题', pin = '', loginErr = '', busy = false, taps = [], cere = null
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* 隐私模式下不保存 */ } } }
let slow = ls.get('kid-slow', 0)
const POSES = ['eat', 'bath', 'catch', 'shake', 'wag', 'sleep']
const ACT = { blink: 'squish', look: 'look', yawn: 'squish', stretch: 'stretch', hop: 'hop', spin: 'spin', sniff: 'look', wave: 'hop', think: 'think', giggle: 'giggle', sleepy: 'squish' }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const pick = a => a[Math.floor(Math.random() * a.length)]

async function api(path, body) {
  const r = await fetch('/api/kid' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  const d = await r.json().catch(() => ({ error: '网络不太好，再试一次。' }))
  if (r.status === 401 && path !== '/login') { V = null; page = 'login' }
  if (!r.ok) throw new Error(d.error || '出错了，再试一次。')
  return d
}
async function run(fn) {
  if (busy) return
  busy = true
  try { await fn() } catch (e) { if (page === 'q' && Q) Q.msg = e.message; else say = e.message }
  busy = false; render()
}

// ---------- 小狗 ----------
const S = () => V.state
const stage = () => S().stage
const name = () => esc(S().name || '小狗')
const late = () => { const d = new Date(), [h, m] = String(V?.tuning?.bedtime || '20:30').split(':').map(Number); return d.getHours() * 60 + d.getMinutes() >= h * 60 + m }
const petSrc = () => { const st = stage(), p = late() ? 'sleep' : pose; return st && p ? `/pet/s${st}-act-${p}.webp` : `/pet/s${st}.webp` }
const face = k => stage() ? `/pet/s${stage()}-face-${k}.webp` : '/pet/s0.webp'
function chat(kind) {
  const n = S().needs
  let pool
  if (kind) pool = LINES[kind]
  else if (late()) pool = LINES.time_late
  else {
    const need = [['state_hungry', n.full], ['state_bored', n.mood], ['state_dirty', n.clean]].filter(([, v]) => v < 40), r = Math.random()
    pool = need.length && r < .5 ? LINES[pick(need)[0]] : V.allDone && r < .65 ? LINES.after_practice : r < .8 ? LINES.idle : r < .92 ? LINES.math : LINES[new Date().getHours() < 11 ? 'time_morning' : 'time_evening']
  }
  const l = pick(pool || LINES.idle)
  say = l.t.replace('{circled}', ls.get('kid-circled', 0)).replace('{best}', S().best); act = l.act
}
function strike(p) { if (!POSES.includes(p)) { act = p; return } pose = p; clearTimeout(poseTimer); poseTimer = setTimeout(() => { pose = ''; render() }, 2400) }

// ---------- 画面 ----------
const coin = n => `<span class="pill"><i class="ico coin"></i>${n}</span>`
const stars = () => Object.values(S().pts).reduce((a, b) => a + b, 0)
const bar = (n, v, cls) => `<span>${n}</span><span class="bar ${cls} ${v < 40 ? 'low' : ''}"><i style="width:${v}%"></i></span><span>${Math.round(v)}</span>`
const groups = () => V.today || []
const allItems = () => groups().flatMap(g => g.items)
const doneCount = () => allItems().filter(it => it.done).length

function vLogin() {
  return `<div class="top"><h1>团团小屋</h1></div><div class="body">
    <div class="room"><div class="pet"><img class="breathe" src="/pet/s1.webp" alt=""></div></div>
    <div class="card"><p>输入口令，进小屋找小狗玩。</p><div class="pin">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>${loginErr ? `<p class="dim" style="color:var(--berry);text-align:center">${loginErr}</p>` : ''}</div>
    ${pad(null, '进去')}</div>`
}
function vHome() {
  const s = S(), n = s.needs, st = stage(), bag = kind => GOODS.filter(g => g.kind === kind).reduce((a, g) => a + (s.bag[g.k] || 0), 0)
  const toy = Object.values(s.toy).reduce((a, b) => a + b, 0), pats = s.pats.date === new Date().toLocaleDateString('en-CA') ? s.pats.n : 0
  const canLearn = SKILLS.filter(x => s.skill[x.k] < 3 && s.pts[x.k] >= SKILL_COST[s.skill[x.k]]).length
  const cta = !V.week ? `<button class="btn" disabled>还没有任务<small>等爸爸妈妈发这周的题</small></button>`
    : late() ? `<button class="btn" disabled>${name()}睡觉了<small>明天见</small></button>`
    : V.allDone ? `<button class="btn" data-a="go" data-v="result">今天完成啦<small>看看今天的成绩</small></button>`
    : `<button class="btn" data-a="go" data-v="quests">今日任务 ${doneCount()} / ${allItems().length}<small>最多可赚 ${allItems().reduce((a, it) => a + it.max, 0)}${canLearn ? ` · 有 ${canLearn} 个本领可以学` : ''}</small></button>`
  return `<div class="top"><h1>${s.name ? name() + '的小屋' : '团团小屋'}</h1>${coin(s.coins)}<span class="pill"><i class="ico star"></i>${stars()}</span></div>
  <div class="body">
    ${!s.name ? `<div class="card"><p>小窝里有一只小柴犬，给它起个名字吧。</p><div class="field"><input id="nm" maxlength="8" placeholder="比如：团团" aria-label="小狗的名字"><button class="btn" data-a="name">就叫它</button></div></div>` : `<div class="bubble">${esc(say) || (st ? '' : '它还在小窝里睡觉。做完第一道题，它就会醒来。')}</div>`}
    <div class="room" data-a="tap" role="button" aria-label="戳一戳小狗">${s.own.curtain ? '<img class="deco" src="/pet/item-curtain.webp" alt="">' : ''}<div class="pet"><div class="${act ? 'a-' + (ACT[act] || 'hop') : ''}"><img class="breathe" src="${petSrc()}" alt=""></div></div><span class="tag">${s.good ? '状态好 · 成长 ×1.2' : '状态一般'}${s.own.scarf ? ' · 戴着蓝围巾' : ''}</span></div>
    <div class="card bars">${bar('饱食', n.full, '')}${bar('心情', n.mood, 'b')}${bar('清洁', n.clean, 'c')}<span>成长</span><span class="bar s"><i style="width:${s.grow % 400 / 4}%"></i></span><span>Lv ${levelOf(s.grow)}</span></div>
    <div class="acts"><button data-a="care" data-v="food">喂食<small>${bag('food')} 份</small></button><button data-a="care" data-v="soap">洗澡<small>${bag('soap')} 块香皂</small></button><button data-a="care" data-v="toy">陪玩<small>${toy} 次</small></button><button data-a="care" data-v="pat">摸摸<small>今天 ${Math.max(0, 3 - pats)} 次</small></button></div>
    ${cta}
  </div>`
}
function vQuests() {
  const gs = groups(), open = gs.filter(g => !g.boss).every(g => g.items.every(it => it.done))
  return `<div class="top"><h1>今天的任务</h1>${coin(S().coins)}</div><div class="body">${gs.map(g => {
    const left = g.items.filter(it => !it.done).length, mx = Math.max(...g.items.map(it => it.max)), lock = g.boss && !open
    const tag = g.bucket === '本周重点' && !g.boss ? '<span class="tagx">本周重点</span>' : g.bucket === '往周未过关' ? '<span class="tagx old">以前的</span>' : ''
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
    body = `<div class="card q">${it.format === 'word' ? segText(it, 'fixed') : esc(it.format === 'first' ? it.tokens.join(' ') : it.text)}</div>
      <div class="fb ${d.ok ? '' : 'zero'}">${d.ok ? `<span class="fly">＋${d.c}</span><b class="c"><i class="ico coin"></i>＋${d.c}</b>${d.w === 0 ? '第一次就答对了！' : '订正对了，拿到一部分金币。'}${d.bonus ? ' 连续 5 题第一次就对，再加 5。' : ''}${d.patrol ? ' 今天没有急着答错的题，得到 1 个「巡逻」技能点。' : ''}` : `<b>这道题先放一放</b><br>${esc(d.explain)}<br>过两天它会换个样子再来。`}</div>
      ${d.w && d.ok ? `<div class="bubble plain">${esc(d.explain)}</div>` : ''}
      <button class="btn" data-a="next">${more ? '下一题' : V.allDone ? '看今天的成绩' : '回到任务'}</button>`
  } else if (it.format === 'oral') body = `<div class="card q big">${esc(it.text)} ＝ <span class="box">${Q.input}</span></div>${msg}${pad()}`
  else if (it.format === 'first') body = `<p class="dim">点一下先算的那个符号。</p><div class="card q big">${it.tokens.map((t, i) => /^[+−×÷]$/.test(t) ? `<button class="tok" data-a="tok" data-v="${i}">${t}</button>` : `<span>${esc(t)}</span>`).join(' ')}</div>${msg}`
  else {
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
    <div class="room"><div class="pet"><div class="a-hop"><img src="${stage() ? `/pet/s${stage()}-act-wag.webp` : '/pet/s0.webp'}" alt=""></div></div></div><div class="sum"><i class="ico coin"></i>＋${its.reduce((a, it) => a + (it.done?.c || 0), 0)}</div>
    <div class="card rows"><span>第一次就答对</span><b>${first} 题</b><span>订正后答对</span><b>${fix} 题</b><span>过两天换个样子再来</span><b>${again} 题</b><span>最长认真连击</span><b>${S().best} 题</b></div>
    <button class="btn" data-a="go" data-v="home">回小屋</button></div>`
}
function vSkills() {
  const s = S(), k = SKILLS.find(x => x.k === sel), lv = s.skill[sel], cost = SKILL_COST[lv], have = s.pts[sel]
  return `<div class="top"><h1>本领</h1><span class="pill"><i class="ico star"></i>${stars()}</span></div><div class="body">
    <div class="skills">${SKILLS.map(x => `<button class="skill ${x.k === sel ? 'sel' : ''}" data-a="sel" data-v="${x.k}"><img src="/pet/badge-${x.badge}.webp" alt=""><b>${x.n}</b><small>${x.s} · ${s.pts[x.k]} 点</small><span class="dots">${[0, 1, 2].map(i => `<i class="${i < s.skill[x.k] ? 'f' : ''}"></i>`).join('')}</span></button>`).join('')}</div>
    <div class="card"><b>${k.n} · ${lv ? `第 ${lv} 级` : '还没学会'}</b><p style="margin:4px 0">${k.d}</p>
      ${sel === '漏题' ? '' : `<div class="bars"><span>下一个技能点</span><span class="bar s"><i style="width:${s.prog[sel] * 20}%"></i></span><span>${s.prog[sel]} / 5</span></div>`}
      <p class="dim" style="margin-top:6px">${lv >= 3 ? '已经学满了。' : `学第 ${lv + 1} 级要 ${cost} 个「${k.s}」技能点，现在有 ${have} 个。`}${sel === '漏题' ? '' : '换了样子的题第一次就做对，每 5 道得 1 点。'}</p></div>
    <button class="btn" data-a="learn" ${lv < 3 && have >= cost ? '' : 'disabled'}>${lv >= 3 ? '学满了' : have >= cost ? `教${name()}学「${k.n}」第 ${lv + 1} 级` : `还差 ${cost - have} 个技能点`}</button></div>`
}
function vShop() {
  const s = S()
  const row = x => `<img src="/pet/item-${x.k}.webp" alt=""><b>${x.n}<small>${x.d}${x.kind === 'keep' ? '' : ` · 背包里 ${x.kind === 'toy' ? (s.toy[x.k] || 0) + ' 次' : (s.bag[x.k] || 0) + ' 份'}`}</small></b>${s.own[x.k] ? '<span class="dim">已拥有</span>' : `<button class="buy" data-a="buy" data-v="${x.k}"><i class="ico coin"></i>${x.p}</button>`}`
  const sec = (t, kinds) => `<div class="card shop"><h3>${t}</h3>${GOODS.filter(g => kinds.includes(g.kind)).map(row).join('')}</div>`
  return `<div class="top"><h1>小卖部</h1>${coin(s.coins)}</div><div class="body">${say ? `<div class="bubble plain">${esc(say)}</div>` : ''}${sec('吃的', ['food'])}${sec('洗澡和玩具', ['soap', 'toy'])}${sec('装扮和家具', ['keep'])}</div>`
}
const NAV = [['home', '小屋'], ['quests', '任务'], ['skills', '本领'], ['shop', '小卖部']]
function render() {
  if (page === 'login' || !V) { app.innerHTML = vLogin(); return }
  const v = { home: vHome, quests: vQuests, q: vQ, result: vResult, skills: vSkills, shop: vShop }[page]()
  app.innerHTML = v + (page === 'q' ? '' : `<div class="nav">${NAV.map(([k, n]) => `<button class="${page === k || (k === 'home' && page === 'result') ? 'on' : ''}" data-a="go" data-v="${k}">${n}</button>`).join('')}</div>`)
    + (cere ? `<div class="cere" aria-hidden="true"><div class="stars">${[[-80, -40], [80, -40], [-60, 60], [65, 50], [0, -90]].map(([x, y]) => `<i style="--x:${x}px;--y:${y}px"></i>`).join('')}</div><span class="ava"><img src="${face('proud')}" alt=""></span><b>叮！「${cere}」技能点 ＋1</b><span>${name()}又离新本领近了一步</span></div>` : '')
  act = ''; cere = null; if (Q) Q.mood = ''
}

// ---------- 做题 ----------
function startQ(g, it) {
  Q = { gid: g.id, id: it.id, step: it.step === 1 ? 2 : it.step, kw: it.kw, expr: it.expr, sel: new Set(it.kw?.sel || []), input: '', unit: null, msg: '', flash: false, fin: null, cover: false, mood: '', t0: Date.now(), order: (it.choices || []).map((_, i) => i) }
  if (it.step === 1 && it.kw) Q.step = 2
  if (slow > 0) {
    Q.cover = true
    setTimeout(() => { if (Q?.id === it.id) { Q.cover = false; Q.t0 = Date.now(); slow--; ls.set('kid-slow', slow); render() } }, 3000)
  }
  page = 'q'
}
async function send(payload) {
  const res = await api('/answer', { item: Q.id, ms: Date.now() - Q.t0, ...payload })
  V = res.view
  if (res.fin) { Q.fin = res.fin; Q.msg = ''; Q.mood = res.fin.ok ? 'hop' : 'think'; if (res.fin.point) cere = res.fin.point; return }
  if (res.ok) return res
  Q.flash = !!res.flash; Q.mood = 'think'
  if (res.flash) { slow = 3; ls.set('kid-slow', slow) }
  Q.msg = (res.flash ? '太快啦，还没看清题。接下来几题我们慢慢来。<br>' : '') + esc(res.msg)
  if (!res.keepInput) Q.input = ''
  Q.order.sort(() => Math.random() - .5)
  Q.t0 = Date.now()
}
const A = {
  go(v) { if (v === 'home' && page !== 'home') chat(); if (v === 'shop') say = ''; page = v; Q = null },
  key(k) {
    if (page === 'login') { pin = k === '⌫' ? pin.slice(0, -1) : (pin + k).slice(0, 8); return }
    if (!Q || Q.cover || Q.fin) return
    Q.input = k === '⌫' ? Q.input.slice(0, -1) : (Q.input + k).slice(0, 5)
  },
  submit() {
    if (page === 'login') return run(async () => { try { await api('/login', { pin }); loginErr = ''; V = await api('/state'); page = 'home'; chat() } catch (e) { loginErr = e.message } pin = '' })
    if (!Q || Q.cover || Q.fin) return
    if (!Q.input) { Q.msg = '还没填得数呢。'; return }
    const g = groups().find(x => x.id === Q.gid), it = g.items.find(x => x.id === Q.id)
    return run(() => send(it.format === 'word' ? { step: 'answer', value: Q.input, unit: Q.unit } : { value: Q.input }))
  },
  tok(i) { return run(() => send({ index: +i })) },
  seg(i) { i = +i; Q.sel.has(i) ? Q.sel.delete(i) : Q.sel.add(i) },
  circled() { return run(async () => { const res = await send({ step: 'keywords', sel: [...Q.sel] }); if (res) { Q.kw = res; Q.step = 1; Q.mood = res.kw === 2 ? 'hop' : 'think'; ls.set('kid-circled', ls.get('kid-circled', 0) + 1) } }) },
  kwok() { Q.step = 2; Q.t0 = Date.now() },
  choice(i) { return run(async () => { const res = await send({ step: 'choice', index: +i }); if (res) { Q.step = 3; Q.expr = res.expr; Q.msg = ''; Q.t0 = Date.now() } }) },
  unit(u) { if (Q && !Q.fin) Q.unit = u || null },
  next() { const g = groups().find(x => x.id === Q.gid), it = g.items.find(x => !x.done); if (it) return startQ(g, it); Q = null; page = V.allDone ? 'result' : 'quests'; if (V.allDone) chat('after_practice') },
  group(id) { const g = groups().find(x => x.id === id), it = g?.items.find(x => !x.done); if (it) startQ(g, it) },
  name() { const v = document.getElementById('nm')?.value; return run(async () => { const r = await api('/act', { kind: 'name', name: v }); V = r.view; say = r.msg; strike('hop') }) },
  care(kind) { return run(async () => { const r = await api('/act', { kind }); V = r.view; say = r.msg; if (r.act) strike(r.act) }) },
  buy(k) { return run(async () => { const r = await api('/act', { kind: 'buy', k }); V = r.view; say = r.msg }) },
  learn() { return run(async () => { const r = await api('/act', { kind: 'learn', k: sel }); V = r.view; say = r.msg; page = 'home'; strike(r.act || 'hop') }) },
  sel(k) { sel = k },
  tap() { const now = Date.now(); taps = [...taps.filter(t => now - t < 3000), now]; const l = pick(LINES[taps.length >= 5 ? 'tap_too_much' : 'tap']); say = l.t; strike(taps.length >= 5 ? 'spin' : pick(['wag', l.act])) },
}
const onAct = e => {
  const t = e.target.closest('[data-a]')
  if (!t || t.disabled || (Q?.cover && page === 'q' && t.dataset.a !== 'go')) return
  const r = A[t.dataset.a]?.(t.dataset.v)
  if (!(r instanceof Promise)) render()
}
document.addEventListener('click', onAct)
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.seg[data-a],.room[data-a]')) { e.preventDefault(); onAct(e) }
  if (e.key === 'Enter' && e.target.id === 'nm') A.name()
})
setInterval(() => { if (V && page === 'home' && !busy && S().name) { chat(); render() } }, 12000)

;(async () => {
  try { V = await api('/state'); page = 'home'; if (S().name) chat() } catch (e) { if (page !== 'login') { app.innerHTML = `<p class="boot">${esc(e.message)}</p>`; return } }
  render()
})()
