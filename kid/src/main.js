// 孩子端页面：小屋、今日任务、三种题型、本领、小卖部。答案和金币都在后端（kid/server/game.js），这里只负责显示和把操作发过去。
import './style.css'
import { SKILLS, SKILL_COST, GOODS, STORY_PAGES, levelOf } from '../../shared/contract.js'
import { LINES } from './lines.js'
import { STORY } from './story.js'

const app = document.getElementById('app')
let V = null, page = 'home', Q = null, say = '', act = '', pose = '', poseTimer = 0, sel = '审题', pin = '', loginErr = '', busy = false, taps = [], cere = null
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* 隐私模式下不保存 */ } } }
let sp = null          // 故事书里正在看的那一页
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
    ${s.hatched ? `<button class="card quest" data-a="story" data-v=""><b>故事书</b><span class="pill">${s.story} / ${STORY_PAGES} 页</span><span class="dim">周五闯关通关一次，解锁一页</span></button>` : ''}
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
    const b = d.boss
    body = `<div class="card q">${it.format === 'word' ? segText(it, 'fixed') : esc(it.format === 'first' ? it.tokens.join(' ') : it.text || '这一组小题')}</div>
      <div class="fb ${d.ok ? '' : 'zero'}">${d.ok ? `<span class="fly">＋${d.c}</span><b class="c"><i class="ico coin"></i>＋${d.c}</b>${d.w === 0 ? '第一次就答对了！' : '订正对了，拿到一部分金币。'}${d.bonus ? ' 连续 5 题第一次就对，再加 5。' : ''}${d.patrol ? ' 今天没有急着答错的题，得到 1 个「巡逻」技能点。' : ''}` : `<b>这道题先放一放</b><br>${esc(d.explain)}<br>过两天它会换个样子再来。`}</div>
      ${d.w && d.ok ? `<div class="bubble plain">${esc(d.explain)}</div>` : ''}
      ${b ? `<div class="bubble plain">${b.pass ? `闯关成功！${b.n} 题答对 ${b.okN} 题，再得 ${b.coins} 金币${b.story ? `，解锁了故事书第 ${b.story} 页` : ''}。` : `闯关 ${b.n} 题答对 ${b.okN} 题，差一点。下周五再来。`}</div>` : ''}
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
function clock(it) {
  const p = (a, r) => [100 + r * Math.sin(a * Math.PI / 180), 100 - r * Math.cos(a * Math.PI / 180)]
  const nums = Array.from({ length: 12 }, (_, i) => { const [x, y] = p((i + 1) * 30, 62); return `<text x="${x}" y="${y}">${i + 1}</text>` }).join('')
  const dots = Array.from({ length: 24 }, (_, z) => { const [x, y] = p(z * 15, 85); return `<circle class="dot ${Q.zone === z ? 'on' : ''}" cx="${x}" cy="${y}" r="${z % 2 ? 6.5 : 9}" data-a="zone" data-v="${z}"/>` }).join('')
  const [mx, my] = p(it.minute === 30 ? 180 : 0, 58), hand = Q.zone == null ? '' : (([x, y]) => `<line class="hh" x1="100" y1="100" x2="${x}" y2="${y}"/>`)(p(Q.zone * 15, 38))
  return `<svg class="clock" viewBox="0 0 200 200"><circle class="face" cx="100" cy="100" r="97"/>${nums}${dots}<line class="mh" x1="100" y1="100" x2="${mx}" y2="${my}"/>${hand}<circle cx="100" cy="100" r="4"/></svg>`
}
function vStory() {
  const n = S().story, fill = t => esc(t).replace('{name}', name())
  if (sp != null && sp < n) {
    const pg = STORY[sp], st = sp === 0 ? 0 : sp < 4 ? 1 : sp < 8 ? 2 : sp < 12 ? 3 : 4
    return `<div class="top"><button class="back" data-a="story" data-v="" aria-label="回到目录">‹</button><h1>第 ${sp + 1} 页</h1></div><div class="body">
      <div class="room"><div class="pet"><img class="breathe" src="/pet/s${st}.webp" alt=""></div></div>
      <div class="card story"><h2>${esc(pg.title)}</h2><p>${fill(pg.text)}</p></div>
      ${sp + 1 < n ? `<button class="btn" data-a="story" data-v="${sp + 1}">下一页</button>` : `<button class="btn" data-a="go" data-v="home">回小屋</button>`}</div>`
  }
  return `<div class="top"><h1>故事书</h1><span class="pill">${n} / ${STORY_PAGES} 页</span></div><div class="body">
    ${n ? '' : `<div class="bubble plain">故事书还是空的。每个周五闯关成功，就会多出一页${name()}的故事。</div>`}
    ${STORY.map((pg, i) => `<button class="card quest ${i < n ? '' : 'lock'}" ${i < n ? '' : 'disabled'} data-a="story" data-v="${i}"><b>${i < n ? esc(pg.title) : '还没解锁'}</b><span class="dim">第 ${i + 1} 页</span></button>`).join('')}</div>`
}
const NAV = [['home', '小屋'], ['quests', '任务'], ['skills', '本领'], ['shop', '小卖部']]
function render() {
  if (page === 'login' || !V) { app.innerHTML = vLogin(); return }
  const v = { home: vHome, quests: vQuests, q: vQ, result: vResult, skills: vSkills, shop: vShop, story: vStory }[page]()
  app.innerHTML = v + (page === 'q' ? '' : `<div class="nav">${NAV.map(([k, n]) => `<button class="${page === k || (k === 'home' && ['result', 'story'].includes(page)) ? 'on' : ''}" data-a="go" data-v="${k}">${n}</button>`).join('')}</div>`)
    + (cere ? `<div class="cere" aria-hidden="true"><div class="stars">${[[-80, -40], [80, -40], [-60, 60], [65, 50], [0, -90]].map(([x, y]) => `<i style="--x:${x}px;--y:${y}px"></i>`).join('')}</div><span class="ava"><img src="${face('proud')}" alt=""></span><b>叮！「${cere}」技能点 ＋1</b><span>${name()}又离新本领近了一步</span></div>` : '')
  act = ''; cere = null; if (Q) Q.mood = ''
}

// ---------- 做题 ----------
const curItem = () => groups().find(x => x.id === Q.gid).items.find(x => x.id === Q.id)
function startQ(g, it) {
  // 刷新后接着做：服务器记着每道题做到第几步（it.step、it.p）
  Q = { gid: g.id, id: it.id, step: it.format === 'word' && it.step === 1 ? 2 : it.step, kw: it.kw, expr: it.expr, sel: new Set(it.kw?.sel || []), input: '', unit: null, msg: '', flash: false, fin: null, cover: false, mood: '', t0: Date.now(), order: (it.choices || []).map((_, i) => i),
    zone: null, range: it.p?.range, spot: it.p?.spot, vals: it.format === 'multi' ? (it.p?.vals || it.blanks.map(() => '')) : (it.p?.vals || []), okIdx: it.p?.ok || [], cur: 0 }
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
  go(v) { if (v === 'home' && page !== 'home') chat(); if (v === 'shop') say = ''; page = v; Q = null },
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
    return run(() => send(it.format === 'word' ? { step: 'answer', value: Q.input, unit: Q.unit } : { value: Q.input }))
  },
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
