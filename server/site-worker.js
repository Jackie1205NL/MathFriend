const encoder = new TextEncoder()

const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const cookies = request => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(value => value.trim().split('=')))
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
const unauthorized = () => json({ error: '请先登录' }, 401)

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const password = env.FAMILY_PASSWORD
    if (!password) return new Response('网站尚未完成家庭密码设置。', { status: 503 })
    const session = await digest(`shuban:${password}`)

    if (url.pathname === '/api/login' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      if (body.password !== password) return json({ error: '密码不对' }, 401)
      return json({ ok: true }, 200, { 'set-cookie': `sb=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${86400 * 90}` })
    }

    if (url.pathname === '/api/state' && request.method === 'GET') {
      if (cookies(request).sb !== session) return unauthorized()
      const data = await env.ASSETS.fetch(new Request(new URL('/site-data.json', request.url)))
      if (!data.ok) return json({ error: '学习数据暂不可用' }, 503)
      const state = await data.json()
      const selected = url.searchParams.get('week')
      if (selected && state.weeks.includes(selected)) {
        state.week = selected
        state.data = state.all.find(item => item.week === selected) || state.data
        state.sheet = await env.ASSETS.fetch(new Request(new URL(`/attachments/sheets/${selected}.pdf`, request.url), { method: 'HEAD' })).then(result => result.ok)
      }
      return json(state)
    }

    if (url.pathname.startsWith('/api/')) return unauthorized()
    const assetRequest = request.method === 'GET' && request.headers.get('accept')?.includes('text/html')
      ? new Request(new URL('/index.html', request.url), request)
      : request
    return env.ASSETS.fetch(assetRequest)
  },
}
