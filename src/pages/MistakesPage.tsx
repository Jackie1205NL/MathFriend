import { Search, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { ERROR_TYPES, type Drill, type Mistake, type State } from '../types'

type Group = '知识点' | '周' | '错因' | '来源' | '不分组'
type Sort = '最近做的在前' | '最早做的在前' | '按知识点' | '按错因'
const GROUPS: Group[] = ['知识点', '周', '错因', '来源', '不分组']
const SORTS: Sort[] = ['最近做的在前', '最早做的在前', '按知识点', '按错因']
const ALL = '全部'
const day = (d: string) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[1]}月${+m[2]}日` : '' }

export function MistakesPage({ state, drill }: { state: State; drill?: Drill | null }) {
  const [query, setQuery] = useState('')
  const [err, setErr] = useState<string>(drill?.error_type || ALL)
  const [kp, setKp] = useState(drill?.knowledge_point || ALL)
  const [unit, setUnit] = useState(drill?.unit || ALL)
  const [source, setSource] = useState(drill?.source || ALL)
  const [week, setWeek] = useState(ALL)
  const [onlyDoubt, setOnlyDoubt] = useState(false)
  const [group, setGroup] = useState<Group>(drill ? '周' : '知识点')
  const [sort, setSort] = useState<Sort>('最近做的在前')
  const node = (id: string) => state.knowledge.nodes.find(n => n.id === id)
  const kpName = (id: string) => `${id} ${node(id)?.title || ''}`.trim()

  const all = state.all.flatMap(w => w.entries).filter(m => m.verdict === 'wrong' || m.grade_conflict)
  const units = [...new Set(all.map(m => node(m.knowledge_point)?.unitTitle || '课外拓展'))]
  const sources = [...new Set(all.map(m => m.source_name.split(' ')[0]))]
  const kps = [...new Set(all.map(m => m.knowledge_point))].sort()

  const shown = all.filter(m =>
    (err === ALL || m.error_type === err) &&
    (kp === ALL || m.knowledge_point === kp) &&
    (unit === ALL || (node(m.knowledge_point)?.unitTitle || '课外拓展') === unit) &&
    (source === ALL || m.source_name.split(' ')[0] === source) &&
    (week === ALL || m.week === week) &&
    (!onlyDoubt || m.grade_conflict) &&
    `${m.problem}${m.knowledge_point}${node(m.knowledge_point)?.title || ''}${m.error_type}${m.source_name}`.includes(query))

  const byDate = (a: Mistake, b: Mistake) => `${b.date}${b.week}${b.id}`.localeCompare(`${a.date}${a.week}${a.id}`)
  const sorted = [...shown].sort(sort === '最近做的在前' ? byDate : sort === '最早做的在前' ? (a, b) => -byDate(a, b)
    : sort === '按知识点' ? (a, b) => a.knowledge_point.localeCompare(b.knowledge_point) || byDate(a, b)
      : (a, b) => a.error_type.localeCompare(b.error_type) || byDate(a, b))

  const keyOf = (m: Mistake) => group === '知识点' ? kpName(m.knowledge_point)
    : group === '周' ? m.week : group === '错因' ? m.error_type : group === '来源' ? m.source_name : ''
  const grouped = sorted.reduce<Record<string, Mistake[]>>((g, m) => { (g[keyOf(m)] ||= []).push(m); return g }, {})
  const dirty = err !== ALL || kp !== ALL || unit !== ALL || source !== ALL || week !== ALL || onlyDoubt || !!query
  const reset = () => { setErr(ALL); setKp(ALL); setUnit(ALL); setSource(ALL); setWeek(ALL); setOnlyDoubt(false); setQuery('') }

  return <>
    <header className="page-header"><div><h1>错题本</h1><p>{drill ? '从学习进度下钻过来的结果，可以继续调整筛选' : '保留孩子当时的思路，辅导时有据可循'}</p></div>
      <div className="search"><Search size={17} /><input aria-label="搜索错题" placeholder="搜索题目、知识点或来源" value={query} onChange={e => setQuery(e.target.value)} /></div></header>

    <div className="filter-line">{[ALL, ...ERROR_TYPES].map(label => {
      const n = label === ALL ? all.length : all.filter(m => m.error_type === label).length
      return <button key={label} disabled={!n} className={err === label ? 'active' : ''} onClick={() => setErr(label)}>{label === ALL ? '全部错题' : label}<em>{n}</em></button>
    })}</div>

    <div className="filter-bar">
      <label>知识点<select value={kp} onChange={e => setKp(e.target.value)}><option>{ALL}</option>{kps.map(k => <option key={k} value={k}>{kpName(k)}</option>)}</select></label>
      <label>单元<select value={unit} onChange={e => setUnit(e.target.value)}><option>{ALL}</option>{units.map(u => <option key={u}>{u}</option>)}</select></label>
      <label>来源<select value={source} onChange={e => setSource(e.target.value)}><option>{ALL}</option>{sources.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>周<select value={week} onChange={e => setWeek(e.target.value)}><option>{ALL}</option>{state.weeks.map(w => <option key={w}>{w}</option>)}</select></label>
      <label>排序<select value={sort} onChange={e => setSort(e.target.value as Sort)}>{SORTS.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>分组<select value={group} onChange={e => setGroup(e.target.value as Group)}>{GROUPS.map(g => <option key={g}>{g}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={onlyDoubt} onChange={e => setOnlyDoubt(e.target.checked)} />只看批改存疑</label>
      <span className="count">共 {shown.length} 道</span>
      {dirty && <button className="text-button" onClick={reset}><X size={14} />清除筛选</button>}
    </div>

    {Object.entries(grouped).map(([key, list]) => <section key={key} className="mistake-group">
      {group !== '不分组' && <h2 className="group-title">{key}<em>{list.length} 道</em></h2>}
      <div className="mistake-list">{list.map(m => <article key={`${m.week}-${m.id}`}>
        <div className="mistake-meta"><time>{day(m.date)}</time><span>{m.source_name}</span>{group !== '知识点' && <span>{node(m.knowledge_point)?.title || m.knowledge_point}</span>}<b>{m.error_type}</b>
          {m.grade_conflict && <i>批改存疑</i>}{m.verdict === 'correct' && m.ai_verdict === 'wrong' && <i>老师打勾但算错了</i>}{m.corrected_answer && <i>已订正</i>}{m.ahead && <i>超前</i>}</div>
        <img src={api.image(m.week, m.id)} alt="" onError={e => (e.currentTarget.hidden = true)} />
        <h3>{m.problem}</h3>
        <div className="answer-compare"><p><small>孩子答案</small>{m.student_answer}{m.corrected_answer && <small> 订正 {m.corrected_answer}</small>}</p><p><small>正确答案</small>{m.correct_answer}</p></div>
        {m.analysis && <p className="observation"><strong>卡点：</strong>{m.analysis}</p>}
      </article>)}</div>
    </section>)}
    {!shown.length && <p className="observation">没有符合条件的错题。</p>}
  </>
}
