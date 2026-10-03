import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileDown, FileText, Sprout } from 'lucide-react'
import type { State } from '../types'
import { TrendChart } from '../components/TrendChart'
import { api } from '../api'

interface Props { state: State; onWeek: (week: string) => void }

export function WeekPage({ state, onWeek }: Props) {
  const { data, focus, knowledge, progress } = state
  const total = Object.values(data.attempts).reduce((a, b) => a + b, 0)
  const wrong = data.entries.filter(e => e.verdict === 'wrong').length
  const doubt = data.entries.filter(e => e.grade_conflict).length
  const attention = progress.rows.filter(r => r.state === '需关注').length
  const practiceCount = data.practice.reduce((n, s) => n + s.items.length, 0)
  const previewNodes = data.preview.map(id => knowledge.nodes.find(n => n.id === id)).filter(Boolean)
  const weeks = [...new Set([...state.weeks, state.current])].sort()
  const at = weeks.indexOf(state.week)
  return <>
    <header className="page-header"><div><h1>{state.week === state.current ? '本周辅导' : '往期辅导'}</h1><p className="week-nav">
      <button className="icon-button" disabled={at <= 0} onClick={() => onWeek(weeks[at - 1])} aria-label="上一周"><ChevronLeft size={16} /></button>
      <select className="week-select" value={state.week} onChange={e => onWeek(e.target.value)}>{[...weeks].reverse().map(w => <option key={w} value={w}>{w}{w === state.current ? '（本周）' : ''}{state.weeks.includes(w) ? '' : '（无材料）'}</option>)}</select>
      <button className="icon-button" disabled={at >= weeks.length - 1} onClick={() => onWeek(weeks[at + 1])} aria-label="下一周"><ChevronRight size={16} /></button>
      {progress.baseline === state.week && ' · 起点周'}</p></div>
      <div className="header-actions">{state.sheet && <a className="button primary" href={api.sheetUrl(state.week)} target="_blank" rel="noreferrer"><FileDown size={18} />下载辅导单</a>}{state.kidPack && <a className="button" href={api.kidPackUrl(state.week)} download title="在孩子端用管理员账号「导入题库」"><FileDown size={18} />下载孩子端题库</a>}</div></header>
    <section className="summary ruled">
      <div className="summary-title"><span>本周学习概览</span></div>
      <dl><div><dt>材料</dt><dd>{data.materials.length}<small>份</small></dd></div><div><dt>题目</dt><dd>{total}<small>道</small></dd></div><div><dt>错题</dt><dd>{wrong}<small>道</small></dd></div><div><dt>批改存疑</dt><dd className={doubt ? 'amber' : ''}>{doubt}<small>道</small></dd></div><div><dt>需关注</dt><dd className={attention ? 'amber' : ''}>{attention}<small>项</small></dd></div><div><dt>练习题</dt><dd>{practiceCount}<small>道</small></dd></div></dl>
      <span className="summary-hint">{state.inbox.length ? `inbox 里有 ${state.inbox.length} 个文件待归集，在 Claude Code 里运行 /weekly` : practiceCount ? '练习卷已在辅导单里，可直接打印' : '确认重点后运行 /weekly sheet 出练习题'}</span>
    </section>
    <div className="week-grid">
      <section className="plan-panel">
        <div className="section-heading"><div><h2>重点问题</h2><p>{focus.length ? `建议先关注以下问题，预计共 ${focus.reduce((n, _, i) => n + (i === 0 ? 15 : 10), 0)} 分钟` : state.weeks.includes(state.week) ? '这一周没有需要重点辅导的问题' : '这一周还没有归集材料'}</p></div></div>
        {focus.map((f, i) => {
          const entry = data.entries.find(e => e.id === f.entries[0])
          const node = knowledge.nodes.find(n => n.id === f.knowledge_point)
          return <article className="coach-item" key={`${f.knowledge_point}-${f.error_type}`}>
            <span className="coach-number">{i + 1}</span>
            <div className="coach-body"><div className="coach-title"><h3>{f.title}</h3><span>{f.error_type}</span><small>本周 {f.current.mistakes}/{f.current.attempts || '-'}{f.previous?.attempts ? ` · 上周 ${f.previous.mistakes}/${f.previous.attempts}` : ''}</small></div>
              <p>{entry?.analysis || node?.pitfalls}</p>
              {entry && <img className="coach-image" src={api.image(state.week, entry.id)} alt="" onError={e => (e.currentTarget.hidden = true)} />}
              <div className="prompt"><label>可以这样讲</label>{node?.guide || '先让孩子讲一遍自己的思路，再一起找出错的那一步。'}{entry?.coach_prompt && <><br />“{entry.coach_prompt}”</>}</div></div>
            <div className="duration"><Clock3 size={18} /><span>建议时长</span><strong>{i === 0 ? 15 : 10}<small>分钟</small></strong></div>
          </article>
        })}
        <footer className="tip"><span>💡</span>先理解，再练习。孩子能讲清楚思路，比多做几道题更重要。</footer>
      </section>
      <TrendChart all={state.all} />
    </div>
    {previewNodes.length > 0 && <section className="preview-panel">
      <div className="section-heading"><div><h2><Sprout size={18} /> 下周预习</h2><p>课本进度已经跑在课堂前面，先带孩子看这几个点</p></div></div>
      <div className="preview-list">{previewNodes.map(n => <article key={n!.id}><h3><span className="kp-id">{n!.id}</span>{n!.title}</h3><p>{n!.core}</p>{n!.guide && n!.guide !== '待补充' && <p className="observation"><strong>怎么讲：</strong>{n!.guide}</p>}</article>)}</div>
    </section>}
    {data.bank && <section className="materials-panel">
      <div className="section-heading"><div><h2>孩子端题库</h2><p>{data.bank.templates.length} 个模板 · 每天约 {data.bank.groups.reduce((n, g) => n + (g.daily || 0), 0)} 题 · 调节项用 npm run kid tune 改，改完要 push</p></div></div>
      <div className="material-table"><div className="table-row table-head"><span>分组</span><span>来源</span><span>每天</span><span>模板</span></div>
        {data.bank.groups.map(g => { const ts = data.bank!.templates.filter(t => t.group === g.id); return <div className="table-row" key={g.id}><span className="file-name">{g.name} · {[...new Set(ts.map(t => `${t.knowledge_point} ${t.error_type}`))].join('、')}</span><span>{g.bucket}{ts.some(t => t.from) ? ' · 往周带入' : ''}</span><span>{g.daily} 题</span><span>{ts.length} 个</span></div> })}
        <div className="table-row"><span className="file-name">调节项：{Object.entries(data.bank.tuning || {}).map(([k, v]) => `${k}=${v}`).join('，') || '默认'}</span></div>
      </div>
      {!!data.screen?.length && <div className="material-table"><div className="table-row table-head"><span>屏幕练习（不计入错误率）</span><span>第一次就对</span><span>忘写单位</span><span>难度档</span></div>
        {data.screen.map(r => <div className="table-row" key={`${r.knowledge_point}-${r.error_type}`}><span className="file-name">{knowledge.nodes.find(n => n.id === r.knowledge_point)?.title || r.knowledge_point} · {r.error_type}</span><span>{r.first_ok}/{r.items}（{Math.round(r.first_ok / r.items * 100)}%）</span><span>{r.forgot_unit || '—'}</span><span>{r.level || '—'}{r.moved?.dir === 'down' ? ' ↓ 需要讲一讲' : r.moved?.dir === 'up' ? ' ↑' : ''}</span></div>)}
      </div>}
    </section>}
    <section className="materials-panel">
      <div className="section-heading"><div><h2>材料</h2><p>原件保存 60 天后自动删除，截图和记录永久保留</p></div></div>
      <div className="material-table"><div className="table-row table-head"><span>文件</span><span>类型 · 来源</span><span>题目数</span><span>状态</span></div>
        {data.materials.map(m => <div className="table-row" key={`${m.file}-${m.source}`}><span className="file-name"><FileText size={17} />{m.file}</span><span>{m.type} · {m.source}{m.score && ` · ${m.score}`}</span><span>{m.questions || '—'}</span><span className="status done"><CheckCircle2 size={14} /> 已入库</span></div>)}
        {!data.materials.length && <div className="table-row"><span className="file-name">这一周还没有材料</span></div>}
      </div>
    </section>
  </>
}
