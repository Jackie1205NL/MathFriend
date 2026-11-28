import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPack, checkPack, publicItem, svgOk } from '../../shared/contract.js'
import { MOTION_KINDS, SYM_LIBRARY } from '../../shared/motion.js'
import { createApi } from '../server/game.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EXAMPLES = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/skills/weekly/examples/motion-templates.json'), 'utf8'))

function memStore() {
  const m = new Map()
  return { get: async k => m.has(k) ? structuredClone(m.get(k)) : null, set: async (k, v) => { m.set(k, structuredClone(v)) } }
}
const ENV = { KID_USER: '甲', KID_PIN: '1234', ADMIN_PIN: '9999', SYNC_TOKEN: 'test-token', DEV: '1' }

function req(pathUrl, body, cookie = '') {
  const headers = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  return new Request('http://local/api/kid' + pathUrl, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function login(api) {
  const r = await api(req('/login', { name: '甲', pin: '1234' }))
  assert.equal(r.status, 200)
  return (r.headers.get('set-cookie') || '').split(';')[0]
}

function buildPackFromTemplates(templates, week = '2026-W48') {
  const groups = [
    { id: 'g2', name: '镜像与对称', sub: '水中倒影与照镜子', bucket: '本周重点', daily: 2 },
    { id: 'g3', name: '旋转与平移', sub: '旋转规律与方格平移', bucket: '本周重点', daily: 2 },
  ]
  const { pack, report } = buildPack({ tuning: { daily_total: 4, sections: 2 }, groups, templates }, week)
  for (const r of report) {
    const t = templates.find(x => x.id === r.id)
    assert.equal(r.made, t.count || 10, `${r.id} 期望生成 ${t.count || 10} 道，实际 ${r.made} (${JSON.stringify(r.problems)})`)
  }
  return pack
}

test('全部 7 类图形运动模板及公开示例均可跨周生成、通过 checkPack 且 SVG 合法', () => {
  const coveredKinds = new Set(EXAMPLES.templates.map(t => t.motion?.kind))
  for (const k of MOTION_KINDS) assert.ok(coveredKinds.has(k), `motion-templates.json 缺少 kind=${k}`)

  const packs = ['2026-W48', '2026-W49', '2027-W02'].map(w => buildPackFromTemplates(EXAMPLES.templates, w))
  for (const pack of packs) {
    const errs = checkPack(pack)
    assert.deepEqual(errs, [], `${pack.week} checkPack 失败: ${errs.join('; ')}`)
    for (const it of pack.items) {
      assert.equal(it.format, 'choice')
      assert.equal(it.mode, 'one')
      assert.ok(it.svg || it.opts.every(o => o.svg), `${it.id} 必须带题干 SVG 或全图选项 SVG`)
      if (it.svg) assert.ok(svgOk(it.svg), `${it.id} 题干 SVG 不合法或超长 (${it.svg.length})`)
      assert.equal(it.opts.length, 4, `${it.id} 应有 4 个选项`)
      assert.equal(it.opts.filter(o => o.ok).length, 1, `${it.id} 应恰好 1 个正确选项`)
      assert.equal(new Set(it.opts.map(o => o.t)).size, 4, `${it.id} 选项文字必须互异`)
      for (const o of it.opts) {
        if (o.svg) assert.ok(svgOk(o.svg), `${it.id} 选项 SVG 不合法或超长 (${o.svg.length})`)
      }
    }
  }
  // 跨周参数确实变化
  const w48Water = new Set(packs[0].items.filter(i => i.tpl === 'practice-motion-water-mirror').map(i => i.svg))
  const w49Water = new Set(packs[1].items.filter(i => i.tpl === 'practice-motion-water-mirror').map(i => i.svg))
  assert.ok([...w48Water].some(s => !w49Water.has(s)) || packs[0].items[0].svg !== packs[1].items[0].svg, '跨周应生成不同图形组合')
})

test('各图形运动生成器的几何与数学不变式核验', () => {
  const pack = buildPackFromTemplates(EXAMPLES.templates, '2026-W48')
  const byTpl = id => pack.items.filter(i => i.tpl === id)

  // 1. 水中倒影：正确选项必须是垂直翻转 scale(1,-1)，干扰项不含纯垂直翻转
  for (const it of byTpl('practice-motion-water-mirror')) {
    const right = it.opts.find(o => o.ok)
    assert.ok(right.svg.includes('scale(1,-1)'), `${it.id} 水中倒影正确项应为上下翻转`)
    assert.ok(it.opts.filter(o => !o.ok).every(o => !o.svg.includes('scale(1,-1)')), `${it.id} 干扰项不应出现上下翻转`)
    assert.deepEqual(it.opts.map(o => o.t), ['A', 'B', 'C', 'D'])
  }

  // 2. 镜子看方格图：4 个选项 SVG 两两互异
  for (const it of byTpl('practice-motion-mirror-grid')) {
    assert.equal(new Set(it.opts.map(o => o.svg)).size, 4, `${it.id} 四个方格选项必须互异`)
  }

  // 3. 轴对称四位数：满足 2↔5 且中心左右对称
  const mir = { 0: '0', 1: '1', 2: '5', 5: '2', 8: '8' }
  for (const it of byTpl('practice-motion-mirror-digits')) {
    const ans = it.opts.find(o => o.ok).t
    assert.match(ans, /^[1258][01258]{3}$/, `${it.id} 应为合法四位数: ${ans}`)
    assert.equal(ans[2], mir[ans[1]], `${it.id} 内侧两位应互为镜像: ${ans}`)
    assert.equal(ans[3], mir[ans[0]], `${it.id} 外侧两位应互为镜像: ${ans}`)
  }

  // 4. 镜中钟面：实际时间与镜中时间满足之和为 12 小时，且两者不等
  for (const it of byTpl('practice-motion-mirror-clock')) {
    const ans = it.opts.find(o => o.ok).t
    const m = ans.match(/^(\d+) 时(?: (\d+) 分)?$/)
    assert.ok(m, `${it.id} 时间格式异常: ${ans}`)
    const h = Number(m[1]), min = Number(m[2] || 0)
    const realMin = (h % 12) * 60 + min
    const mirMin = (720 - realMin) % 720
    assert.notEqual(realMin, mirMin, `${it.id} 不应出镜像不变的 6:00 或 12:00`)
    const mh = Math.floor(mirMin / 60) || 12
    const direct = min ? `${mh} 时 30 分` : `${mh} 时`
    assert.ok(it.opts.some(o => !o.ok && o.t === direct), `${it.id} 应包含直接误读陷阱 ${direct}`)
  }

  // 5. 绕图钉旋转：唯一正确选项不翻面（无 scale(-1,1)），3 个干扰项全翻面
  for (const it of byTpl('practice-motion-pin-rotate')) {
    const right = it.opts.find(o => o.ok)
    assert.ok(!right.svg.includes('scale(-1,1)'), `${it.id} 正确项不能翻面`)
    assert.ok(it.opts.filter(o => !o.ok).every(o => o.svg.includes('scale(-1,1)')), `${it.id} 三个干扰项都应是翻面后的图形`)
  }

  // 6. 旋转找规律（圆盘 / 指向图案 / 外圈）：4 个选项图两两互异
  for (const tid of ['practice-motion-rot-arrow', 'practice-motion-rot-wheel', 'practice-motion-rot-ring']) {
    for (const it of byTpl(tid)) {
      assert.equal(new Set(it.opts.map(o => o.svg)).size, 4, `${it.id} 旋转规律 4 个选项图应互异`)
    }
  }

  // 7. 方格平移（正向 / 倒推）：A/B/C/D 选项按序呈现，解析指向正确字母
  for (const tid of ['practice-motion-grid-forward', 'practice-motion-grid-reverse']) {
    for (const it of byTpl(tid)) {
      assert.deepEqual(it.opts.map(o => o.t), ['A', 'B', 'C', 'D'])
      const okLab = it.opts.find(o => o.ok).t
      assert.ok(it.explain.includes(okLab), `${it.id} 解析应写明正确字母 ${okLab}`)
    }
  }

  // 8. 轴对称图形图片库（sym_pick）：图库 16 对称 + 14 非对称全部合法，且每题恰好 1 正 3 反
  assert.ok(SYM_LIBRARY.yes.length >= 16 && SYM_LIBRARY.no.length >= 14)
  const yesBodies = new Set(SYM_LIBRARY.yes.map(x => x.body))
  const noBodies = new Set(SYM_LIBRARY.no.map(x => x.body))
  for (const x of [...SYM_LIBRARY.yes, ...SYM_LIBRARY.no]) {
    const s = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${x.body}</svg>`
    assert.ok(svgOk(s), `对称图片库 ${x.name} SVG 不合法或超长 (${s.length})`)
  }
  const symItems = byTpl('practice-motion-sym-pick')
  assert.ok(symItems.some(i => i.text.includes('不是')), 'sym_pick 混出应包含“不是轴对称”问法')
  assert.ok(symItems.some(i => !i.text.includes('不是')), 'sym_pick 混出应包含“是轴对称”问法')
  for (const it of symItems) {
    assert.equal(new Set(it.opts.map(o => o.svg)).size, 4, `${it.id} 四张图片必须互异`)
    assert.deepEqual(it.opts.map(o => o.t), ['A', 'B', 'C', 'D'])
    const askNot = it.text.includes('不是')
    const rightBody = it.opts.find(o => o.ok).svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')
    assert.ok((askNot ? noBodies : yesBodies).has(rightBody), `${it.id} 正确选项必须来自对应图库`)
    for (const o of it.opts.filter(x => !x.ok)) {
      const b = o.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')
      assert.ok((askNot ? yesBodies : noBodies).has(b), `${it.id} 干扰项必须来自另一侧图库`)
      assert.ok(o.say, `${it.id} 每个错误图片都应有针对性解释`)
    }
  }
})

test('publicItem 不泄露答案；后端判题在交卷后才返回 rightSvg 和针对性反馈，并启用防乱点最短用时', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-28T12:00:00+08:00'))
  const pack = buildPackFromTemplates(EXAMPLES.templates.slice(0, 2), '2026-W48')
  const sample = pack.items[0]
  const pub = publicItem(sample)
  assert.ok(pub.flow[0].svg && svgOk(pub.flow[0].svg), '发给页面的 choose 步骤应保留题干 SVG')
  assert.ok(pub.flow[0].opts.every(o => o.svg && o.t && !('ok' in o) && !('say' in o)), '发给页面的选项只能带 t 与 svg，不能带 ok/say')

  const store = memStore()
  await store.set('pack', pack)
  const api = createApi(store, ENV)
  const cookie = await login(api)
  await api(req('/state', undefined, cookie))
  const curState = await store.get('state')
  Object.assign(curState, { hatched: true, gift: { date: '2026-11-28', what: null }, greet: '2026-11-28' })
  await store.set('state', curState)
  const stRes = await api(req('/state', undefined, cookie))
  const st = await stRes.json()
  const todayIds = st.today.flatMap(g => g.items.map(x => x.id))
  const it1 = pack.items.find(x => x.id === todayIds[0])
  const it2 = pack.items.find(x => x.id === todayIds[1])
  assert.ok(it1 && it2)

  // 1) 秒答错题应触发「慢慢来」保护（MIN_SECONDS.choice = 3 → fin.flash = true，返回正确 rightSvg 与针对性提示）
  const wrongIdx1 = it1.opts.findIndex(o => !o.ok)
  const badRes = await (await api(req('/answer', { item: it1.id, ms: 900, steps: [{ i: wrongIdx1 }] }, cookie))).json()
  assert.equal(badRes.fin.ok, false)
  assert.equal(badRes.fin.flash, true, '1 秒内选错图形选择题应触发慢慢来保护（flash=true）')
  assert.ok(badRes.fin.rightSvg && svgOk(badRes.fin.rightSvg), '答错图形选择题后应返回正确的 rightSvg')
  assert.ok(badRes.fin.stemSvg && svgOk(badRes.fin.stemSvg), '答错后应返回题干 stemSvg 供对照')
  assert.ok(badRes.fin.items.some(x => x.msg.includes(it1.opts[wrongIdx1].say.replace(/。$/, ''))), `反馈应带入针对性错因说明: ${JSON.stringify(badRes.fin.items)}`)

  // 2) 正常用时选对：得分且记录成功，不触发 flash
  const rightIdx2 = it2.opts.findIndex(o => o.ok)
  const okRes = await (await api(req('/answer', { item: it2.id, ms: 7000, steps: [{ i: rightIdx2 }] }, cookie))).json()
  assert.equal(okRes.fin.ok, true)
  assert.equal(okRes.fin.flash, false)
  assert.ok(okRes.fin.c > 0, '选对应发金币')
})
