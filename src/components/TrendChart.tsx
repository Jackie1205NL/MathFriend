import type { WeekData } from '../types'

/** 近四周错误率：错题数 ÷ 各知识点题量之和。 */
export function TrendChart({ all }: { all: WeekData[] }) {
  const points = all.slice(-4).map(w => {
    const total = Object.values(w.attempts).reduce((a, b) => a + b, 0)
    const wrong = w.entries.filter(e => e.verdict === 'wrong').length
    return { week: w.week, rate: total ? Math.round(wrong / total * 100) : null }
  })
  const xs = points.map((_, i) => 30 + i * (220 / Math.max(1, points.length - 1)))
  const y = (r: number | null) => 92 - (r ?? 0) * 0.7
  const line = points.map((p, i) => p.rate === null ? null : `${xs[i]},${y(p.rate)}`).filter(Boolean).join(' ')
  const first = points.find(p => p.rate !== null)?.rate; const last = [...points].reverse().find(p => p.rate !== null)?.rate
  return <div className="trend-chart">
    <div className="chart-head"><h3>错误率趋势</h3><span>近 {points.length} 周</span></div>
    <svg viewBox="0 0 280 118" role="img" aria-label="近几周错误率">
      {[25, 55, 85].map(g => <line key={g} x1="18" x2="264" y1={g} y2={g} className="grid-line" />)}
      {line && <polyline points={line} className="trend-line" />}
      {points.map((p, i) => <g key={p.week}>{p.rate !== null && <circle cx={xs[i]} cy={y(p.rate)} r="4" />}<text x={xs[i]} y={110} textAnchor="middle">{p.week.slice(5)}</text>{p.rate !== null && <text x={xs[i]} y={y(p.rate) - 10} textAnchor="middle" className="value">{p.rate}%</text>}</g>)}
    </svg>
    <p className="chart-note">{points.length < 2 || first == null || last == null ? '至少两周数据后才显示趋势' : last < first ? '整体在进步' : last > first ? '错误率上升，看看本周重点' : '与之前持平'}</p>
  </div>
}
