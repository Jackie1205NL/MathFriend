// 家长端 ↔ 孩子端：题库模板入库、生成题库包、推送到孩子端、取回答题记录。
//   npm run kid bank 2026-W40 <模板 json>   校验模板，逐题验算，自动带上往周的模板，写进 错题/周.md 的「题库」段
//   npm run kid tune 2026-W40 键=值 …        改本周的调节项（见 rules.md 第 9 节），改完要再 push
//   npm run kid pack 2026-W40 [输出文件]     只生成题库包，不推送；写成文件可以到孩子端管理员页面上传
//   npm run kid push 2026-W40               生成题库包并推送到孩子端（Netlify）；按每天都来做不够 14 天的不推
//   npm run kid pull 2026-W40               取回该周答题记录，按「知识点 × 错因」汇总写进周 md 的「答题」段；不写周就取上次推送的那一周
//   npm run kid check                       看孩子端连不连得上（/weekly 自动推题库前先跑）
//   npm run kid link <孩子端网址> <同步令牌>  保存地址和令牌（存在应用数据目录，不进项目文件夹）
//   KID_URL=<dev 网址> npm run kid demo    把 rules.md 的示例模板拼成体验题库，推到 dev 分支部署试玩（不需要错题数据）
//   npm run kid demo 2026-W40 demo.json    体验题库写成文件，到 dev 站管理员页面上传（站点开了 Netlify 登录保护、命令行推不上去时）
//   KID_URL=<dev 网址> npm run kid clock 2027-01-22   拨 dev 站的日期（看长大、毕业），不写日期拨回今天
//   KID_URL=… / KID_TOKEN=…                任何命令前加上，临时换推送地址和令牌，不改保存的设置
//   KID_USER=用户名 npm run kid pull <周>  取某个孩子账号的答题记录（不写就是第一个孩子账号）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readWeek, writeWeek, listWeeks, loadSettings, saveSettings, computeProgress, readKnowledge } from './store.js'
import { verifyItem } from './sheet.js'
import { buildPack, packDays, LEVELS, PACK_DAYS } from '../shared/contract.js'

/** 生成题库包；正确答案再用辅导单那套 verifyItem 验一遍，验不过的题丢掉。 */
export function makePack(week) {
  const bank = readWeek(week).bank
  if (!bank?.templates?.length) throw new Error(`错题/${week}.md 里还没有「题库」，先运行 npm run kid bank`)
  const { pack, report } = buildPack(bank, week)
  // 钟面、多空题、统计表、整理数据、竖式、分步题、有余数的题没有单一的整除算式，实例化时已经逐题检查过
  const okExpr = it => (['word', 'plan'].includes(it.format) ? it.choices.find(c => c.ok).t : it.format === 'first' ? it.tokens.join('') : it.text).replace(/−/g, '-')
  const before = pack.items.length
  pack.items = pack.items.filter(it => ['clock', 'multi', 'stat', 'data', 'column', 'multistep'].includes(it.format) || it.rem != null || it.remDiv || verifyItem({ expression: okExpr(it), answer: it.answer }))
  return { pack, report, dropped: before - pack.items.length }
}

/**
 * 最近 4 周纸面错题里，题库（本周新写的 + 自动带入的）没覆盖到的「知识点 × 错因」；「已改善」的不算。
 * 家长只在周末同步，两次同步之间孩子做的就是这一份，要尽量覆盖最近所有错过的地方。
 */
export function uncovered(week, bank) {
  const weeks = listWeeks().filter(w => w <= week), have = new Set(bank.templates.map(t => `${t.knowledge_point}|${t.error_type}`))
  const state = Object.fromEntries(computeProgress(weeks, readKnowledge()).rows.map(r => [`${r.knowledge_point}|${r.error_type}`, r]))
  const miss = {}
  for (const d of weeks.slice(-4).map(readWeek)) for (const e of d.entries) {
    const key = `${e.knowledge_point}|${e.error_type}`
    if (e.verdict !== 'wrong' || e.ahead || have.has(key) || state[key]?.state === '已改善') continue
    ;(miss[key] ||= { knowledge_point: e.knowledge_point, title: state[key]?.title || e.knowledge_point, error_type: e.error_type, n: 0 }).n++
  }
  return Object.values(miss).sort((a, b) => b.n - a.n)
}
function printUncovered(week, bank) {
  const miss = uncovered(week, bank)
  if (miss.length) console.log(`⚠ 最近 4 周纸面上错过、题库还没覆盖：${miss.map(m => `${m.knowledge_point}${m.title === m.knowledge_point ? "" : " " + m.title} ${m.error_type}（错 ${m.n} 题）`).join('、')}。给它们补模板再 bank 一次（往周的错题可以单独建一组「以前的题」）`)
  else console.log('最近 4 周纸面上错过的「知识点 × 错因」，题库都覆盖到了')
}

/** 这份题库按每天都来做够几天；不够 PACK_DAYS 的组指出来 */
function printDays(pack) {
  const all = packDays(pack), none = all.filter(g => !pack.items.some(it => it.group === g.id)), days = all.filter(g => !none.includes(g)), short = days.filter(g => g.days < PACK_DAYS), min = Math.min(...days.map(g => g.days))
  if (none.length) console.log(`⚠ 这些组没有模板：${none.map(g => g.name).join('、')}`)
  console.log(`按每天都来做，这份题库够 ${min} 天（各组：${days.map(g => `${g.name} ${g.days} 天`).join('，')}）`)
  if (short.length) console.log(`⚠ 不够 ${PACK_DAYS} 天：${short.map(g => `${g.name}（${g.days} 天）`).join('、')}。给这一组多写一两个模板，或者放宽取值范围`)
  return min
}
function printReport(report, dropped) {
  for (const r of report) console.log(`${r.id.padEnd(6)} 生成 ${String(r.made).padStart(3)} 道${Object.keys(r.problems).length ? '　跳过：' + Object.entries(r.problems).map(([k, n]) => `${k} ×${n}`).join('、') : ''}${r.made < 10 ? '　⚠ 少于 10 道，放宽取值范围或换写法' : ''}`)
  if (dropped) console.log(`复核验算丢弃 ${dropped} 道`)
}

/**
 * 往周的模板自动带进本周，Claude 不用重写（随机数按「周 + 模板 id」取，数字会自动换一批）：
 * 上周屏幕第一次就对不到 85%（或没练到）的，进「以前的题」；过关的在之后第 1、2、4 周回来保温。
 * 本周新模板已经覆盖的「知识点 × 错因」不带。
 */
export function carry(week, bank) {
  if (bank.templates.some(t => t.from)) return { bank, redo: [], keep: [] }      // 已经带过了
  const prev = listWeeks().filter(w => w < week).map(readWeek).filter(d => d.bank?.templates?.length).reverse()
  const keyOf = t => `${t.knowledge_point}|${t.error_type}`, have = new Set(bank.templates.map(keyOf)), ids = new Set(bank.templates.map(t => t.id))
  const redo = [], keep = []
  prev.forEach((d, i) => {
    const taken = new Set()
    for (const t of d.bank.templates) {
      if (have.has(keyOf(t))) continue
      const row = (d.screen || []).find(x => x.knowledge_point === t.knowledge_point && x.error_type === t.error_type)
      const rate = row && row.items >= 3 ? row.first_ok / row.items : null
      const warm = d.bank.groups.find(g => g.id === t.group)?.bucket === '已掌握保温'
      const to = i === 0 && (warm ? rate != null && rate < 0.6 : rate == null || rate < 0.85) && redo.length < 4 ? redo
        : [0, 1, 3].includes(i) && !warm && rate != null && rate >= 0.85 && keep.length < 3 ? keep : null
      if (!to) continue
      let id = t.id.includes('@') ? t.id : `${t.id}@${d.week.slice(5)}`
      while (ids.has(id)) id += 'x'
      ids.add(id); taken.add(keyOf(t)); to.push({ ...t, id, group: to === redo ? 'gc' : 'gk', from: t.from || d.week })
    }
    taken.forEach(k => have.add(k))
  })
  const groups = [...bank.groups.filter(g => !['gc', 'gk'].includes(g.id))], at = groups.findIndex(g => g.boss), add = g => at < 0 ? groups.push(g) : groups.splice(groups.findIndex(x => x.boss), 0, g)
  if (redo.length) add({ id: 'gc', name: '以前的题', sub: '换了新数字再练', bucket: '往周未过关', daily: Math.min(4, redo.length * 2) })
  if (keep.length) add({ id: 'gk', name: '老朋友', sub: '已经会的，回来看看', bucket: '已掌握保温', daily: 2 })
  return { bank: { ...bank, groups, templates: [...bank.templates, ...redo, ...keep] }, redo, keep }
}

/** 答题记录按「知识点 × 错因」汇总：每道题只看第一次交卷；忘写单位、被守护接住、用了本领单独计数。ladder 是孩子端的难度档位。 */
export function summarize(log, ladder = {}) {
  const rows = {}
  const firstTry = log.filter(r => r.try === 1)
  for (const r of firstTry) {
    const row = rows[`${r.kp}|${r.err}`] ||= { knowledge_point: r.kp, error_type: r.err, items: 0, first_ok: 0, by_error: {}, forgot_unit: 0, caught: 0, help: 0, days: [] }
    row.items++; if (r.correct) row.first_ok++
    if (r.caught) row.caught++            // 被 3 级守护接住：不算首答正确，单独记
    if (r.help?.length) row.help++        // 用了本领（提醒、帮忙或守护）
    if (!row.days.includes(r.day)) row.days.push(r.day)
  }
  for (const r of log.filter(x => !x.correct)) {
    const row = rows[`${r.kp}|${r.err}`]; if (!row) continue
    if (r.step_failed === '忘写单位') row.forgot_unit++
    else if (r.trap_error_type) row.by_error[r.trap_error_type] = (row.by_error[r.trap_error_type] || 0) + 1
  }
  return Object.values(rows).map(r => {
    const L = ladder[`${r.knowledge_point}|${r.error_type}`]
    return { ...r, days: r.days.length, ...(L ? { level: LEVELS[L.lv], ...(L.moved ? { moved: L.moved } : {}) } : {}) }
  })
}

async function sync(method, path, body) {
  // KID_URL / KID_TOKEN 可以临时指定（比如推到 dev 分支部署），不改保存的正式地址
  const saved = loadSettings(), kidUrl = process.env.KID_URL || saved.kidUrl, kidToken = process.env.KID_TOKEN || saved.kidToken
  if (!kidUrl || !kidToken) throw new Error('还没设置孩子端地址：npm run kid link <网址> <同步令牌>')
  const r = await fetch(kidUrl.replace(/\/$/, '') + '/api/kid' + path, { method, headers: { 'content-type': 'application/json', 'x-sync-token': kidToken }, body: body && JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || (r.status === 401 ? '被 Netlify 的登录保护挡住了（孩子端返回 401）。到 Netlify 把正式站的访问保护关掉；或者用 npm run kid pack <周> <文件> 生成文件，在孩子端用 admin 登录，到账号管理页上传' : `孩子端返回 ${r.status}`))
  return d
}

/**
 * 体验题库：把 rules.md 第 9 节里的示例模板（各题型都有）拼成一份题库包，不需要错题数据。
 * 只给 dev 分支部署试玩用：KID_URL=https://dev--mathfriend.netlify.app npm run kid demo
 */
export function demoPack(week) {
  const md = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'skills', 'weekly', 'rules.md'), 'utf8')
  const blocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1])
  let bank = null
  const extra = []
  for (const b of blocks) {
    try { const j = JSON.parse(b); if (j.templates) bank = bank || j; else if (j.id && j.format) extra.push(j); continue } catch { /* 一个代码块里有几行模板 */ }
    for (const chunk of b.split(/\n(?=\{)/)) { try { const j = JSON.parse(chunk); if (j.id && j.format) extra.push(j) } catch { /* 跳过不完整的 */ } }
  }
  if (!bank) throw new Error('rules.md 里没找到示例题库')
  const ids = new Set(bank.templates.map(t => t.id)), more = extra.filter(t => !ids.has(t.id) && (ids.add(t.id), true))
  bank.groups.splice(bank.groups.findIndex(g => g.boss), 0, { id: 'gx', name: '新题型体验', sub: '统计表、竖式、两步题……', bucket: '本周重点', daily: 6 })
  bank.templates.push(...more.map(t => ({ ...t, group: bank.groups.some(g => g.id === t.group) ? t.group : 'gx' })))
  return buildPack(bank, week)
}
const isoWeekNow = () => { const d = new Date(), w = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - w); const y = d.getUTCFullYear(); return `${y}-W${String(Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}` }

// ---------- 命令行 ----------
const [cmd, weekArg, arg] = process.argv.slice(2), week = cmd === 'pull' && !weekArg ? loadSettings().kidLastPush : weekArg   // pull 不写周：取上次推送那一周
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  if (cmd === 'link') { saveSettings({ kidUrl: week, kidToken: arg }); console.log(`已保存孩子端地址 ${week}`) }
  else if (cmd === 'clock') {
    // 拨 dev 站的日期：KID_URL=https://dev--mathfriend.netlify.app npm run kid clock 2027-01-22 [16:00]；不写日期就拨回今天
    if (!process.env.KID_URL) throw new Error('只能拨 dev：KID_URL=https://dev--mathfriend.netlify.app npm run kid clock 2027-01-22')
    if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error('日期写成 2027-01-22')
    await sync('POST', '/dev/clock', week ? { date: week, time: arg || '16:00' } : {})
    console.log(week ? `dev 站的日期拨到了 ${week} ${arg || '16:00'}` : 'dev 站的日期拨回了今天')
  }
  else if (cmd === 'demo') {
    const w = /^\d{4}-W\d{2}$/.test(week || '') ? week : isoWeekNow(), { pack, report } = demoPack(w)
    printReport(report, 0)
    printDays(pack)
    if (arg) { fs.writeFileSync(arg, JSON.stringify(pack)); console.log(`体验题库写到 ${arg}，在 dev 站管理员页面上传（含答案，别放进 public/ 或提交）`); process.exit(0) }
    if (!process.env.KID_URL) throw new Error('体验题库只推到 dev：KID_URL=https://dev--mathfriend.netlify.app npm run kid demo，或者 npm run kid demo <周> <文件> 写成文件去 dev 站管理员页面上传')
    const r = await sync('PUT', '/pack', pack)
    console.log(`已把体验题库推到 ${process.env.KID_URL}：${r.week}，${r.items} 道题`)
  }
  else if (cmd === 'check') {
    // /weekly 推题库前先确认连得上：没设地址退出码 2，连不上退出码 1
    const saved = loadSettings(), kidUrl = process.env.KID_URL || saved.kidUrl
    if (!kidUrl || !(process.env.KID_TOKEN || saved.kidToken)) { console.log('还没设置孩子端地址：npm run kid link <网址> <同步令牌>'); process.exit(2) }
    await sync('GET', `/log?week=${isoWeekNow()}`)
    console.log(`孩子端连得上：${kidUrl}${!process.env.KID_URL && saved.kidLastPush ? `，上次推送的是 ${saved.kidLastPush} 的题库` : '，还没推送过题库'}`)
  }
  else if (cmd === 'pull' && !week) console.log('还没推送过题库，没有答题记录可取。')
  else if (!/^\d{4}-W\d{2}$/.test(week || '')) throw new Error('用法：npm run kid bank|tune|pack|push|pull <周> …，npm run kid pull（取上次推送那一周），npm run kid check，或 npm run kid link <网址> <令牌>')
  else if (cmd === 'bank') {
    const bank = JSON.parse(fs.readFileSync(arg, 'utf8'))
    if (!Array.isArray(bank.groups) || !Array.isArray(bank.templates)) throw new Error('模板 json 要有 groups 和 templates 两个数组')
    const c = carry(week, bank)
    const data = readWeek(week); data.bank = c.bank; writeWeek(data)
    const { pack, report, dropped } = makePack(week)
    printReport(report, dropped)
    printDays(pack)
    if (c.redo.length) console.log(`往周未过关，自动带入：${c.redo.map(t => `${t.id}（${t.knowledge_point} ${t.error_type}）`).join('、')}`)
    if (c.keep.length) console.log(`往周已过关，回来保温：${c.keep.map(t => `${t.id}（${t.knowledge_point} ${t.error_type}）`).join('、')}`)
    printUncovered(week, c.bank)
    console.log(`已写入 错题/${week}.md 的「题库」段：${c.bank.templates.length} 个模板，共 ${pack.items.length} 道`)
  } else if (cmd === 'tune') {
    const data = readWeek(week)
    if (!data.bank) throw new Error(`错题/${week}.md 里还没有「题库」`)
    for (const kv of process.argv.slice(4)) {
      const at = kv.indexOf('='), k = kv.slice(0, at), v = kv.slice(at + 1), val = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
      if (k.startsWith('daily.')) { const g = data.bank.groups.find(x => x.id === k.slice(6)); if (!g) throw new Error(`没有分组 ${k.slice(6)}`); g.daily = val }
      else if (['unit_hint', 'blank_hint', 'slow', 'boss_day', 'bedtime', 'focus_boost', 'wish', 'wish_days', 'extra', 'minutes', 'note', 'kid_name', 'pet_name', 'read_aloud'].includes(k)) data.bank.tuning = { ...data.bank.tuning, [k]: val }
      else throw new Error(`不认识的调节项 ${k}。可以调：unit_hint blank_hint slow boss_day bedtime focus_boost wish wish_days extra minutes note kid_name pet_name read_aloud daily.<组 id>`)
    }
    writeWeek(data)
    console.log('调节项：' + JSON.stringify(data.bank.tuning || {}))
    console.log('每天题量：' + data.bank.groups.map(g => `${g.id} ${g.name} ${g.daily}`).join('，'))
    console.log(`改完要运行 npm run kid push ${week} 才会生效`)
  } else if (cmd === 'pack') {
    const { pack, report, dropped } = makePack(week)
    printReport(report, dropped)
    printDays(pack)
    if (arg) { fs.writeFileSync(arg, JSON.stringify(pack, null, 1)); console.log(`题库包写到 ${arg}（含答案，别放进 public/ 或提交）`) }
  } else if (cmd === 'push') {
    const { pack, report, dropped } = makePack(week)
    printReport(report, dropped)
    printUncovered(week, readWeek(week).bank)
    if (printDays(pack) < PACK_DAYS && !process.env.KID_SHORT) throw new Error(`题库不够 ${PACK_DAYS} 天，没有推送。按上面的提示补模板再 bank 一次（实在要推，命令前加 KID_SHORT=1）`)
    const r = await sync('PUT', '/pack', pack)
    if (!process.env.KID_URL) saveSettings({ kidLastPush: week })     // 推到 dev（临时 KID_URL）不算
    console.log(`已推送 ${r.week}：${r.items} 道题`)
  } else if (cmd === 'pull') {
    // 默认取第一个孩子账号的记录；KID_USER=用户名 取别的账号
    const { log, state } = await sync('GET', `/log?week=${week}${process.env.KID_USER ? `&user=${encodeURIComponent(process.env.KID_USER)}` : ''}`)
    const data = readWeek(week); data.screen = summarize(log || [], state?.ladder); writeWeek(data)
    const items = data.screen.reduce((n, r) => n + r.items, 0), ok = data.screen.reduce((n, r) => n + r.first_ok, 0), days = new Set((log || []).map(r => r.day)).size
    console.log(`${week}：来了 ${days} 天，做了 ${items} 题，第一次就对 ${items ? Math.round(ok / items * 100) : 0}%，忘写单位 ${data.screen.reduce((n, r) => n + r.forgot_unit, 0)} 次。已写入「答题」段。`)
    if (state) console.log(`小狗：${state.name || '还没起名'}（孩子：${state.kid || "还没写名字"}），已陪伴 ${state.days ?? 0} 天，金币 ${state.coins}，一共赚过 ${state.grow}，储蓄罐 ${state.jar || 0}，明信片 ${state.cards?.length || 0} 张`)
    if (state) console.log(`故事书 ${state.story || 0} 页${state.att?.week === week ? `，这周做完任务 ${state.att.days.length} 天` : ''}`)
    for (const r of data.screen) console.log(`  ${r.knowledge_point} ${r.error_type}：${r.first_ok}/${r.items}${r.forgot_unit ? `，忘写单位 ${r.forgot_unit}` : ''}${r.caught ? `，被接住 ${r.caught}` : ''}${r.help ? `，用了本领 ${r.help} 题` : ''}${r.level ? `，难度档 ${r.level}` : ''}${r.moved?.dir === 'down' ? '（刚降了一档，需要家长讲一讲）' : r.moved?.dir === 'up' ? '（刚升了一档）' : ''}`)
  } else throw new Error(`不认识的命令 ${cmd}`)
} catch (e) { console.error(e.message); process.exit(1) }
