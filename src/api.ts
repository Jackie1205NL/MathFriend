import type { Settings, State } from './types'

export class AuthError extends Error {}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (res.status === 401) throw new AuthError('未登录')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `请求失败 ${res.status}`)
  return body as T
}

export const api = {
  login: (password: string) => call<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  state: (week?: string) => call<State>(`/api/state${week ? `?week=${week}` : ''}`),
  saveSettings: (patch: Partial<Settings> & { password?: string }) => call<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  keep: (file: string) => call<{ keep: string[] }>(`/api/keep/${encodeURIComponent(file)}`, { method: 'POST' }),
  image: (week: string, id: string) => `/attachments/images/${week}/${id}.png`,
  sheetUrl: (week: string) => `/attachments/sheets/${week}.pdf`,
}
