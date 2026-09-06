// 本周辅导单 PDF（PRD 5.7 / 5.8）：概览、重点问题、持续跟踪、下周预习、练习卷、答案页。
// 练习由 /weekly sheet skill 出，存在 错题/周.md 的「练习」段；这里只验算和排版，页面上的按钮可随时重建 PDF。
//   npm run sheet plan 2026-W37                   打印重点问题与预习知识点，供 skill 出题
//   npm run sheet practice 2026-W37 <json 文件>    验算并写入练习，然后生成 PDF
//   npm run sheet build 2026-W37                  只生成 PDF
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import { DIRS, listWeeks, readWeek, writeWeek, readKnowledge, computeProgress, plain } from './store.js'

const FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'

/** 程序验算（PRD F8-4）：表达式只允许数字与四则运算符，算不出或对不上的题丢弃。 */
export function verifyItem(item) {
  const expr = String(item.expression || '').replace(/×/g, '*').replace(/÷/g, '/').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/\s/g, '')
  if (!/^[\d+\-*/().]+$/.test(expr)) return false
  try { const v = Function(`"use strict";return (${expr})`)(); return Number.isFinite(v) && Math.abs(v - Number(item.answer)) < 1e-9 && v >= 0 && Number.isInteger(v) && v < 100000 } catch { return false }
}

/** 本周重点问题（最多 3 个）+ 下周预习知识点。 */
export function plan(week) {
  const weeks = listWeeks().filter(w => w <= week)
  const knowledge = readKnowledge()
  const progress = computeProgress(weeks, knowledge)
  const data = readWeek(week)
  const entriesFor = row => data.entries.filter(e => e.knowledge_point === row.knowledge_point && e.error_type === row.error_type && e.verdict === 'wrong')
  const rows = progress.rows.filter(r => { const es = entriesFor(r); return es.length > 0 && !es.every(e => e.ahead) })
  const preview = data.preview.map(id => knowledge.nodes.find(n => n.id === id)).filter(Boolean)
  return { progress, data, knowledge, preview, focus: rows.slice(0, 3).map(r => ({ ...r, entries: entriesFor(r) })) }
}

/** 把 skill 出的练习验算后写入周 md。返回丢弃的题数。 */
export function savePractice(week, sets) {
  const data = readWeek(week)
  let dropped = 0
  data.practice = (sets || []).map(s => ({ topic: plain(s.topic), scope: s.scope === '预习' ? '预习' : '错题', items: (s.items || []).filter(it => { const ok = verifyItem(it); if (!ok) dropped++; return ok }).map(it => ({ ...it, text: plain(it.text), hint: plain(it.hint) })) }))
  writeWeek(data)
  return dropped
}

export async function buildSheet(week) {
  const { progress, data, knowledge, focus, preview } = plan(week)
  const prevWeek = listWeeks().filter(w => w < week).at(-1)
  const prevFocus = prevWeek ? plan(prevWeek).focus : []
  const sets = data.practice.filter(s => s.items.length)

  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 }, info: { Title: `${week} 辅导单` } })
  doc.registerFont('cn', FONT, 'HiraginoSansGB-W3'); doc.registerFont('cnb', FONT, 'HiraginoSansGB-W6')
  const out = path.join(DIRS.sheets, `${week}.pdf`)
  fs.mkdirSync(DIRS.sheets, { recursive: true })
  const stream = fs.createWriteStream(out)
  doc.pipe(stream)
  const h = (t, size = 15) => doc.moveDown(0.6).font('cnb').fontSize(size).text(t).moveDown(0.3).font('cn').fontSize(10.5)
  const p = t => doc.font('cn').fontSize(10.5).text(t, { lineGap: 3 })

  // 1 概览
  doc.font('cnb').fontSize(20).text(`${week} 本周辅导单`)
  const total = Object.values(data.attempts).reduce((a, b) => a + b, 0)
  const wrong = data.entries.filter(e => e.verdict === 'wrong').length
  const scores = [...new Set(data.materials.map(m => m.score).filter(Boolean))].join('、')
  p(`材料 ${data.materials.length} 份，题目 ${total} 道，错题 ${wrong} 道${scores ? `，老师等级 ${scores}` : ''}。${progress.baseline === week ? '本周为起点周，不与上周比较。' : ''}`)

  // 2 重点问题
  h('本周重点问题')
  if (!focus.length) p('本周没有需要重点辅导的问题。')
  focus.forEach((f, i) => {
    const node = knowledge.nodes.find(n => n.id === f.knowledge_point)
    doc.font('cnb').fontSize(12).text(`${i + 1}. ${f.title}　[${f.error_type}]　本周 ${f.current.mistakes}/${f.current.attempts || '-'} 错　预计 ${i === 0 ? 15 : 10} 分钟`)
    const e = f.entries[0]
    const img = e && path.join(DIRS.mistakes, week, `${e.id}.png`)
    if (img && fs.existsSync(img)) { try { doc.image(img, { fit: [300, 160] }); doc.moveDown(0.3) } catch { /* 忽略坏图 */ } }
    if (e) p(`题目：${e.problem}\n孩子答案：${e.student_answer}${e.corrected_answer ? `　订正：${e.corrected_answer}` : ''}　正确答案：${e.correct_answer}\n卡点：${e.analysis || ''}`)
    p(`怎么讲：${node?.guide || '先让孩子讲一遍自己的思路，再一起找到出错的那一步。'}`)
    if (e?.coach_prompt) p(`可以这样问：“${e.coach_prompt}”`)
    doc.moveDown(0.5)
  })

  // 3 持续跟踪
  h('持续跟踪')
  if (!prevFocus.length) p(progress.baseline === week ? '起点周，下周开始跟踪。' : '上周没有重点问题。')
  for (const pf of prevFocus) {
    const row = progress.rows.find(r => r.knowledge_point === pf.knowledge_point && r.error_type === pf.error_type)
    p(`${pf.title} [${pf.error_type}]：${row ? row.state : '未验证'}${row?.current?.attempts ? `（本周 ${row.current.mistakes}/${row.current.attempts}）` : ''}`)
  }

  // 4 下周预习
  if (preview.length) {
    h('下周预习')
    preview.forEach(n => {
      doc.font('cnb').fontSize(12).text(`${n.id} ${n.title}`)
      p(`要点：${n.core}`)
      if (n.example && n.example !== '待补充') p(`例子：${n.example}`)
      if (n.guide && n.guide !== '待补充') p(`怎么讲：${n.guide}`)
      if (n.pitfalls && n.pitfalls !== '待补充') p(`容易错：${n.pitfalls}`)
      doc.moveDown(0.4)
    })
  }

  // 5 课外拓展与超前
  const ahead = data.entries.filter(e => e.ahead || String(e.knowledge_point).startsWith('EX'))
  if (ahead.length) { h('课外与超前'); p([...new Set(ahead.map(e => `${e.knowledge_point} ${knowledge.nodes.find(n => n.id === e.knowledge_point)?.title || ''}`))].join('；') + '。这些内容不计入本周主要问题。') }

  // 6 练习卷（独立分页）+ 7 答案页
  if (sets.length) {
    doc.addPage(); doc.font('cnb').fontSize(18).text(`${week} 练习卷`).moveDown(0.2)
    doc.font('cn').fontSize(9.5).fillColor('#666').text('姓名：__________　　用时：______ 分钟').fillColor('black')
    sets.forEach(s => {
      h(`${s.topic}${s.scope === '预习' ? '（预习）' : ''}`, 13)
      s.items.forEach((it, i) => {
        doc.font('cn').fontSize(12).text(`${i + 1}. ${it.text}${it.kind === 'calc' ? ' ＝' : ''}`, { lineGap: 6 })
        doc.moveDown(it.kind === 'word' ? 2.8 : 1.2)
      })
    })
    doc.addPage(); doc.font('cnb').fontSize(18).text('答案').moveDown(0.5)
    doc.font('cn').fontSize(9.5).fillColor('#666').text('括号里是算式，斜体是讲错时可以用的提示，讲解时给家长看。').fillColor('black')
    sets.forEach(s => {
      h(`${s.topic}${s.scope === '预习' ? '（预习）' : ''}`, 13)
      s.items.forEach((it, i) => {
        p(`${i + 1}. ${it.answer}${it.unit || ''}　（${it.expression}）`)
        if (it.hint) doc.fontSize(9).fillColor('#666').text(`　　${it.hint}`).fillColor('black').fontSize(10.5)
      })
    })
  }
  doc.end()
  await new Promise(r => stream.on('finish', r))
  return out
}

// ---------- 命令行入口 ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, week, file] = process.argv.slice(2)
  if (!/^\d{4}-W\d{2}$/.test(week || '')) { console.error('用法：npm run sheet plan|practice|build <周> [练习 json]'); process.exit(1) }
  if (cmd === 'plan') {
    const { focus, preview } = plan(week)
    console.log(JSON.stringify({
      week,
      focus: focus.map(f => ({ knowledge_point: f.knowledge_point, title: f.title, error_type: f.error_type, mistakes: f.current.mistakes, attempts: f.current.attempts, samples: f.entries.slice(0, 2).map(e => ({ problem: e.problem, student_answer: e.student_answer, correct_answer: e.correct_answer, analysis: e.analysis })) })),
      preview: preview.map(n => ({ knowledge_point: n.id, title: n.title, core: n.core, example: n.example })),
    }, null, 1))
  } else if (cmd === 'practice') {
    const dropped = savePractice(week, JSON.parse(fs.readFileSync(file, 'utf8')))
    console.log(`练习已写入 错题/${week}.md${dropped ? `，${dropped} 题验算不通过已丢弃` : ''}`)
    console.log('PDF：' + await buildSheet(week))
  } else if (cmd === 'build') {
    console.log('PDF：' + await buildSheet(week))
  } else console.error('用法：npm run sheet plan|practice|build <周> [练习 json]')
}
