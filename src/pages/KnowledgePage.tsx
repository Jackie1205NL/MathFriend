import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { KnowledgeNode, State } from '../types'

type Sort = '按目录顺序' | '按最近学习'

export function KnowledgePage({ state }: { state: State }) {
  const { knowledge, progress } = state
  const preview = state.data.preview
  const [sort, setSort] = useState<Sort>('按目录顺序')
  const units = knowledge.units.filter(u => knowledge.nodes.some(n => n.unit === u.id))
  const [open, setOpen] = useState<string[]>(units.slice(0, 1).map(u => u.id))
  const [detail, setDetail] = useState<string | null>(null)
  const toggle = (u: string) => setOpen(open.includes(u) ? open.filter(x => x !== u) : [...open, u])

  // 每个知识点最近一次出现在哪一周（有题量就算学过），用来判断哪些是最新学的
  const lastWeek: Record<string, string> = {}
  state.all.forEach(w => Object.entries(w.attempts).forEach(([k, n]) => { if (n > 0 && (!lastWeek[k] || w.week > lastWeek[k])) lastWeek[k] = w.week }))
  const stateOf = (id: string) => {
    const rows = progress.rows.filter(r => r.knowledge_point === id)
    return rows.some(r => r.state === '需关注') ? '需关注' : rows.some(r => r.state === '练习中') ? '练习中'
      : rows.some(r => r.state === '已改善') ? '已改善' : rows.length ? '未验证' : ''
  }
  // 先按最近做题的周，再按课程顺序倒序（越靠后的单元越新）
  const recent = [...knowledge.nodes].sort((a, b) => (lastWeek[b.id] || '').localeCompare(lastWeek[a.id] || '') || b.id.localeCompare(a.id))

  const card = (k: KnowledgeNode, showUnit = false) => <article key={k.id} onClick={() => setDetail(detail === k.id ? null : k.id)}>
    <span className="kp-id">{k.id}</span>
    <div>
      <h3>{k.title}
        {preview.includes(k.id) && <em className="tag-preview">下周预习</em>}
        {lastWeek[k.id] ? <em className="tag-week">最近 {lastWeek[k.id]}</em> : <em className="tag-week none">还没做过题</em>}
        {k.manual && <small> 手工维护</small>}</h3>
      {showUnit && <p className="kp-unit">{k.unitTitle}</p>}
      <p>{k.core}</p>
      {detail === k.id && <dl className="kp-detail"><dt>典型例题</dt><dd>{k.example}</dd><dt>引导方式</dt><dd>{k.guide}</dd><dt>常见错因</dt><dd>{k.pitfalls}</dd></dl>}
    </div>
    {stateOf(k.id) && <span className={`state ${stateOf(k.id)}`}>{stateOf(k.id)}</span>}
  </article>

  return <><header className="page-header"><div><h1>知识点</h1><p>苏教版三年级上册 · 默认只展示核心内容，点开看例题、引导方式和常见错因</p></div>
    <select className="period" value={sort} onChange={e => setSort(e.target.value as Sort)}>{(['按目录顺序', '按最近学习'] as Sort[]).map(s => <option key={s}>{s}</option>)}</select></header>
    {sort === '按最近学习'
      ? <section className="progress-table"><div className="section-heading"><div><h2>按最近学习排序</h2><p>做过题的知识点排在前面，最近一周做过的最靠上</p></div></div>
        <div className="knowledge-items flat">{recent.map(k => card(k, true))}</div></section>
      : <section className="knowledge-layout">
        <aside><h3>本册目录</h3>{units.map(u => <button className={open.includes(u.id) ? 'active' : ''} onClick={() => toggle(u.id)} key={u.id}>{open.includes(u.id) ? <ChevronDown size={17} /> : <ChevronRight size={17} />} {u.id} {u.title}</button>)}</aside>
        <div className="knowledge-content">{units.map(u => <section key={u.id}>
          <button className="unit-title" onClick={() => toggle(u.id)}><span>{u.id} {u.title}</span><small>{knowledge.nodes.filter(k => k.unit === u.id).length} 个知识点</small>{open.includes(u.id) ? <ChevronDown /> : <ChevronRight />}</button>
          {open.includes(u.id) && <div className="knowledge-items">{knowledge.nodes.filter(k => k.unit === u.id).map(k => card(k))}</div>}
        </section>)}</div>
      </section>}
  </>
}
