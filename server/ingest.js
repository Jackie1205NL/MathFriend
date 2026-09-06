// 本周归集分两段，识别由 Claude Code 的 /weekly skill 完成：
//   npm run ingest prepare        inbox → 去重 → 渲染分页 → 工作目录 + manifest.json（打印给 skill 看）
//   （skill 逐页看图，往每个文件的工作目录写 pages.json，格式见 .claude/skills/weekly/rules.md）
//   npm run ingest apply [周]     读 pages.json → 判题 → 裁图 → 写 错题/周.md → 原件归档 → 清理工作目录
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { DIRS, APP_DIR, ERROR_TYPES, SOURCE_WEIGHT, ensureDirs, isoWeek, readWeek, writeWeek, nextEntryId, readKnowledge, upsertKnowledgeNode, loadCache, saveCache, sha256, plain } from './store.js'

export const WORK = path.join(APP_DIR, 'work')
const MANIFEST = path.join(WORK, 'manifest.json')
const safe = s => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || '未命名'

/** 把上传文件渲染成逐页图片（PDF 用 Ghostscript，HEIC 用 sips，其余交给 sharp）。 */
function renderPages(file, dir) {
  const ext = path.extname(file).toLowerCase()
  let sources = [file]
  if (ext === '.pdf') {
    execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=png16m', '-r110', `-sOutputFile=${path.join(dir, 'raw-%03d.png')}`, file])
    sources = fs.readdirSync(dir).filter(f => f.startsWith('raw-')).sort().map(f => path.join(dir, f))
  } else if (ext === '.heic') {
    const out = path.join(dir, 'raw.jpg'); execFileSync('sips', ['-s', 'format', 'jpeg', file, '--out', out]); sources = [out]
  }
  return sources
}

/** 预处理：按 EXIF 摆正、长边 1600、JPEG 质量 80。保留彩色，因为红笔批改是判题依据。 */
async function preprocess(src, dest) {
  await sharp(src).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(dest)
  if (src !== dest && src.includes(WORK)) fs.rmSync(src, { force: true })
}

async function cropQuestion(pagePath, bbox, dest) {
  const meta = await sharp(pagePath).metadata()
  const pad = 0.015
  const x0 = Math.max(0, bbox[0] - pad) * meta.width, y0 = Math.max(0, bbox[1] - pad) * meta.height
  const x1 = Math.min(1, bbox[2] + pad) * meta.width, y1 = Math.min(1, bbox[3] + pad) * meta.height
  const w = Math.max(40, Math.round(x1 - x0)), h = Math.max(40, Math.round(y1 - y0))
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await sharp(pagePath).extract({ left: Math.round(x0), top: Math.round(y0), width: Math.min(w, meta.width - Math.round(x0)), height: Math.min(h, meta.height - Math.round(y0)) }).png().toFile(dest)
}

/** PRD 5.3：老师批改 > 参考答案 > AI；打叉且有订正痕迹不算冲突；老师批改与 AI 验算不一致标为冲突。 */
export function judge(q, hasAnswerKey) {
  const aiWrong = q.ai_verdict === 'wrong'
  if (q.teacher_mark === 'right' || q.teacher_mark === 'wrong') {
    const verdict = q.teacher_mark === 'wrong' ? 'wrong' : 'correct'
    const conflict = verdict === 'wrong' && q.has_correction ? false : (verdict === 'wrong') !== aiWrong
    return { verdict, graded_by: '老师', grade_conflict: conflict, confidence: conflict ? Math.min(q.confidence || 0, 50) : (q.confidence || 0) }
  }
  if (hasAnswerKey) return { verdict: aiWrong ? 'wrong' : 'correct', graded_by: '参考答案', grade_conflict: false, confidence: q.confidence || 0 }
  return { verdict: aiWrong ? 'wrong' : 'correct', graded_by: 'AI', grade_conflict: false, confidence: Math.min(q.confidence || 0, 70) }
}

const unitOf = kp => String(kp || '').split('.')[0]
const unitNum = u => /^\d+/.test(u) ? parseInt(u, 10) : null  // '02X' → 2，用于比较进度先后

// ---------- 第一段：准备 ----------
export async function prepare() {
  ensureDirs()
  const cache = loadCache()
  const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : []
  const manifest = old.filter(m => fs.existsSync(path.join(DIRS.inbox, m.name)) && fs.existsSync(m.dir))  // 上次准备过但没落库的保留
  const report = []
  for (const name of fs.readdirSync(DIRS.inbox).filter(f => /\.(pdf|jpe?g|png|heic)$/i.test(f))) {
    if (manifest.some(m => m.name === name)) { report.push(`= ${name}：上次已准备，沿用`); continue }
    const file = path.join(DIRS.inbox, name)
    const hash = sha256(fs.readFileSync(file))
    if (cache.hashes[hash]) { fs.unlinkSync(file); report.push(`- ${name}：与 ${cache.hashes[hash]} 内容完全相同，已删除`); continue }
    const id = `${manifest.length + 1}`.padStart(2, '0') + '-' + safe(path.parse(name).name)
    const dir = path.join(WORK, id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
    let raws; try { raws = renderPages(file, dir) } catch (e) { report.push(`✗ ${name}：无法渲染，${e.message}`); continue }
    const pages = []
    for (let i = 0; i < raws.length; i++) { const p = path.join(dir, `page-${String(i + 1).padStart(3, '0')}.jpg`); await preprocess(raws[i], p); pages.push(p) }
    manifest.push({ id, name, hash, week: isoWeek(fs.statSync(file).mtime), dir, pages, result: path.join(dir, 'pages.json') })
    report.push(`✓ ${name}：${pages.length} 页`)
  }
  fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  return { manifest, report }
}

// ---------- 第二段：落库 ----------
export async function apply({ week: forcedWeek } = {}) {
  ensureDirs()
  if (!fs.existsSync(MANIFEST)) return { report: ['还没有准备好的文件，先运行 npm run ingest prepare'], done: 0, weeks: [] }
  const cache = loadCache()
  const knownNodes = new Set(readKnowledge().nodes.map(n => n.id))
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const byWeek = {}
  const report = []
  const remaining = []
  // 先通读所有 pages.json，得出本周课堂进度：学校练习里出现的最大单元。课本页超出它的算下周预习。
  const readResult = m => { try { return fs.existsSync(m.result) ? JSON.parse(fs.readFileSync(m.result, 'utf8')) : null } catch { return null } }
  const schoolUnits = manifest.flatMap(m => (readResult(m) || []).filter(d => d.material_type === '学校练习' || d.material_type === '试卷')
    .flatMap(d => (d.questions || []).map(q => unitNum(unitOf(q.knowledge_point))))).filter(u => u != null)
  const currentUnit = schoolUnits.length ? Math.max(...schoolUnits) : null
  for (const m of manifest) {
    const file = path.join(DIRS.inbox, m.name)
    if (!fs.existsSync(file)) { report.push(`- ${m.name}：inbox 里已不存在，跳过`); continue }
    if (!fs.existsSync(m.result)) { report.push(`… ${m.name}：还没有 pages.json，未处理`); remaining.push(m); continue }
    let pagesData; try { pagesData = JSON.parse(fs.readFileSync(m.result, 'utf8')) } catch (e) { report.push(`✗ ${m.name}：pages.json 不是合法 JSON，${e.message}`); remaining.push(m); continue }
    if (!Array.isArray(pagesData) || pagesData.length !== m.pages.length) { report.push(`✗ ${m.name}：pages.json 应是 ${m.pages.length} 个元素的数组（每页一个），实际 ${Array.isArray(pagesData) ? pagesData.length : '不是数组'}`); remaining.push(m); continue }

    const week = forcedWeek || m.week
    const date = new Date(fs.statSync(file).mtime).toLocaleDateString('sv-SE')  // 做题日期用上传时间近似（PRD F1-1）
    const weekData = byWeek[week] || (byWeek[week] = readWeek(week))
    const before = weekData.entries.length

    // 按来源分组（F1-2）
    const groups = []
    pagesData.forEach((d, i) => {
      const key = `${d.material_type}|${d.source_name}`
      let g = groups.find(x => x.key === key)
      if (!g) { g = { key, type: d.material_type || '未知', source: d.source_name || '未知', score: d.teacher_score || '', pages: [] }; groups.push(g) }
      g.pages.push({ pagePath: m.pages[i], data: d })
    })
    const ext = path.extname(m.name).toLowerCase()
    const primary = groups[0]
    let target = path.join(DIRS.originals, `${week}_${primary?.type || '未知'}_${safe(primary?.source)}${ext}`); let n = 2
    while (fs.existsSync(target)) target = path.join(DIRS.originals, `${week}_${primary?.type || '未知'}_${safe(primary?.source)}-${n++}${ext}`)

    for (const g of groups) {
      let questions = 0
      if (g.type === '参考答案') {
        for (const p of g.pages) {
          const k = (p.data.answer_key?.source || g.source).split(' ')[0]
          cache.answerKeys[k] = ((cache.answerKeys[k] || '') + '\n' + (p.data.answer_key?.text || '')).trim()
          target = path.join(DIRS.originals, `参考答案_${safe(k)}${ext}`); let j = 2
          while (fs.existsSync(target)) target = path.join(DIRS.originals, `参考答案_${safe(k)}-${j++}${ext}`)
        }
      } else if (g.type === '课本页' || g.type === '预习' || g.type === '目录') {
        for (const p of g.pages) for (const node of p.data.nodes || []) {
          const unit = node.unit || unitOf(node.id)
          upsertKnowledgeNode(node.id, node.title, unit, node)
          // 预习：显式标记，或课本单元跑在课堂进度前面
          const isPreview = g.type === '预习' || (currentUnit != null && unitNum(unit) != null && unitNum(unit) > currentUnit)
          if (isPreview && !weekData.preview.includes(node.id)) weekData.preview.push(node.id)
        }
      } else {
        for (const p of g.pages) for (const node of p.data.nodes || []) upsertKnowledgeNode(node.id, node.title, node.unit || unitOf(node.id), node)  // 习题页也可以补充课外知识点
        for (const p of g.pages) for (const q of p.data.questions || []) {
          questions++
          const kp = q.knowledge_point || 'EX.01'
          weekData.attempts[kp] = (weekData.attempts[kp] || 0) + 1
          if (q.new_node_title || !knownNodes.has(kp)) upsertKnowledgeNode(kp, q.new_node_title || kp, unitOf(kp), {})  // 缺节点就补占位，页面上不会出现空标题
          const j = judge(q, !!cache.answerKeys[g.source.split(' ')[0]])
          if (j.verdict !== 'wrong' && !j.grade_conflict) continue
          const id = nextEntryId(weekData)
          try { await cropQuestion(p.pagePath, q.bbox || [0, 0, 1, 1], path.join(DIRS.mistakes, week, `${id}.png`)) } catch { /* 裁图失败不影响入库 */ }
          const ahead = currentUnit != null && unitNum(unitOf(kp)) != null && unitNum(unitOf(kp)) > currentUnit
          weekData.entries.push({
            id, week, date, source_type: g.type, source_name: g.source, source_weight: SOURCE_WEIGHT[g.type] ?? 1,
            knowledge_point: kp, error_type: ERROR_TYPES.includes(q.error_type) ? q.error_type : '待确认', error_type_secondary: q.error_type_secondary || '',
            graded_by: j.graded_by, grade_conflict: j.grade_conflict, verdict: j.verdict, ai_verdict: q.ai_verdict, teacher_mark: q.teacher_mark || 'none',
            confidence: j.confidence, ahead: !!ahead, teacher_score: g.score, file: path.basename(target),
            problem: plain(q.problem), student_answer: plain(q.student_answer), corrected_answer: plain(q.corrected_answer), correct_answer: plain(q.correct_answer), analysis: plain(q.analysis), coach_prompt: plain(q.coach_prompt),
          })
        }
      }
      weekData.materials.push({ file: path.basename(target), type: g.type, source: g.source, pages: g.pages.length, questions, score: g.score, week_of: week })
    }
    fs.renameSync(file, target)
    cache.hashes[m.hash] = path.basename(target)
    fs.rmSync(m.dir, { recursive: true, force: true })
    report.push(`✓ ${m.name} → ${path.basename(target)}（${week}，${groups.map(g => `${g.type} ${g.source}`).join(' / ')}，新错题 ${weekData.entries.length - before}）`)
  }
  for (const w of Object.values(byWeek)) writeWeek(w)
  saveCache({ ...loadCache(), hashes: cache.hashes, answerKeys: cache.answerKeys })
  if (remaining.length) fs.writeFileSync(MANIFEST, JSON.stringify(remaining, null, 2)); else fs.rmSync(WORK, { recursive: true, force: true })
  return { report, done: manifest.length - remaining.length, weeks: Object.keys(byWeek) }
}

// ---------- 命令行入口 ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, week] = process.argv.slice(2)
  if (week && !/^\d{4}-W\d{2}$/.test(week)) { console.error('周格式应为 2026-W37'); process.exit(1) }
  if (cmd === 'prepare') {
    const { manifest, report } = await prepare()
    console.log(report.join('\n') || 'inbox 里没有待处理的文件。')
    console.log('\nMANIFEST ' + JSON.stringify(manifest.map(m => ({ name: m.name, week: m.week, pages: m.pages, result: m.result }))))
  } else if (cmd === 'apply') {
    const { report, done, weeks } = await apply({ week })
    console.log(report.join('\n'))
    if (done) console.log(`\n已落库 ${done} 份，涉及 ${weeks.join('、')}。接下来运行 npm run sheet plan <周> 出练习题。`)
  } else {
    console.log('用法：npm run ingest prepare | npm run ingest apply [周]')
  }
}
