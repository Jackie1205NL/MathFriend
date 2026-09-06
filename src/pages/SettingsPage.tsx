import type { State } from '../types'

export function SettingsPage({ state, onChanged, notify }: { state: State; onChanged: () => void; notify: (m: string) => void }) {
  void onChanged; void notify
  return <><header className="page-header"><div><h1>设置</h1><p>这是家庭成员的只读查看站。每周归集、生成辅导单和更改家庭密码仍在主辅导家长的电脑上完成，更新后重新发布即可同步给全家。</p></div></header>
    <section className="materials-panel">
      <div className="section-heading"><div><h2>原件</h2><p>60 天后自动删除，参考答案和标记保留的文件除外；到期前一周在这里提示</p></div></div>
      <div className="material-table"><div className="table-row table-head"><span>文件</span><span>大小</span><span>已保存</span></div>
        {state.originals.map(o => <div className="table-row" key={o.file}><span className="file-name">{o.file}</span><span>{(o.size / 1024 / 1024).toFixed(1)} MB</span><span className={o.expiring ? 'status pending' : 'status'}>{o.ageDays} 天{o.expiring && ' · 即将删除'}{o.permanent && ' · 永久保留'}</span></div>)}
        {!state.originals.length && <div className="table-row"><span className="file-name">还没有原件</span></div>}
      </div>
    </section></>
}
