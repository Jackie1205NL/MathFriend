// 文件即真相源：错题/周.md、知识点.md、原件/、辅导单/。程序缓存与设置放在应用数据目录。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export const ROOT = process.env.DATA_DIR || process.cwd()
export const DIRS = {
  inbox: path.join(ROOT, 'inbox'),
  originals: path.join(ROOT, '原件'),
  mistakes: path.join(ROOT, '错题'),
  sheets: path.join(ROOT, '辅导单'),
}
export const KNOWLEDGE_FILE = path.join(ROOT, '知识点.md')
// 缓存与设置按数据目录隔离，避免测试目录的去重哈希误删正式目录的文件
export const APP_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'shuban', crypto.createHash('sha256').update(ROOT).digest('hex').slice(0, 8))
const SETTINGS_FILE = path.join(APP_DIR, 'settings.json')
const CACHE_FILE = path.join(APP_DIR, 'cache.json')

export const ERROR_TYPES = ['计算失误', '审题', '概念不清', '格式规范', '漏题', '策略缺失']
export const SOURCE_WEIGHT = { 学校练习: 3, 教辅: 2, 试卷: 5, 课本页: 0, 预习: 0, 目录: 0, 参考答案: 0, 未知: 1 }
const ANSWER_KEY_PREFIX = '参考答案_'

export function ensureDirs() {
  for (const d of [...Object.values(DIRS), APP_DIR]) fs.mkdirSync(d, { recursive: true })
}

/** 算式一律写成人看得懂的样子：去掉 $、把 \times 之类换成符号。存盘前统一处理一次。 */
export const plain = s => String(s ?? '')
  .replace(/\$+/g, '')
  .replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\cdot/g, '·')
  .replace(/\\approx/g, '≈').replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠')
  .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
  .replace(/\\square/g, '□').replace(/\\circ/g, '○')
  .replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '')
  .replace(/[ \t]+/g, ' ').trim()

// ---------- 设置与缓存 ----------
const DEFAULT_SETTINGS = { password: '1234', keep: [] }
export function loadSettings() {
  let s; try { s = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) } } catch { s = { ...DEFAULT_SETTINGS } }
  if (!s.secret) { s.secret = crypto.randomBytes(16).toString('hex'); fs.mkdirSync(APP_DIR, { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)) }  // 会话令牌的随机盐
  return s
}
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2))
  return next
}
export function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) } catch { return { hashes: {}, answerKeys: {} } }
}
export function saveCache(cache) { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)) }

// ---------- 周 ----------
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
export function listWeeks() {
  ensureDirs()
  return fs.readdirSync(DIRS.mistakes).filter(f => /^\d{4}-W\d{2}\.md$/.test(f)).map(f => f.slice(0, -3)).sort()
}

// ---------- 错题/周.md 读写 ----------
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => ':--').join('|')}|`, ...rows.map(r => `| ${r.map(v => String(v ?? '').replace(/\|/g, '｜')).join(' | ')} |`)].join('\n')
const parseTable = block => block.split('\n').filter(l => l.startsWith('|')).slice(2).map(l => l.split('|').slice(1, -1).map(s => s.trim()))
const yamlOut = obj => Object.entries(obj).map(([k, v]) => `${k}: ${v === '' || v == null ? '' : typeof v === 'string' && /[:#]/.test(v) ? JSON.stringify(v) : v}`).join('\n')
const NUMERIC = new Set(['source_weight', 'confidence'])  // 编号如 003、01.2 必须保持字符串
const yamlIn = text => Object.fromEntries(text.split('\n').filter(Boolean).map(l => {
  const i = l.indexOf(':'); const k = l.slice(0, i).trim(); let v = l.slice(i + 1).trim()
  if (v === 'true') v = true; else if (v === 'false') v = false; else if (NUMERIC.has(k) && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v); else if (v.startsWith('"')) v = JSON.parse(v)
  return [k, v]
}))
const readJson = (block, fallback) => { try { return JSON.parse((block.match(/```json\n([\s\S]*?)```/) || [])[1] || '') } catch { return fallback } }

export function emptyWeek(week) { return { week, materials: [], attempts: {}, entries: [], preview: [], practice: [] } }

export function readWeek(week) {
  const file = path.join(DIRS.mistakes, `${week}.md`)
  if (!fs.existsSync(file)) return emptyWeek(week)
  const text = fs.readFileSync(file, 'utf8')
  const section = name => (text.split(`\n## ${name}\n`)[1] || '').split('\n## ')[0].split('\n### ')[0]
  const materials = parseTable(section('本周材料')).map(([file, type, source, pages, questions, score, week_of]) => ({ file, type, source, pages: +pages || 0, questions: +questions || 0, score, week_of }))
  const attempts = Object.fromEntries(parseTable(section('各知识点题量')).map(([k, n]) => [k, +n || 0]))
  const entries = text.split('\n### ').slice(1).map(chunk => {
    const yaml = (chunk.match(/```yaml\n([\s\S]*?)```/) || [])[1] || ''
    const field = label => ((chunk.match(new RegExp(`\\*\\*${label}\\*\\* ([^\\n]*)`)) || [])[1] || '').trim()
    return { ...yamlIn(yaml), problem: field('题目'), student_answer: field('孩子答案'), corrected_answer: field('订正'), correct_answer: field('正确答案'), analysis: field('卡点'), coach_prompt: field('引导') }
  })
  return { week, materials, attempts, entries, preview: readJson(section('预习'), []), practice: readJson(section('练习'), []) }
}

export function writeWeek(data) {
  ensureDirs()
  const { week, materials, attempts, entries, preview = [], practice = [] } = data
  const summary = table(['编号', '来源', '知识点', '错因', '判题依据'], entries.map(e => [e.id, e.source_name, e.knowledge_point, e.error_type, e.graded_by]))
  const body = entries.map(e => {
    const { problem, student_answer, corrected_answer, correct_answer, analysis, coach_prompt, ...meta } = e
    const one = s => plain(s).replace(/\s*\n\s*/g, ' ')
    return [`### ${e.id}`, '', `![](${week}/${e.id}.png)`, '', '```yaml', yamlOut(meta), '```', '', `**题目** ${one(problem)}`, `**孩子答案** ${one(student_answer)}`, `**订正** ${one(corrected_answer)}`, `**正确答案** ${one(correct_answer)}`, `**卡点** ${one(analysis)}`, `**引导** ${one(coach_prompt)}`].join('\n')
  }).join('\n\n')
  const md = [`# ${week} 错题`, '', '## 本周材料', table(['文件', '类型', '来源', '页数', '题数', '等级', '所属周'], materials.map(m => [m.file, m.type, m.source, m.pages, m.questions, m.score || '', m.week_of || week])), '',
    '## 各知识点题量', table(['知识点', '题数'], Object.entries(attempts)), '',
    '## 预习', '```json', JSON.stringify(preview), '```', '',
    '## 练习', '```json', JSON.stringify(practice), '```', '',
    '## 错题', summary, '', body, ''].join('\n')
  fs.writeFileSync(path.join(DIRS.mistakes, `${week}.md`), md)
}

export function nextEntryId(weekData) {
  const max = weekData.entries.reduce((n, e) => Math.max(n, Number(e.id) || 0), 0)
  return String(max + 1).padStart(3, '0')
}

// ---------- 知识点.md ----------
// 一级标题 = 单元，二级标题 = 课时节点（"## 01.2 除法与加减法的混合运算"），节点下四段用 "**核心内容**" 等粗体标签开头。
export function readKnowledge() {
  if (!fs.existsSync(KNOWLEDGE_FILE)) return { units: [], nodes: [] }
  const text = fs.readFileSync(KNOWLEDGE_FILE, 'utf8')
  const units = []; const nodes = []
  let unit = null
  for (const block of text.split(/\n(?=#{1,2} )/)) {
    const m1 = block.match(/^# (\S+)\s+(.*)/)
    const m2 = block.match(/^## (\S+)\s+(.*)/)
    if (m1) { unit = { id: m1[1], title: m1[2].trim(), type: block.includes('综合实践') ? '综合实践' : block.includes('课外') ? '课外' : '正式单元' }; units.push(unit); continue }
    if (m2 && unit) {
      const seg = label => ((block.match(new RegExp(`\\*\\*${label}\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)`)) || [])[1] || '').trim()
      nodes.push({ id: m2[1], title: m2[2].trim(), unit: unit.id, unitTitle: unit.title, manual: block.includes('<!-- manual -->'), core: seg('核心内容'), example: seg('典型例题'), guide: seg('引导方式'), pitfalls: seg('常见错因') })
    }
  }
  return { units, nodes }
}

export function upsertKnowledgeNode(nodeId, title, unitId, sections) {
  const { nodes } = readKnowledge()
  let text = fs.existsSync(KNOWLEDGE_FILE) ? fs.readFileSync(KNOWLEDGE_FILE, 'utf8') : '# EX 课外拓展\n'
  const existing = nodes.find(n => n.id === nodeId)
  const render = s => `## ${nodeId} ${plain(title)}\n\n**核心内容** ${plain(s.core) || '待补充'}\n\n**典型例题** ${plain(s.example) || '待补充'}\n\n**引导方式** ${plain(s.guide) || '待补充'}\n\n**常见错因** ${plain(s.pitfalls) || '待补充'}\n`
  const keep = (a, b) => a && a !== '待补充' ? a : b
  if (existing) {
    if (existing.manual) return
    const merged = { core: keep(existing.core, sections.core), example: keep(existing.example, sections.example), guide: keep(existing.guide, sections.guide), pitfalls: keep(existing.pitfalls, sections.pitfalls) }
    text = text.replace(new RegExp(`## ${nodeId.replace('.', '\\.')} [\\s\\S]*?(?=\\n#{1,2} |$)`), render(merged).trimEnd() + '\n')
  } else {
    const unitHeader = new RegExp(`(# ${unitId} [^\\n]*\\n[\\s\\S]*?)(?=\\n# |$)`)
    const unitTitle = (text.match(new RegExp(`^\\| ${unitId} \\| ([^|]+) \\|`, 'm')) || [])[1]?.trim() || (unitId === 'EX' ? '课外拓展' : unitId)  // 单元名取自目录表
    text = unitHeader.test(text) ? text.replace(unitHeader, (_, body) => `${body.trimEnd()}\n\n${render(sections)}`) : `${text.trimEnd()}\n\n# ${unitId} ${unitTitle}\n\n${render(sections)}`
  }
  fs.writeFileSync(KNOWLEDGE_FILE, text)
}

// ---------- 原件与到期 ----------
export function listOriginals() {
  ensureDirs()
  const keep = loadSettings().keep
  const now = Date.now()
  return fs.readdirSync(DIRS.originals).filter(f => !f.startsWith('.')).map(f => {
    const st = fs.statSync(path.join(DIRS.originals, f))
    const ageDays = (now - st.mtimeMs) / 86400000
    const permanent = f.startsWith(ANSWER_KEY_PREFIX) || keep.includes(f)
    return { file: f, size: st.size, ageDays: Math.floor(ageDays), permanent, expiring: !permanent && ageDays >= 53, week: (f.match(/^(\d{4}-W\d{2})/) || [])[1] || null }
  }).sort((a, b) => a.file.localeCompare(b.file))
}
export function purgeExpired() {
  const removed = []
  for (const o of listOriginals()) if (!o.permanent && o.ageDays >= 60) { fs.unlinkSync(path.join(DIRS.originals, o.file)); removed.push(o.file) }
  return removed
}
export const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex')

// ---------- 进度（PRD 5.5） ----------
export function computeProgress(weeks, knowledge, threshold = 0.1) {
  const all = weeks.map(readWeek)
  const baseline = all[0]?.week
  const perWeek = all.map(w => {
    const mistakes = {}; const weight = {}
    for (const e of w.entries) {
      if (e.verdict !== 'wrong') continue
      const key = `${e.knowledge_point}|${e.error_type}`
      mistakes[key] = (mistakes[key] || 0) + 1
      weight[key] = (weight[key] || 0) + (Number(e.source_weight) || 1)
    }
    return { week: w.week, attempts: w.attempts, mistakes, weight }
  })
  const combos = new Set(perWeek.flatMap(w => Object.keys(w.mistakes)))
  const rows = [...combos].map(key => {
    const [kp, error] = key.split('|')
    const series = perWeek.map(w => ({ week: w.week, attempts: w.attempts[kp] || 0, mistakes: w.mistakes[key] || 0, rate: w.attempts[kp] ? (w.mistakes[key] || 0) / w.attempts[kp] : null }))
    const last = series[series.length - 1]; const prev = series[series.length - 2]
    let state = '练习中'
    if (last.attempts === 0 && (!prev || prev.attempts === 0)) state = '未验证'
    else if (last.rate !== null && last.rate >= threshold) state = '需关注'
    else if (last.attempts > 0 && last.rate < threshold && prev && prev.attempts > 0 && prev.rate < threshold) state = '已改善'
    const node = knowledge.nodes.find(n => n.id === kp)
    const weight = perWeek[perWeek.length - 1].weight[key] || 0
    return { knowledge_point: kp, title: node?.title || kp, unit: node?.unitTitle || '', error_type: error, series, state, current: last, previous: baseline === last.week ? null : prev, weight }
  })
  // 排序用来源权重（试卷 > 学校练习 > 教辅），错误率本身不加权
  return { baseline, rows: rows.sort((a, b) => (b.weight - a.weight) || (b.current.rate ?? 0) - (a.current.rate ?? 0)) }
}
