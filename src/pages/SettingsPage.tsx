import { useState } from 'react'
import { api } from '../api'
import type { State } from '../types'

export function SettingsPage({ state, onChanged, notify }: { state: State; onChanged: () => void; notify: (m: string) => void }) {
  const [password, setPassword] = useState('')
  const save = async () => { try { await api.saveSettings({ password: password || undefined }); setPassword(''); notify('设置已保存'); onChanged() } catch (e) { notify((e as Error).message) } }
  const keep = async (file: string) => { await api.keep(file); onChanged() }
  return <><header className="page-header"><div><h1>设置</h1><p>新材料放进 inbox 后，在 Claude Code 里运行 /weekly 归集，再运行 /weekly sheet 出练习题</p></div></header>
    <section className="settings-form review-form">
      <label>家庭密码（留空不改）</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <p className="preview-note">数据目录里的 inbox、原件、错题、知识点.md、辅导单 都是普通文件，可以直接打开查看。</p>
      <div className="review-actions"><button className="button primary" onClick={save}>保存设置</button></div>
    </section>
    <section className="materials-panel">
      <div className="section-heading"><div><h2>原件</h2><p>60 天后自动删除，参考答案和标记保留的文件除外；到期前一周在这里提示</p></div></div>
      <div className="material-table"><div className="table-row table-head"><span>文件</span><span>大小</span><span>已保存</span><span>操作</span></div>
        {state.originals.map(o => <div className="table-row" key={o.file}><span className="file-name">{o.file}</span><span>{(o.size / 1024 / 1024).toFixed(1)} MB</span><span className={o.expiring ? 'status pending' : 'status'}>{o.ageDays} 天{o.expiring && ' · 即将删除'}{o.permanent && ' · 永久保留'}</span><span>{!o.file.startsWith('参考答案_') && <button className="text-button" onClick={() => keep(o.file)}>{state.settings.keep.includes(o.file) ? '取消保留' : '标记保留'}</button>}</span></div>)}
        {!state.originals.length && <div className="table-row"><span className="file-name">还没有原件</span></div>}
      </div>
    </section></>
}
