// 只保存公开宠物图片；素材变更时递增版本，不接管页面、题目或 API。
const CACHE = 'mathfriend-pet-motion-v2'
// 与 pet-motion.js 的精简清单保持一致，测试逐项核对。
const BODY_GIFS = ['wag', 'eat', 'bath', 'ball', 'disc', 'walk', 'sleep', 'sleep-low']
const BODY_POSTERS = [...BODY_GIFS, 'idle', 'low-rest', 'think', 'proud']
const FACE_GIFS = ['think', 'proud'], FACE_POSTERS = ['idle', ...FACE_GIFS]
const FILES = [2, 3].flatMap(stage =>
  [[BODY_GIFS, '', 'gif'], [BODY_POSTERS, '', 'png'], [FACE_GIFS, '-face', 'gif'], [FACE_POSTERS, '-face', 'png']]
    .flatMap(([actions, suffix, ext]) => actions.map(action => `/pet/motion/s${stage}-${action}${suffix}.${ext}`)))
const allowed = new Set(FILES)
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('mathfriend-pet-motion-') && name !== CACHE) await caches.delete(name)
  await self.clients.claim()
})()))
async function load(cache, path) {
  const saved = await cache.match(path)
  if (saved) return saved
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(path, { signal: controller.signal })
    if (!response.ok || !/^image\/(gif|png)(;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('图片未下载完整')
    await cache.put(path, response.clone())
    return response
  } finally { clearTimeout(timeout) }
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !allowed.has(url.pathname) || [...url.searchParams.keys()].some(key => key !== 'play')) return
  event.respondWith((async () => {
    try { return await load(await caches.open(CACHE), url.pathname) }
    catch { return fetch(event.request) }
  })())
})
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache-motion' || !event.ports[0]) return
  const port = event.ports[0]
  event.waitUntil((async () => {
    let done = 0, failed = 0, next = 0
    try {
      const cache = await caches.open(CACHE)
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < FILES.length) {
          const path = FILES[next++]
          try { await load(cache, path) } catch { failed++ }
          done++; port.postMessage({ done, total: FILES.length, failed })
        }
      }))
      port.postMessage({ done, total: FILES.length, failed, complete: true })
    } catch { port.postMessage({ error: '无法保存缓存，请检查浏览器存储空间后重试。' }) }
    finally { port.close() }
  })())
})
