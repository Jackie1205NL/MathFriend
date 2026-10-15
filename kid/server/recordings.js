// 视频按账号隔离，分块存储；不会混进答题 JSON 或公开静态目录。
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error }
const validId = id => /^[a-f0-9-]{36}$/.test(id || '')
export function recordings(store) {
  const index = async () => (await store.get('recordings:index')) || []
  const read = async id => {
    if (!validId(id)) fail('录像不存在', 404)
    const meta = await store.get(`recording:${id}`)
    if (!meta) fail('录像不存在', 404)
    if (meta.deleted) fail('录像已被管理员删除', 410)
    return meta
  }
  return {
    list: async () => (await Promise.all((await index()).map(id => store.get(`recording:${id}`)))).filter(Boolean).reverse(),
    read,
    async start({ clientId, item, title, date, mime, duration }) {
      if (!['video/webm', 'video/mp4'].includes(mime)) fail('不支持的视频格式')
      if (!Number.isFinite(duration) || duration < 0 || duration > 180000) fail('录像片段过长')
      if (clientId && !validId(clientId)) fail('录像标识无效')
      const id = clientId || crypto.randomUUID(), existing = await store.get(`recording:${id}`)
      if (existing?.deleted) fail('录像已被管理员删除', 410)
      if (existing) {
        if (existing.item !== item || existing.date !== date || existing.mime !== mime) fail('录像标识与原片段不匹配', 409)
        const ids = await index(); if (!ids.includes(id)) await store.set('recordings:index', [...ids, id]); return existing
      }
      const ids = await index(); if (ids.length >= 200) fail('录像空间已满，请管理员下载并删除旧片段', 409)
      const meta = { id, item, title: String(title || item).slice(0, 200), date, mime, duration, created: new Date().toISOString(), count: 0, ready: false }
      await store.set(`recording:${id}`, meta); await store.set('recordings:index', [...ids, id]); return meta
    },
    async chunk(id, n, data) {
      const meta = await read(id)
      if (meta.ready) fail('录像已经保存', 409)
      if (!Number.isInteger(n) || n < 0 || n >= 128 || typeof data !== 'string' || !data.length || data.length > 262144 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) fail('视频分块无效')
      await store.set(`recording:${id}:${n}`, data)
      await store.set(`recording:${id}`, { ...meta, count: Math.max(meta.count, n + 1) }); return { ok: true }
    },
    async finish(id, count) {
      const meta = await read(id)
      if (meta.ready) return meta
      if (!Number.isInteger(count) || count < 1 || count !== meta.count) fail('录像分块未完整上传')
      let bytes = 0
      for (let n = 0; n < count; n++) {
        const data = await store.get(`recording:${id}:${n}`); if (!data) fail('录像分块未完整上传')
        bytes += data.length * 3 / 4 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
        if (n === 0) {
          const head = atob(data.slice(0, 32))
          if (meta.mime === 'video/webm' ? !head.startsWith('\x1a\x45\xdf\xa3') : head.slice(4, 8) !== 'ftyp') fail('不是有效的视频文件')
        }
      }
      if (bytes > 16 * 1024 * 1024) fail('录像片段过大')
      const done = { ...meta, ready: true, bytes }; await store.set(`recording:${id}`, done); return done
    },
    async data(id, n) {
      const meta = await read(id)
      if (!meta.ready || !Number.isInteger(n) || n < 0 || n >= meta.count) fail('录像未保存完整或分块不存在', 404)
      return { data: await store.get(`recording:${id}:${n}`), mime: meta.mime }
    },
    async remove(id) {
      const meta = await read(id)
      for (let n = 0; n < meta.count; n++) await store.set(`recording:${id}:${n}`, null)
      await store.set(`recording:${id}`, { id, deleted: true }); await store.set('recordings:index', (await index()).filter(x => x !== id)); return { ok: true }
    },
  }
}
