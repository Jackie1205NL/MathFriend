import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ListFilter } from 'lucide-react'
import type { Drill, State } from '../types'

type Dim = '知识点' | '错因' | '单元' | '来源'
type Scope = '本周' | '近四周' | '全部'
const DIMS: Dim[] = ['知识点', '错因', '单元', '来源']
const SCOPES: Scope[] = ['本周', '近四周', '全部']

interface Row {
  key: string; title: string; sub: string; drill: Drill
  mistakes: number; attempts: number | null
  perWeek: { week: string; mistakes: number }[]
  breakdown: { label: string; n: number; drill: Drill }[]
  state: string
}

export function ProgressPage({ state, onDrill }: { state: State; onDrill: (d: Drill) => void }) {
  const [dim, setDim] = useState<Dim>('知识点')
  const [scope, setScope] = useState<Scope>('全部')
  const [open, setOpen] = useState<string | null>(null)
  const node = (id: string) => state.knowledge.nodes.find(n => n.id === id)

  const { rows, weeks, totalMistakes } = useMemo(() => {
    const upto = state.weeks.filter(w => w <= state.week)
    const inScope = scope === '本周' ? upto.slice(-1) : scope === '近四周' ? upto.slice(-4) : upto
    const data = state.all.filter(w => inScope.includes(w.week))
    const entries = data.flatMap(w => w.entries.filter(e => e.verdict === 'wrong').map(e => ({ ...e, _week: w.week })))
    const attempts: Record<string, number> = {}
    data.forEach(w => Object.entries(w.attempts).forEach(([k, n]) => { attempts[k] = (attempts[k] || 0) + n }))
    const srcQuestions: Record<string, number> = {}
    data.forEach(w => w.materials.forEach(m => { const k = m.source.split(' ')[0]; srcQuestions[k] = (srcQuestions[k] || 0) + m.questions }))
    const unitOf = (kp: string) => node(kp)?.unit || kp.split('.')[0]
    const unitName = (u: string) => state.knowledge.units.find(x => x.id === u)?.title || u
    const stateOf = (kps: string[]) => {
      const rs = state.progress.rows.filter(r => kps.includes(r.knowledge_point))
      return rs.some(r => r.state === '需关注') ? '需关注' : rs.some(r => r.state === '练习中') ? '练习中'
        : rs.some(r => r.state === '已改善') ? '已改善' : rs.length ? '未验证' : ''
    }
    type E = typeof entries[0]
    // 每个维度：怎么分组、标题、分母、下钻看什么
    const spec = {
      知识点: {
        key: (e: E) => e.knowledge_point, title: (k: string) => node(k)?.title || k,
        sub: (k: string) => `${k} · ${node(k)?.unitTitle || '课外拓展'}`, denom: (k: string) => attempts[k] ?? null,
        drill: (k: string): Drill => ({ knowledge_point: k }),
        by: (e: E) => e.error_type, byDrill: (k: string, b: string): Drill => ({ knowledge_point: k, error_type: b }),
      },
      错因: {
        key: (e: E) => e.error_type, title: (k: string) => k, sub: () => '跨知识点统计', denom: () => null,
        drill: (k: string): Drill => ({ error_type: k }),
        by: (e: E) => node(e.knowledge_point)?.title || e.knowledge_point,
        byDrill: (k: string, b: string): Drill => ({ error_type: k, knowledge_point: state.knowledge.nodes.find(n => n.title === b)?.id }),
      },
      单元: {
        key: (e: E) => unitOf(e.knowledge_point), title: (k: string) => unitName(k), sub: (k: string) => `单元 ${k}`,
        denom: (k: string) => Object.entries(attempts).filter(([kp]) => unitOf(kp) === k).reduce((n, [, v]) => n + v, 0) || null,
        drill: (k: string): Drill => ({ unit: unitName(k) }),
        by: (e: E) => node(e.knowledge_point)?.title || e.knowledge_point,
        byDrill: (k: string, b: string): Drill => ({ knowledge_point: state.knowledge.nodes.find(n => n.title === b)?.id }),
      },
      来源: {
        key: (e: E) => e.source_name.split(' ')[0], title: (k: string) => k,
        sub: (k: string) => entries.find(e => e.source_name.split(' ')[0] === k)?.source_type || '',
        denom: (k: string) => srcQuestions[k] ?? null,
        drill: (k: string): Drill => ({ source: k }),
        by: (e: E) => e.error_type, byDrill: (k: string, b: string): Drill => ({ source: k, error_type: b }),
      },
    }[dim]
    const groups: Record<string, E[]> = {}
    entries.forEach(e => { const k = spec.key(e); (groups[k] ||= []).push(e) })
    const rows: Row[] = Object.entries(groups).map(([key, list]) => {
      const counts: Record<string, number> = {}
      list.forEach(e => { const b = spec.by(e); counts[b] = (counts[b] || 0) + 1 })
      return {
        key, title: spec.title(key), sub: spec.sub(key), drill: spec.drill(key),
        mistakes: list.length, attempts: spec.denom(key),
        perWeek: inScope.map(w => ({ week: w, mistakes: list.filter(e => e._week === w).length })),
        breakdown: Object.entries(counts).map(([label, n]) => ({ label, n, drill: spec.byDrill(key, label) })).sort((a, b) => b.n - a.n),
        state: dim === '知识点' || dim === '单元' ? stateOf([...new Set(list.map(e => e.knowledge_point))]) : '',
      }
    }).sort((a, b) => b.mistakes - a.mistakes)
    return { rows, weeks: inScope, totalMistakes: entries.length }
  }, [dim, scope, state]) // eslint-disable-line react-hooks/exhaustive-deps

  const covered = new Set(state.all.flatMap(w => Object.keys(w.attempts))).size
  const count = (s: string) => state.progress.rows.filter(r => r.state === s).length
  return <>
    <header className="page-header"><div><h1>学习进度</h1><p>换一个维度看同一批错题，点标题可以下钻到具体错题</p></div>
      <select className="period" value={scope} onChange={e => setScope(e.target.value as Scope)}>{SCOPES.map(s => <option key={s}>{s}</option>)}</select></header>
    <section className="progress-overview">
      <div><span>已覆盖知识点</span><strong>{covered} / {state.knowledge.nodes.length}</strong><small>本学期</small></div>
      <div><span>需关注</span><strong>{count('需关注')}</strong><small>进入辅导单</small></div>
      <div><span>已改善</span><strong>{count('已改善')}</strong><small>连续两周达标</small></div>
      <div><span>未验证</span><strong>{count('未验证')}</strong><small>近两周没出现</small></div>
    </section>
    <div className="seg">{DIMS.map(d => <button key={d} className={dim === d ? 'active' : ''} onClick={() => { setDim(d); setOpen(null) }}>按{d}</button>)}</div>
    <section className="progress-table">
      <div className="section-heading"><div><h2>按{dim}统计</h2><p>{weeks.length ? `${weeks[0]}${weeks.length > 1 ? ` 至 ${weeks.at(-1)}` : ''} · 共 ${totalMistakes} 道错题` : '这段时间还没有材料'}</p></div></div>
      <div className="p-row p-head"><span>{dim}</span><span>错题</span><span>{dim === '错因' ? '占比' : '题量'}</span><span>{dim === '错因' ? '' : '错误率'}</span><span>近几周</span><span>{dim === '知识点' || dim === '单元' ? '判断' : '主要细分'}</span><span></span></div>
      {rows.map(r => {
        const rate = r.attempts ? r.mistakes / r.attempts : null
        return <div key={r.key}>
          <div className="p-row">
            <span className="p-name" onClick={() => setOpen(open === r.key ? null : r.key)}><small>{r.sub}</small><strong>{open === r.key ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {r.title}</strong></span>
            <span>{r.mistakes}</span>
            <span>{dim === '错因' ? `${totalMistakes ? Math.round(r.mistakes / totalMistakes * 100) : 0}%` : r.attempts ?? '—'}</span>
            <span>{rate === null ? '—' : <><i style={{ '--rate': `${Math.round(rate * 100)}%` } as React.CSSProperties}></i>{Math.round(rate * 100)}%</>}</span>
            <span className="spark">{r.perWeek.slice(-4).map(p => <b key={p.week} title={`${p.week} 错 ${p.mistakes} 道`} className={p.mistakes > 2 ? 'bad' : p.mistakes ? 'mid' : 'none'} />)}</span>
            <span>{r.state ? <span className={`state ${r.state}`}>{r.state}</span> : <em className="muted">{r.breakdown[0]?.label}</em>}</span>
            <span><button className="text-button" onClick={() => onDrill(r.drill)}><ListFilter size={14} />看错题</button></span>
          </div>
          {open === r.key && <div className="row-detail">{r.breakdown.map(b => <button key={b.label} onClick={() => onDrill(b.drill)}><b>{b.label}</b>{b.n} 道</button>)}</div>}
        </div>
      })}
      {!rows.length && <div className="p-row"><span>这段时间没有错题</span></div>}
    </section>
  </>
}
