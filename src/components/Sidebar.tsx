import type { PageId } from '../types'
import { navIcons, Settings } from './Icons'

const navLabels: Record<Exclude<PageId, 'settings'>, string> = { week: '本周辅导', progress: '学习进度', mistakes: '错题本', knowledge: '知识点' }
interface Props { page: PageId; onChange: (page: PageId) => void }

export function Sidebar({ page, onChange }: Props) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">数伴</div><p>三年级家长数学教陪助手</p></div>
    <nav aria-label="主导航">
      {(Object.keys(navLabels) as (keyof typeof navLabels)[]).map(id => {
        const Icon = navIcons[id]
        return <button aria-label={navLabels[id]} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => onChange(id)} key={id}>
          <Icon size={20} strokeWidth={1.8} /><span>{navLabels[id]}</span>
        </button>
      })}
    </nav>
    <div className="sidebar-note">陪孩子学数学，<br />少走弯路，<br />每天进步一点点。</div>
    <button className={`nav-item settings ${page === 'settings' ? 'active' : ''}`} onClick={() => onChange('settings')}><Settings size={20} /><span>设置</span></button>
  </aside>
}
