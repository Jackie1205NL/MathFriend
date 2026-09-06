import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { KnowledgePage } from './pages/KnowledgePage'
import { MistakesPage } from './pages/MistakesPage'
import { ProgressPage } from './pages/ProgressPage'
import { SettingsPage } from './pages/SettingsPage'
import { WeekPage } from './pages/WeekPage'
import { api, AuthError } from './api'
import type { Drill, PageId, State } from './types'

export default function App() {
  const [page, setPage] = useState<PageId>('week')
  const [state, setState] = useState<State | null>(null)
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const [busy, setBusy] = useState('')
  const [fatal, setFatal] = useState('')
  const [toast, setToast] = useState('')
  const notify = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 5000) }

  const refresh = useCallback(async (week?: string) => {
    try { setState(await api.state(week ?? state?.week)); setAuthed(true); setFatal('') }
    catch (e) { if (e instanceof AuthError) { setAuthed(false); setFatal('') } else { notify((e as Error).message); setFatal((e as Error).message) } }
  }, [state?.week])
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { refresh() }, [])

  if (authed === false) return <Login onDone={() => refresh()} />
  if (!state) return <div className="loading">
    {fatal ? <>
      <p className="error">连不上后端服务：{fatal}</p>
      <p>数伴的数据在你自己的电脑上，需要在本机运行 <code>npm run start</code> 后访问 http://localhost:5174 。纯静态托管（如 Netlify）没有后端，无法读取错题与辅导单。</p>
      <button className="button primary" onClick={() => refresh()}>重试</button>
    </> : '正在读取…'}
  </div>
  return <div className="app-shell">
    <Sidebar page={page} onChange={p => { if (p !== 'mistakes') setDrill(null); setPage(p) }} />
    <main className="main-content">
      {page === 'week' && <WeekPage state={state} onWeek={w => refresh(w)} onSheet={async () => {
        setBusy('正在生成辅导单…')
        try { await api.buildSheet(state.week); await refresh(); window.open(api.sheetUrl(state.week)) } catch (e) { notify((e as Error).message) } finally { setBusy('') }
      }} />}
      {page === 'progress' && <ProgressPage state={state} onDrill={d => { setDrill(d); setPage('mistakes') }} />}
      {page === 'mistakes' && <MistakesPage key={JSON.stringify(drill)} state={state} drill={drill} />}
      {page === 'knowledge' && <KnowledgePage state={state} />}
      {page === 'settings' && <SettingsPage state={state} onChanged={() => refresh()} notify={notify} />}
    </main>
    {busy && <div className="toast busy"><span className="spinner" />{busy}</div>}
    {toast && !busy && <div className="toast">{toast}</div>}
  </div>
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await api.login(pw); onDone() } catch (x) { setErr((x as Error).message) } }
  return <form className="login" onSubmit={submit}>
    <div className="brand-mark">数伴</div>
    <p>三年级家长数学教陪助手</p>
    <input type="password" autoFocus placeholder="家庭密码" value={pw} onChange={e => setPw(e.target.value)} />
    {err && <small className="error">{err}</small>}
    <button className="button primary" type="submit">进入</button>
  </form>
}
