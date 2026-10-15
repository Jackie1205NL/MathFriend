// 同一孩子同一天固定抽样，刷新和切换设备不会增加录制题目。
const hash = value => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const priority = format => ['word', 'plan', 'multistep'].includes(format) ? 0 : ['data', 'stat'].includes(format) ? 1 : 2
export function recordingPlan(items, date, user) {
  const seed = `${user}:${date}:practice-video`, limit = 2 + hash(seed) % 2
  const candidates = [...new Map(items.map(it => [it.id, it])).values()]
  candidates.sort((a, b) => priority(a.format) - priority(b.format) || hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`) || a.id.localeCompare(b.id))
  return { limit, items: candidates.slice(0, limit).map(it => it.id) }
}
