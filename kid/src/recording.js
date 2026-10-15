// 只把答题 DOM 绘制成无声视频；没有屏幕共享、摄像头或麦克风权限。
const MIME = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']
let database
const db = () => {
  if (!database) database = new Promise((resolve, reject) => {
    const r = indexedDB.open('mathfriend-practice-videos', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('clips', { keyPath: 'id' })
    r.onsuccess = () => {
      r.result.onversionchange = () => { r.result.close(); database = null }
      resolve(r.result)
    }
    r.onerror = () => reject(r.error)
    r.onblocked = () => reject(new Error('请关闭其他旧版做题页面后重试'))
  }).catch(e => { database = null; throw e })
  return database
}
async function saved(op, value) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction('clips', op === 'getAll' ? 'readonly' : 'readwrite'), request = tx.objectStore('clips')[op](value)
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('浏览器未能保存录像'))
  })
}
const download = (blob, filename) => {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
}
const base64 = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.onerror = () => reject(r.error); r.readAsDataURL(blob) })

export function practiceRecorder(api) {
  let target = null, owner = '', active = null, preparing = false, paused = false, uploading = false, pending = [], error = '', stopped = false, pageAway = false, accountVersion = 0
  // 内存备份也按账号隔离，存储失败时不覆盖之前的片段。
  const backups = new Map(), finishing = new Set()
  const supported = typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream
  const control = document.createElement('aside'); control.className = 'record-control'; control.dataset.html2canvasIgnore = 'true'; control.hidden = true; control.setAttribute('aria-label', '答题录像')
  const mine = () => [...new Map([...pending, ...backups.values()].filter(c => owner && c.user === owner).map(c => [c.id, c])).values()]
  const show = () => {
    if (stopped) return
    const clips = mine(), saving = [...finishing].some(c => c.user === owner), app = document.querySelector('#app'), top = target && app?.querySelector('.qtop')
    // render 会替换 #app 的内容：始终重新接回同一个控件节点。
    if (top) top.after(control)
    else if (app) app.append(control)
    else document.body.append(control)
    control.hidden = !owner || (!target && !clips.length && !saving)
    if (control.hidden) return
    const focused = control.contains(document.activeElement) ? document.activeElement?.dataset.action : null
    control.replaceChildren()
    const label = document.createElement('span'); label.setAttribute('role', 'status')
    label.textContent = error || (!supported ? '此浏览器不支持答题录像，可继续做题' : preparing ? '准备录像…' : active ? '正在录制答题画面' : paused ? '答题录像已暂停' : clips.some(c => !c.uploadBlocked) ? '录像等待上传' : clips.length ? '录像已从服务器删除，仅保留本地副本' : saving ? '正在保存录像…' : '答题录像已关闭')
    control.append(label)
    const button = (text, action, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.dataset.action = action; b.onclick = fn; control.append(b) }
    if (supported && target?.enabled) button(paused ? '继续录制' : '暂停录制', 'toggle', () => { paused = !paused; error = ''; if (paused) stop(); else reconcile(); show() })
    if (clips.length) {
      if (clips.some(c => !c.uploadBlocked)) button(uploading ? '正在保存…' : '重试保存', 'retry', () => { error = ''; upload() })
      button('下载未保存视频', 'download', () => {
        const clip = mine()[0]
        if (clip) download(clip.blob, `答题-${clip.item}-${clip.id}.${clip.mime === 'video/mp4' ? 'mp4' : 'webm'}`)
      })
      if (clips.some(c => c.uploadBlocked)) button('清除已删除录像的本地副本', 'discard', async () => {
        const user = owner
        try {
          for (const clip of mine().filter(c => c.uploadBlocked)) { await saved('delete', clip.id); backups.delete(clip.id) }
          if (owner === user) error = ''
          await refresh()
        } catch { if (owner === user) { error = '本地副本未清除，请稍后重试'; show() } }
      })
    }
    if (focused) control.querySelector(`[data-action="${focused}"]`)?.focus({ preventScroll: true })
  }
  async function refresh() { pending = await saved('getAll'); show() }
  async function upload() {
    if (uploading || !owner || stopped) return
    uploading = true
    const user = owner, version = accountVersion
    const valid = () => !stopped && owner === user && accountVersion === version
    const request = (path, data) => {
      if (!valid()) throw new Error('账号已切换')
      return api(path, data)
    }
    try {
      for (const clip of backups.values()) {
        if (clip.user !== user) continue
        await saved('put', clip); backups.delete(clip.id)
      }
      await refresh()
      for (const clip of pending.filter(c => c.user === user && !c.uploadBlocked)) {
        if (!valid()) break
        try {
          if (!clip.remote) {
            const meta = await request('/recordings', { clientId: clip.id, item: clip.item, date: clip.date, title: clip.title, mime: clip.mime, duration: clip.duration })
            clip.remote = meta.id; await saved('put', clip)
          }
          const remote = await request(`/recordings/${clip.remote}/status`, {})
          if (!remote.ready) {
            const size = 192 * 1024, count = Math.ceil(clip.blob.size / size)
            for (let i = 0; i < count; i++) {
              const data = await base64(clip.blob.slice(i * size, (i + 1) * size))
              await request(`/recordings/${clip.remote}/${i}`, { data })
            }
            await request(`/recordings/${clip.remote}/finish`, { count })
          }
          await saved('delete', clip.id)
        } catch (e) {
          if (e.status !== 410) throw e
          // 管理员明确删除的录像不复活；保留本地下载，并让后面的片段继续上传。
          clip.uploadBlocked = true; backups.set(clip.id, clip)
          await saved('put', clip); backups.delete(clip.id)
        }
      }
      if (valid()) error = ''
      await refresh()
    } catch (e) { if (valid()) { error = `录像尚未保存：${e.message || '网络不稳定'}。可重试或下载。`; show() } }
    finally {
      uploading = false; show()
      // 切换账号时旧请求自然结束，新账号才开始自己的队列。
      if (!stopped && owner && !valid()) upload()
    }
  }
  function stop() {
    const current = active
    if (!current) return
    active = null; current.live = false; current.ended = Date.now(); clearTimeout(current.timer); clearTimeout(current.limit)
    document.removeEventListener('pointerdown', current.point, true)
    finishing.add(current)
    if (current.recorder.state !== 'inactive') current.recorder.stop()
    show()
  }
  const canStart = () => !stopped && !pageAway && !!owner && target?.user === owner && target.enabled && !paused && !document.hidden && supported
  async function reconcile() {
    if (stopped) return
    if (active && (active.key !== target?.key || active.user !== owner || !canStart())) stop()
    if (active || preparing || !canStart()) { show(); return }
    preparing = true; show()
    const t = { ...target }, version = accountVersion
    const stillWanted = () => canStart() && target?.key === t.key && accountVersion === version
    let stream
    try {
      const { default: html2canvas } = await import('html2canvas')
      await db(); await document.fonts.ready
      if (!stillWanted()) return
      const canvas = document.createElement('canvas'), box = t.element.getBoundingClientRect()
      if (!box.width || !t.element.isConnected) throw new Error('答题画面尚未准备好')
      canvas.width = Math.min(900, Math.ceil(box.width / 2) * 2); canvas.height = Math.ceil((innerHeight / box.width * canvas.width) / 2) * 2
      const ctx = canvas.getContext('2d'), mime = MIME.find(x => MediaRecorder.isTypeSupported(x))
      if (!mime || !ctx) throw new Error('浏览器没有可用的视频编码器')
      ctx.fillStyle = '#e8f6ed'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      stream = canvas.captureStream(8)
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 650000 }), chunks = []
      const current = { ...t, canvas, recorder, live: true, pointer: null, started: Date.now(), timer: null, limit: null, frame: null }
      active = current
      const paint = () => {
        if (!current.live || !current.frame) return
        ctx.fillStyle = '#e8f6ed'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        const f = current.frame, scale = Math.min(canvas.width / f.width, canvas.height / f.height)
        ctx.drawImage(f, 0, 0, f.width * scale, f.height * scale)
        if (current.pointer && Date.now() - current.pointer.at < 700) { const p = current.pointer; ctx.beginPath(); ctx.arc(p.x * scale, p.y * scale, 13, 0, Math.PI * 2); ctx.strokeStyle = '#e0527a'; ctx.lineWidth = 4; ctx.stroke() }
      }
      current.point = e => {
        if (!t.element.contains(e.target) || control.contains(e.target)) return
        const r = t.element.getBoundingClientRect(); current.pointer = { x: e.clientX - r.left, y: e.clientY, at: Date.now() }; paint()
      }
      document.addEventListener('pointerdown', current.point, true)
      const frame = async () => {
        if (!current.live || !stillWanted()) return
        try {
          const r = t.element.getBoundingClientRect()
          const image = await html2canvas(t.element, { backgroundColor: '#e8f6ed', scale: 1, logging: false, useCORS: false, width: r.width, height: innerHeight, x: 0, y: -r.top, windowWidth: innerWidth, windowHeight: innerHeight,
            onclone: doc => { const style = doc.createElement('style'); style.textContent = '*{animation:none!important;caret-color:transparent!important}'; doc.head.append(style) } })
          if (!current.live || !stillWanted()) return
          current.frame = image; paint()
        } catch {
          if (current.live && stillWanted()) { error = '当前画面录制失败，已暂停录像，可继续做题'; paused = true; stop() }
        }
        if (current.live) current.timer = setTimeout(frame, 350)
      }
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(x => x.stop()); document.removeEventListener('pointerdown', current.point, true)
        let blob = new Blob(chunks, { type: recorder.mimeType })
        const duration = Math.min(180000, (current.ended || Date.now()) - current.started)
        if (blob.size > 0) {
          if (recorder.mimeType.startsWith('video/webm')) {
            try {
              const { default: fixWebmDuration } = await import('fix-webm-duration')
              blob = await fixWebmDuration(blob, duration, { logger: false })
            } catch { /* 修复元数据失败也保存原视频，不能丢失答题过程。 */ }
          }
          const clip = { id: crypto.randomUUID(), user: t.user, item: t.item, title: t.title, date: t.date, mime: recorder.mimeType.split(';')[0], duration, blob }
          // 先放进内存队列，IndexedDB 写入失败时仍能下载。
          backups.set(clip.id, clip)
          try { await saved('put', clip); backups.delete(clip.id); await refresh(); if (!stopped) upload() }
          catch {
            if (owner === t.user) { error = '录像暂存在当前页面，请下载保存后再离开'; paused = true; stop() }
          }
        }
        finishing.delete(current); show()
      }
      recorder.onerror = () => {
        if (active === current) { error = '录像编码中断，已有片段会尝试保存'; paused = true; stop() }
      }
      recorder.start(1000); frame(); current.limit = setTimeout(() => { stop(); reconcile() }, 60000)
    } catch (e) {
      stream?.getTracks().forEach(x => x.stop())
      if (active?.key === t.key && active.user === t.user) {
        if (active.recorder.state === 'inactive') {
          active.live = false; document.removeEventListener('pointerdown', active.point, true); active = null
        } else stop()
      }
      if (stillWanted()) { error = `无法开始录像：${e.message}，仍可正常做题`; paused = true }
    } finally {
      preparing = false; show()
      // import/字体加载期间可能已进入下一题，立即录制新的题目。
      if (!active && canStart()) queueMicrotask(reconcile)
    }
  }
  const visibility = () => { if (document.hidden) stop(); else reconcile() }
  const pagehide = () => { pageAway = true; stop() }
  const pageshow = () => { pageAway = false; reconcile() }
  const beforeunload = e => { if (active || finishing.size || mine().length) { e.preventDefault(); e.returnValue = '' } }
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', pagehide)
  window.addEventListener('pageshow', pageshow)
  window.addEventListener('beforeunload', beforeunload)
  const retry = setInterval(() => { reconcile(); if (!active) upload() }, 20000)
  refresh().catch(() => { if (owner) { error = '录像存储不可用，可继续做题'; show() } })
  return {
    sync(next, user = '') {
      if (owner !== user) { accountVersion++; owner = user; paused = false; error = '' }
      target = next; reconcile(); if (!active && !preparing) upload()
    },
    destroy() {
      stopped = true; stop(); clearInterval(retry)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', pagehide); window.removeEventListener('pageshow', pageshow); window.removeEventListener('beforeunload', beforeunload)
      control.remove()
    },
  }
}

export async function recordingBlob(api, user, clip) {
  const parts = []
  for (let n = 0; n < clip.count; n++) {
    const { data } = await api(`/admin/recordings/${clip.id}/${n}?user=${encodeURIComponent(user)}`)
    if (!data) throw new Error('录像片段缺失，请重新载入')
    const raw = atob(data); parts.push(Uint8Array.from(raw, c => c.charCodeAt(0)))
  }
  return new Blob(parts, { type: clip.mime })
}
