// 家长端 ↔ 孩子端：题库模板入库、生成题库包、推送到孩子端、取回答题记录。
//   npm run kid bank 2026-W40 <模板 json>   校验模板，逐题验算，自动带上往周的模板，写进 错题/周.md 的「题库」段
//   npm run kid tune 2026-W40 键=值 …        改本周的调节项（见 rules.md 第 9 节），改完要再 push
//   npm run kid pack 2026-W40 [输出文件]     只生成题库包（检查用，不推送）
//   npm run kid push 2026-W40               生成题库包并推送到孩子端（Netlify）
//   npm run kid pull 2026-W40               取回该周答题记录，按「知识点 × 错因」汇总写进周 md 的「答题」段
//   npm run kid link <孩子端网址> <同步令牌>  保存地址和令牌（存在应用数据目录，不进项目文件夹）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readWeek, writeWeek, listWeeks, loadSettings, saveSettings } from './store.js'
import { verifyItem } from './sheet.js'
import { buildPack, LEVELS } from '../shared/contract.js'

/** 生成题库包；正确答案再用辅导单那套 verifyItem 验一遍，验不过的题丢掉。 */
export function makePack(week) {
  const bank = readWeek(week).bank
  if (!bank?.templates?.length) throw new Error(`错题/${week}.md 里还没有「题库」，先运行 npm run kid bank`)
  const { pack, report } = buildPack(bank, week)
  // 钟面和多空题没有单一算式，实例化时已经逐空检查过
  const okExpr = it => (['word', 'plan'].includes(it.format) ? it.choices.find(c => c.ok).t : it.format === 'first' ? it.tokens.join('') : it.text).replace(/−/g, '-')
  const before = pack.items.length
  pack.items = pack.items.filter(it => ['clock', 'multi'].includes(it.format) || verifyItem({ expression: okExpr(it), answer: it.answer }))
  return { pack, report, dropped: before - pack.items.length }
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

/** 答题记录按「知识点 × 错因」汇总：每道题只看第一次作答；忘写单位单独计数。ladder 是孩子端的难度档位。 */
export function summarize(log, ladder = {}) {
  const rows = {}
  const firstTry = log.filter(r => r.try === 1)
  for (const r of firstTry) {
    const row = rows[`${r.kp}|${r.err}`] ||= { knowledge_point: r.kp, error_type: r.err, items: 0, first_ok: 0, by_error: {}, forgot_unit: 0, days: [] }
    row.items++; if (r.correct) row.first_ok++
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
  const { kidUrl, kidToken } = loadSettings()
  if (!kidUrl || !kidToken) throw new Error('还没设置孩子端地址：npm run kid link <网址> <同步令牌>')
  const r = await fetch(kidUrl.replace(/\/$/, '') + '/api/kid' + path, { method, headers: { 'content-type': 'application/json', 'x-sync-token': kidToken }, body: body && JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `孩子端返回 ${r.status}`)
  return d
}

// ---------- 命令行 ----------
const [cmd, week, arg] = process.argv.slice(2)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  if (cmd === 'link') { saveSettings({ kidUrl: week, kidToken: arg }); console.log(`已保存孩子端地址 ${week}`) }
  else if (!/^\d{4}-W\d{2}$/.test(week || '')) throw new Error('用法：npm run kid bank|tune|pack|push|pull <周> …，或 npm run kid link <网址> <令牌>')
  else if (cmd === 'bank') {
    const bank = JSON.parse(fs.readFileSync(arg, 'utf8'))
    if (!Array.isArray(bank.groups) || !Array.isArray(bank.templates)) throw new Error('模板 json 要有 groups 和 templates 两个数组')
    const c = carry(week, bank)
    const data = readWeek(week); data.bank = c.bank; writeWeek(data)
    const { pack, report, dropped } = makePack(week)
    printReport(report, dropped)
    if (c.redo.length) console.log(`往周未过关，自动带入：${c.redo.map(t => `${t.id}（${t.knowledge_point} ${t.error_type}）`).join('、')}`)
    if (c.keep.length) console.log(`往周已过关，回来保温：${c.keep.map(t => `${t.id}（${t.knowledge_point} ${t.error_type}）`).join('、')}`)
    console.log(`已写入 错题/${week}.md 的「题库」段：${c.bank.templates.length} 个模板，共 ${pack.items.length} 道`)
  } else if (cmd === 'tune') {
    const data = readWeek(week)
    if (!data.bank) throw new Error(`错题/${week}.md 里还没有「题库」`)
    for (const kv of process.argv.slice(4)) {
      const [k, v] = kv.split('='), val = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
      if (k.startsWith('daily.')) { const g = data.bank.groups.find(x => x.id === k.slice(6)); if (!g) throw new Error(`没有分组 ${k.slice(6)}`); g.daily = val }
      else if (['unit_hint', 'blank_hint', 'slow', 'boss_day', 'bedtime', 'focus_boost', 'wish', 'wish_days', 'extra', 'minutes'].includes(k)) data.bank.tuning = { ...data.bank.tuning, [k]: val }
      else throw new Error(`不认识的调节项 ${k}。可以调：unit_hint blank_hint slow boss_day bedtime focus_boost wish wish_days extra minutes daily.<组 id>`)
    }
    writeWeek(data)
    console.log('调节项：' + JSON.stringify(data.bank.tuning || {}))
    console.log('每天题量：' + data.bank.groups.map(g => `${g.id} ${g.name} ${g.daily}`).join('，'))
    console.log(`改完要运行 npm run kid push ${week} 才会生效`)
  } else if (cmd === 'pack') {
    const { pack, report, dropped } = makePack(week)
    printReport(report, dropped)
    if (arg) { fs.writeFileSync(arg, JSON.stringify(pack, null, 1)); console.log(`题库包写到 ${arg}（含答案，别放进 public/ 或提交）`) }
  } else if (cmd === 'push') {
    const { pack, report, dropped } = makePack(week)
    printReport(report, dropped)
    const r = await sync('PUT', '/pack', pack)
    console.log(`已推送 ${r.week}：${r.items} 道题`)
  } else if (cmd === 'pull') {
    const { log, state } = await sync('GET', `/log?week=${week}`)
    const data = readWeek(week); data.screen = summarize(log || [], state?.ladder); writeWeek(data)
    const items = data.screen.reduce((n, r) => n + r.items, 0), ok = data.screen.reduce((n, r) => n + r.first_ok, 0), days = new Set((log || []).map(r => r.day)).size
    console.log(`${week}：来了 ${days} 天，做了 ${items} 题，第一次就对 ${items ? Math.round(ok / items * 100) : 0}%，忘写单位 ${data.screen.reduce((n, r) => n + r.forgot_unit, 0)} 次。已写入「答题」段。`)
    if (state) console.log(`小狗：${state.name || '还没起名'}，金币 ${state.coins}，成长值 ${state.grow}`)
    if (state) console.log(`故事书 ${state.story || 0} 页${state.att?.week === week ? `，这周做完任务 ${state.att.days.length} 天` : ''}`)
    for (const r of data.screen) console.log(`  ${r.knowledge_point} ${r.error_type}：${r.first_ok}/${r.items}${r.forgot_unit ? `，忘写单位 ${r.forgot_unit}` : ''}${r.level ? `，难度档 ${r.level}` : ''}${r.moved?.dir === 'down' ? '（刚降了一档，需要家长讲一讲）' : r.moved?.dir === 'up' ? '（刚升了一档）' : ''}`)
  } else throw new Error(`不认识的命令 ${cmd}`)
} catch (e) { console.error(e.message); process.exit(1) }
