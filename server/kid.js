// 家长端 ↔ 孩子端：题库模板入库、生成题库包、推送到孩子端、取回答题记录。
//   npm run kid bank 2026-W40 <模板 json>   校验模板，逐题验算，写进 错题/周.md 的「题库」段
//   npm run kid pack 2026-W40 [输出文件]     只生成题库包（检查用，不推送）
//   npm run kid push 2026-W40               生成题库包并推送到孩子端（Netlify）
//   npm run kid pull 2026-W40               取回该周答题记录，按「知识点 × 错因」汇总写进周 md 的「答题」段
//   npm run kid link <孩子端网址> <同步令牌>  保存地址和令牌（存在应用数据目录，不进项目文件夹）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readWeek, writeWeek, loadSettings, saveSettings } from './store.js'
import { verifyItem } from './sheet.js'
import { buildPack } from '../shared/contract.js'

/** 生成题库包；正确答案再用辅导单那套 verifyItem 验一遍，验不过的题丢掉。 */
export function makePack(week) {
  const bank = readWeek(week).bank
  if (!bank?.templates?.length) throw new Error(`错题/${week}.md 里还没有「题库」，先运行 npm run kid bank`)
  const { pack, report } = buildPack(bank, week)
  const okExpr = it => (it.format === 'word' ? it.choices.find(c => c.ok).t : it.format === 'first' ? it.tokens.join('') : it.text).replace(/−/g, '-')
  const before = pack.items.length
  pack.items = pack.items.filter(it => verifyItem({ expression: okExpr(it), answer: it.answer }))
  return { pack, report, dropped: before - pack.items.length }
}

function printReport(report, dropped) {
  for (const r of report) console.log(`${r.id.padEnd(6)} 生成 ${String(r.made).padStart(3)} 道${Object.keys(r.problems).length ? '　跳过：' + Object.entries(r.problems).map(([k, n]) => `${k} ×${n}`).join('、') : ''}${r.made < 10 ? '　⚠ 少于 10 道，放宽取值范围或换写法' : ''}`)
  if (dropped) console.log(`复核验算丢弃 ${dropped} 道`)
}

/** 答题记录按「知识点 × 错因」汇总：每道题只看第一次作答；忘写单位单独计数。 */
export function summarize(log) {
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
  return Object.values(rows).map(r => ({ ...r, days: r.days.length }))
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
  else if (!/^\d{4}-W\d{2}$/.test(week || '')) throw new Error('用法：npm run kid bank|pack|push|pull <周> …，或 npm run kid link <网址> <令牌>')
  else if (cmd === 'bank') {
    const bank = JSON.parse(fs.readFileSync(arg, 'utf8'))
    if (!Array.isArray(bank.groups) || !Array.isArray(bank.templates)) throw new Error('模板 json 要有 groups 和 templates 两个数组')
    const data = readWeek(week); data.bank = bank; writeWeek(data)
    const { pack, report, dropped } = makePack(week)
    printReport(report, dropped)
    console.log(`已写入 错题/${week}.md 的「题库」段：${bank.templates.length} 个模板，共 ${pack.items.length} 道`)
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
    const data = readWeek(week); data.screen = summarize(log || []); writeWeek(data)
    const items = data.screen.reduce((n, r) => n + r.items, 0), ok = data.screen.reduce((n, r) => n + r.first_ok, 0), days = new Set((log || []).map(r => r.day)).size
    console.log(`${week}：来了 ${days} 天，做了 ${items} 题，第一次就对 ${items ? Math.round(ok / items * 100) : 0}%，忘写单位 ${data.screen.reduce((n, r) => n + r.forgot_unit, 0)} 次。已写入「答题」段。`)
    if (state) console.log(`小狗：${state.name || '还没起名'}，金币 ${state.coins}，成长值 ${state.grow}`)
    for (const r of data.screen) console.log(`  ${r.knowledge_point} ${r.error_type}：${r.first_ok}/${r.items}${r.forgot_unit ? `，忘写单位 ${r.forgot_unit}` : ''}`)
  } else throw new Error(`不认识的命令 ${cmd}`)
} catch (e) { console.error(e.message); process.exit(1) }
