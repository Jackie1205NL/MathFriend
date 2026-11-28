// 图形的运动（平移、旋转、轴对称 / 镜像）参数化出题与矢量图生成。
// 只产出标准 choice（mode: 'one'）所需的纯 <svg> 题干、选项和针对性错法提示，不引用 server/ 或 kid/。

const LABS = ['A', 'B', 'C', 'D']
const pick = (r, a) => a[Math.floor(r() * a.length)]
const randInt = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1))

const svgWrap = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`

/** 1. 水中倒影（上下翻转）：左右不变，上下翻折。陷阱是旋转 180°（左右也换边）、左右镜像、原图不动。 */
function waterScene(r) {
  const kind = pick(r, ['house', 'boat', 'flag', 'tower'])
  const side = pick(r, [-1, 1])      // -1 特征偏左，1 特征偏右
  const pal = pick(r, [
    { main: '#2f8f5b', roof: '#e0527a', acc: '#f08a1c', sub: '#3b8fd6' },
    { main: '#3b8fd6', roof: '#f08a1c', acc: '#e0527a', sub: '#2f8f5b' },
    { main: '#8e5cc8', roof: '#2f8f5b', acc: '#f08a1c', sub: '#e0527a' },
  ])
  const flip = side < 0 ? ' transform="translate(120,0) scale(-1,1)"' : ''
  let body = '', label = ''
  if (kind === 'house') {
    const win = pick(r, ['circle', 'square'])
    label = '小房子'
    body = `<g${flip}><rect x="26" y="20" width="12" height="24" rx="2" fill="${pal.acc}" stroke="#1d3327" stroke-width="2.5"/>` +
      `<polygon points="16,54 60,18 104,54" fill="${pal.roof}" stroke="#1d3327" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<rect x="24" y="54" width="72" height="46" rx="3" fill="#fffaf0" stroke="#1d3327" stroke-width="2.5"/>` +
      `<rect x="66" y="70" width="18" height="30" rx="2" fill="${pal.main}" stroke="#1d3327" stroke-width="2.2"/>` +
      (win === 'circle' ? `<circle cx="44" cy="72" r="10" fill="${pal.sub}" stroke="#1d3327" stroke-width="2.2"/>` : `<rect x="34" y="63" width="18" height="18" rx="2" fill="${pal.sub}" stroke="#1d3327" stroke-width="2.2"/>`) +
      `</g>`
  } else if (kind === 'boat') {
    label = '小帆船'
    body = `<g${flip}><line x1="48" y1="20" x2="48" y2="74" stroke="#1d3327" stroke-width="4" stroke-linecap="round"/>` +
      `<polygon points="48,22 94,64 48,64" fill="${pal.acc}" stroke="#1d3327" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<polygon points="48,20 26,28 48,36" fill="${pal.roof}" stroke="#1d3327" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<polygon points="16,74 104,74 90,98 28,98" fill="${pal.main}" stroke="#1d3327" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<circle cx="38" cy="86" r="6" fill="#fffaf0" stroke="#1d3327" stroke-width="2"/></g>`
  } else if (kind === 'flag') {
    label = '小旗子'
    body = `<g${flip}><rect x="22" y="92" width="76" height="9" rx="4" fill="${pal.main}" stroke="#1d3327" stroke-width="2.2"/>` +
      `<line x1="36" y1="20" x2="36" y2="92" stroke="#1d3327" stroke-width="4.5" stroke-linecap="round"/>` +
      `<polygon points="36,22 98,38 36,56" fill="${pal.roof}" stroke="#1d3327" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<circle cx="56" cy="39" r="7" fill="#ffd766" stroke="#1d3327" stroke-width="2"/>` +
      `<circle cx="82" cy="82" r="10" fill="${pal.acc}" stroke="#1d3327" stroke-width="2.2"/></g>`
  } else {
    label = '小城堡'
    body = `<g${flip}><rect x="22" y="50" width="76" height="50" rx="3" fill="#fffaf0" stroke="#1d3327" stroke-width="2.5"/>` +
      `<rect x="24" y="24" width="26" height="28" fill="${pal.sub}" stroke="#1d3327" stroke-width="2.5"/>` +
      `<polygon points="20,24 37,10 54,24" fill="${pal.roof}" stroke="#1d3327" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<rect x="64" y="68" width="22" height="32" rx="9" fill="${pal.main}" stroke="#1d3327" stroke-width="2.2"/>` +
      `<circle cx="37" cy="37" r="5" fill="#ffd766" stroke="#1d3327" stroke-width="1.8"/></g>`
  }
  const stem = svgWrap(360, 152,
    `<rect x="120" y="6" width="120" height="106" rx="12" fill="#f7fbf8" stroke="#cfe6d5" stroke-width="2"/>` +
    `<g transform="translate(120,6) scale(0.92) translate(5,0)">${body}</g>` +
    `<line x1="34" y1="122" x2="326" y2="122" stroke="#3b8fd6" stroke-width="3" stroke-dasharray="8 6"/>` +
    `<path d="M40 132 q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#8ac5f2" stroke-width="2.5"/>` +
    `<text x="180" y="148" text-anchor="middle" font-size="14" font-weight="700" fill="#2a67a6">水面（下面是倒影）</text>`
  )
  const card = tr => svgWrap(120, 120, `<g${tr ? ` transform="${tr}"` : ''}>${body}</g>`)
  return {
    text: `虚线上方的${label}在水中的倒影是哪一幅？`,
    svg: stem,
    autoLabel: true,
    opts: [
      { svg: card('translate(0,120) scale(1,-1)'), ok: 1 },
      { svg: card('translate(120,120) scale(-1,-1)'), say: '这是把图形转了半圈，左右也跟着换边了！水中倒影只翻上下，左右位置不变。' },
      { svg: card('translate(120,0) scale(-1,1)'), say: '这是左右照镜子，顶部还在上面呢！水中倒影要把上下翻过来。' },
      { svg: card(''), say: '这是原来的样子，没有上下翻折成倒影。' },
    ],
    hint: '水中倒影是沿水面上下对折：上面变下面，左右位置不变。',
    explain: '水中倒影属于上下轴对称翻折，顶部翻到底部，原来在左边的部分倒影里仍在左边，右边的仍在右边。',
  }
}

/** 2. 镜子里看方格图（左右翻转）：3×3 彩色网格，确保原图/左右翻/上下翻/转 180° 四态两两不同。 */
function gridSvg(cells, size = 120, ox = 12, oy = 12, cs = 32) {
  const fill = { g: '#2f8f5b', o: '#f08a1c' }, w = cs * 3
  let out = `<rect x="${ox}" y="${oy}" width="${w}" height="${w}" fill="#f7fbf8"/>`
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const ch = cells[r * 3 + c]
    if (fill[ch]) out += `<rect x="${ox + c * cs}" y="${oy + r * cs}" width="${cs}" height="${cs}" fill="${fill[ch]}"/>`
  }
  out += `<path d="M${ox} ${oy}h${w}v${w}h-${w}zM${ox + cs} ${oy}v${w}M${ox + cs * 2} ${oy}v${w}M${ox} ${oy + cs}h${w}M${ox} ${oy + cs * 2}h${w}" fill="none" stroke="#1d3327" stroke-width="2"/>`
  return size ? svgWrap(size, size, out) : out
}
function mapGrid(cells, fn) {
  const out = Array(9).fill('.')
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const [nr, nc] = fn(r, c); out[nr * 3 + nc] = cells[r * 3 + c] }
  return out.join('')
}
function mirrorGrid(r) {
  for (let k = 0; k < 200; k++) {
    const arr = Array(9).fill('.'), idxs = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    for (let i = 8; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]] }
    const nG = randInt(r, 2, 3), nO = randInt(r, 1, 2)
    idxs.slice(0, nG).forEach(i => { arr[i] = 'g' })
    idxs.slice(nG, nG + nO).forEach(i => { arr[i] = 'o' })
    const orig = arr.join('')
    const flipX = mapGrid(orig, (y, x) => [y, 2 - x])
    const flipY = mapGrid(orig, (y, x) => [2 - y, x])
    const rot180 = mapGrid(orig, (y, x) => [2 - y, 2 - x])
    if (new Set([orig, flipX, flipY, rot180]).size < 4) continue
    const hatch = Array.from({ length: 6 }, (_, i) => `<line x1="205" y1="${20 + i * 18}" x2="215" y2="${10 + i * 18}" stroke="#8ac5f2" stroke-width="2"/>`).join('')
    const stem = svgWrap(360, 144,
      gridSvg(orig, 0, 82, 18, 32) +
      `<line x1="203" y1="10" x2="203" y2="122" stroke="#3b8fd6" stroke-width="4"/>` + hatch +
      `<text x="203" y="138" text-anchor="middle" font-size="13" font-weight="700" fill="#2a67a6">镜子</text>` +
      `<rect x="232" y="18" width="96" height="96" rx="10" fill="#eef6fd" stroke="#8ac5f2" stroke-width="2.5" stroke-dasharray="6 5"/>` +
      `<text x="280" y="77" text-anchor="middle" font-size="38" font-weight="700" fill="#3b8fd6">？</text>`
    )
    return {
      text: '从右侧的镜子里看左边的方格图，会是什么样子？',
      svg: stem,
      autoLabel: true,
      opts: [
        { svg: gridSvg(flipX), ok: 1 },
        { svg: gridSvg(orig), say: '镜子里的图形左右会反过来，不是原样平移过去。' },
        { svg: gridSvg(flipY), say: '这是上下翻折了！照竖着的镜子是左右翻转，上下位置不变。' },
        { svg: gridSvg(rot180), say: '这是转了半圈，上下也颠倒了！照竖着的镜子只变左右，不变上下。' },
      ],
      hint: '竖着照镜子时左右交换、上下不变：原来紧挨镜子那一列，镜子里也紧挨镜子。',
      explain: '沿竖直镜面左右翻折，每一行不变，左列和右列互换，中间一列不动。先看橙色方格的左右位置最快。',
    }
  }
  return null
}

/** 3. 轴对称一半数字（七段数码管，左半沿竖直对称轴翻折，2↔5，如 20 → 2005）。 */
const SEG7 = {
  // a:top, b:tr, c:br, d:bot, e:bl, f:tl, g:mid
  0: 'abcdef', 1: 'bc', 2: 'abged', 5: 'afgcd', 8: 'abcdefg',
}
const MIR_DIG = { 0: '0', 1: '1', 2: '5', 5: '2', 8: '8' }
function seg7Svg(ch, ox, oy) {
  const on = SEG7[ch] || ''
  if (ch === '1') return `<rect x="${ox + 15}" y="${oy + 5}" width="7" height="31" rx="3" fill="#1d3327"/><rect x="${ox + 15}" y="${oy + 40}" width="7" height="31" rx="3" fill="#1d3327"/>`
  const parts = {
    a: `<rect x="${ox + 6}" y="${oy + 2}" width="25" height="7" rx="3" fill="#1d3327"/>`,
    b: `<rect x="${ox + 29}" y="${oy + 6}" width="7" height="29" rx="3" fill="#1d3327"/>`,
    c: `<rect x="${ox + 29}" y="${oy + 41}" width="7" height="29" rx="3" fill="#1d3327"/>`,
    d: `<rect x="${ox + 6}" y="${oy + 67}" width="25" height="7" rx="3" fill="#1d3327"/>`,
    e: `<rect x="${ox + 1}" y="${oy + 41}" width="7" height="29" rx="3" fill="#1d3327"/>`,
    f: `<rect x="${ox + 1}" y="${oy + 6}" width="7" height="29" rx="3" fill="#1d3327"/>`,
    g: `<rect x="${ox + 6}" y="${oy + 34}" width="25" height="7" rx="3" fill="#1d3327"/>`,
  }
  return [...on].map(k => parts[k]).join('')
}
const DIGIT_PAIRS = ['20', '50', '28', '58', '82', '85', '21', '51', '12', '15', '22', '55', '25', '52']
function mirrorDigits(r) {
  const left = pick(r, DIGIT_PAIRS), [d1, d2] = [...left]
  const m1 = MIR_DIG[d1], m2 = MIR_DIG[d2]
  const ans = `${d1}${d2}${m2}${m1}`
  const candTraps = [
    { t: `${d1}${d2}${d2}${d1}`, say: '数字 2 和 5 沿竖线对折后会互相变成对方，不能原样照抄！' },
    { t: `${d1}${d2}${d1}${d2}`, say: '这是把左边平移抄了一遍！对折后，紧挨对称轴的那一位翻过去仍要紧挨对称轴。' },
    { t: `${d1}${d2}${m1}${m2}`, say: '数字翻对了，但左右顺序写反了！靠近红线的数字翻过去也要靠近红线。' },
    { t: `${d1}${d2}${m2}${d1}`, say: '左边第一个数字离红线最远，翻过去也要把 2 和 5 互换。' },
    { t: `${d1}${d2}${d2}${m1}`, say: '靠近红线的数字如果是 2 或 5，翻过去也要变成对方。' },
  ]
  const opts = [{ t: ans, ok: 1 }], used = new Set([ans])
  for (const x of candTraps) { if (!used.has(x.t) && opts.length < 4) { used.add(x.t); opts.push(x) } }
  const stem = svgWrap(360, 124,
    `<rect x="44" y="14" width="136" height="96" rx="8" fill="#f7fbf8" stroke="#cfe6d5" stroke-width="2"/>` +
    `<rect x="180" y="14" width="136" height="96" rx="8" fill="#eef6fd" stroke="#cfe6d5" stroke-width="2"/>` +
    seg7Svg(d1, 64, 24) + seg7Svg(d2, 122, 24) +
    `<line x1="180" y1="6" x2="180" y2="118" stroke="#e0527a" stroke-width="4" stroke-dasharray="7 5"/>` +
    `<text x="248" y="75" text-anchor="middle" font-size="34" font-weight="700" fill="#3b8fd6">？ ？</text>`
  )
  return {
    text: '图中的四位数是一个轴对称图形，沿红色虚线对折后两边完全重合，现在只画出了左半边。完整的四位数是多少？',
    svg: stem,
    opts,
    hint: '紧挨红线的数字翻过去仍紧挨红线；数字 2 对折过去会变成 5，数字 5 会变成 2。',
    explain: `左半边是 ${left}：紧挨对称轴的 ${d2} 翻折后是 ${m2}，外侧的 ${d1} 翻折后是 ${m1}，合起来这个四位数是 ${ans}。`,
  }
}

/** 4. 镜子里的钟面求实际时间（无数字刻度，沿竖直镜面左右翻转）。 */
const fmtClock = (h, m) => m ? `${h} 时 30 分` : `${h} 时`
function mirrorClock(r) {
  const half = r() < 0.5
  const h = half ? randInt(r, 1, 10) : pick(r, [1, 2, 3, 4, 5, 7, 8, 9, 10, 11])
  const m = half ? 30 : 0
  const realMin = (h % 12) * 60 + m
  const mirMin = (720 - realMin) % 720
  const mh = Math.floor(mirMin / 60) || 12
  // 镜中指针角度（0° 在 12 点，顺时针）
  const aH = mirMin / 2, aM = half ? 180 : 0
  const pt = (deg, rad) => [216 + rad * Math.sin(deg * Math.PI / 180), 76 - rad * Math.cos(deg * Math.PI / 180)]
  let majD = '', minD = ''
  for (let i = 0; i < 12; i++) {
    const major = i % 3 === 0, [x1, y1] = pt(i * 30, major ? 49 : 53), [x2, y2] = pt(i * 30, 59)
    const seg = `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
    if (major) majD += seg; else minD += seg
  }
  const [hx, hy] = pt(aH, 32), [mx, my] = pt(aM, 46)
  const hatchD = Array.from({ length: 7 }, (_, i) => `M94 ${20 + i * 18}L104 ${10 + i * 18}`).join('')
  const stem = svgWrap(360, 152,
    `<line x1="106" y1="12" x2="106" y2="134" stroke="#3b8fd6" stroke-width="4"/><path d="${hatchD}" stroke="#8ac5f2" stroke-width="2"/>` +
    `<text x="106" y="148" text-anchor="middle" font-size="13" font-weight="700" fill="#2a67a6">镜子</text>` +
    `<circle cx="216" cy="76" r="62" fill="#fffaf0" stroke="#1d3327" stroke-width="3.5"/>` +
    `<path d="${majD}" stroke="#1d3327" stroke-width="3.5" stroke-linecap="round"/><path d="${minD}" stroke="#1d3327" stroke-width="2" stroke-linecap="round"/>` +
    `<line x1="216" y1="76" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#3b8fd6" stroke-width="3.5" stroke-linecap="round"/>` +
    `<line x1="216" y1="76" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#e0527a" stroke-width="5.5" stroke-linecap="round"/>` +
    `<circle cx="216" cy="76" r="5" fill="#1d3327"/>`
  )
  const shiftH = (x, d) => ((x - 1 + d + 12) % 12) + 1
  const ans = fmtClock(h, m), direct = fmtClock(mh, m)
  const candTraps = [
    { t: direct, say: '这是直接读的镜子里的指针！镜子左右是反的，要把钟面左右翻过来再读。' },
    { t: fmtClock(shiftH(h, 1), m), say: '翻过来后的时针位置差了 1 小时，再看它左右对称后指在哪。' },
    { t: fmtClock(shiftH(h, -1), m), say: '翻过来后的时针位置差了 1 小时，半点时要看时针在两个数的正中间。' },
    { t: fmtClock(shiftH(mh, 1), m), say: '先确定分针指 12 还是 6，再把时针沿 12–6 中线左右对折。' },
    { t: fmtClock(shiftH(mh, -1), m), say: '先确定分针指 12 还是 6，再把时针沿 12–6 中线左右对折。' },
    { t: fmtClock(shiftH(h, 2), m), say: '把时针沿 12–6 竖线左右对折，两边到 12 的格数应该一样多。' },
  ]
  const opts = [{ t: ans, ok: 1 }], used = new Set([ans])
  for (const x of candTraps) { if (!used.has(x.t) && opts.length < 4) { used.add(x.t); opts.push(x) } }
  return {
    text: '如图是从镜子里看到的钟面（短粗红针是时针，细长蓝针是分针），钟面上的实际时间是多少？',
    svg: stem,
    opts,
    hint: '把钟面沿着 12 和 6 连成的竖线左右对折：右边的 3 对应左边的 9，4 对应 8。',
    explain: `镜子里看起来像 ${direct}，沿 12–6 竖线左右对称翻回来，实际时间是 ${ans}（${half ? '用 11 时 60 分减镜中时间也能检验' : `12 − ${mh} = ${h} 时`}）。`,
  }
}

/** 5. 绕图钉旋转（只能平面旋转，不能翻面镜像）：1 个真旋转 + 3 个翻面后旋转。 */
const PIN_SHAPES = [
  { name: 'L 形纸片', body: `<path d="M26 24 H86 V44 H48 V96 H26 Z" fill="#6bc08e" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><rect x="66" y="26" width="18" height="16" fill="#ffd766"/><circle cx="37" cy="85" r="7" fill="#e0527a" stroke="#1d3327" stroke-width="2.2"/><circle cx="37" cy="85" r="2.2" fill="#fff"/>` },
  { name: 'F 形纸片', body: `<path d="M28 20 H88 V38 H48 V52 H74 V68 H48 V98 H28 Z" fill="#6bc08e" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><circle cx="38" cy="87" r="7" fill="#e0527a" stroke="#1d3327" stroke-width="2.2"/><circle cx="38" cy="87" r="2.2" fill="#fff"/>` },
  { name: '小旗纸片', body: `<rect x="30" y="22" width="14" height="76" rx="3" fill="#f08a1c" stroke="#1d3327" stroke-width="2.8"/><polygon points="44,24 96,40 44,58" fill="#3b8fd6" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><circle cx="37" cy="86" r="7" fill="#e0527a" stroke="#1d3327" stroke-width="2.2"/><circle cx="37" cy="86" r="2.2" fill="#fff"/>` },
  { name: '拐角纸片', body: `<path d="M24 30 H76 V52 H96 V74 H54 V52 H24 Z" fill="#8ac5f2" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><rect x="76" y="54" width="18" height="18" fill="#ffd766"/><circle cx="36" cy="41" r="7" fill="#e0527a" stroke="#1d3327" stroke-width="2.2"/><circle cx="36" cy="41" r="2.2" fill="#fff"/>` },
  { name: '钥匙纸片', body: `<path d="M26 26 H92 V46 H74 V62 H60 V46 H46 V94 H26 Z" fill="#f6c36b" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><circle cx="36" cy="82" r="7" fill="#e0527a" stroke="#1d3327" stroke-width="2.2"/><circle cx="36" cy="82" r="2.2" fill="#fff"/>` },
  { name: '钩子纸片', body: `<path d="M26 22 H84 V78 H64 V42 H46 V96 H26 Z" fill="#6bc08e" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><rect x="66" y="60" width="16" height="16" fill="#f08a1c"/><circle cx="36" cy="84" r="7" fill="#e0527a" stroke="#1d3327" stroke-width="2.2"/><circle cx="36" cy="84" r="2.2" fill="#fff"/>` },
  { name: '箭头纸片', body: `<path d="M28 96 V38 H60 V22 L96 48 L60 74 V58 H48 V96 Z" fill="#8ac5f2" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><circle cx="38" cy="85" r="7" fill="#e0527a" stroke="#1d3327" stroke-width="2.2"/><circle cx="38" cy="85" r="2.2" fill="#fff"/>` },
  { name: '折尺纸片', body: `<path d="M24 26 H64 V64 H96 V84 H44 V46 H24 Z" fill="#f6c36b" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><rect x="76" y="66" width="18" height="16" fill="#2f8f5b"/><circle cx="34" cy="36" r="7" fill="#e0527a" stroke="#1d3327" stroke-width="2.2"/><circle cx="34" cy="36" r="2.2" fill="#fff"/>` },
]
function pinRotate(r) {
  const sh = pick(r, PIN_SHAPES)
  const baseAng = pick(r, [0, 90, 180, 270])
  const delta = pick(r, [90, 180, 270])
  const okAng = (baseAng + delta) % 360
  const flipAngs = [0, 90, 180, 270]
  for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [flipAngs[i], flipAngs[j]] = [flipAngs[j], flipAngs[i]] }
  const card = tr => svgWrap(120, 120, `<g transform="${tr}">${sh.body}</g>`)
  const stemTr = baseAng ? `translate(120,7) rotate(${baseAng} 60 60)` : 'translate(120,7)'
  const stem = svgWrap(360, 134,
    `<rect x="115" y="7" width="130" height="120" rx="14" fill="#f7fbf8" stroke="#cfe6d5" stroke-width="2"/>` +
    `<g transform="${stemTr}">${sh.body}</g>` +
    `<path d="M266 44 A24 24 0 0 1 286 78" fill="none" stroke="#3b8fd6" stroke-width="3" stroke-linecap="round"/>` +
    `<polygon points="286,84 278,72 292,74" fill="#3b8fd6"/>` +
    `<text x="294" y="106" text-anchor="middle" font-size="13" font-weight="700" fill="#2a67a6">绕红点旋转</text>`
  )
  return {
    text: `如图是一张被红色图钉固定在墙上的${sh.name}，只能绕图钉旋转（不能翻面）。下面哪一幅可以由它旋转得到？`,
    svg: stem,
    autoLabel: true,
    opts: [
      { svg: card(`rotate(${okAng} 60 60)`), ok: 1 },
      ...flipAngs.slice(0, 3).map(a => ({
        svg: card(`rotate(${a} 60 60) translate(120,0) scale(-1,1)`),
        say: '这张纸片被翻到背面了！绕图钉在墙上旋转，不管转多少度，短边相对长边的左右方向不会变反。',
      })),
    ],
    hint: '想象把纸片顺时针慢慢转到选项的方向，看突出那一侧在长边的左手边还是右手边，旋转不会翻面。',
    explain: `原纸片顺时针旋转 ${delta}°（相当于${delta === 90 ? '转 1 个直角' : delta === 180 ? '转半圈' : '逆时针转 1 个直角'}）就能得到正确选项；另外三幅都把纸片翻过面了。`,
  }
}

/** 6. 旋转找规律（看前 3 幅选第 4 幅）：八等分圆盘 wheel / 指向图案 arrow / 3×3 外圈 ring。 */
function wheelFrame(sectors, cx = 60, cy = 60, rad = 48) {
  let out = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#fffaf0" stroke="#1d3327" stroke-width="2.5"/>`
  for (const s of sectors) {
    const a1 = (s * 45 - 90) * Math.PI / 180, a2 = ((s + 1) * 45 - 90) * Math.PI / 180
    const x1 = cx + rad * Math.cos(a1), y1 = cy + rad * Math.sin(a1)
    const x2 = cx + rad * Math.cos(a2), y2 = cy + rad * Math.sin(a2)
    out += `<path d="M${cx} ${cy}L${x1.toFixed(1)} ${y1.toFixed(1)}A${rad} ${rad} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="#f08a1c"/>`
  }
  let lines = ''
  for (let i = 0; i < 4; i++) {
    const a = (i * 45 - 90) * Math.PI / 180, dx = rad * Math.cos(a), dy = rad * Math.sin(a)
    lines += `M${(cx - dx).toFixed(1)} ${(cy - dy).toFixed(1)}L${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}`
  }
  return out + `<path d="${lines}" stroke="#1d3327" stroke-width="2"/>`
}
const RING8 = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]]
function ringFrame(p1, p2, ox = 15, oy = 15, cs = 30) {
  const [r1, c1] = RING8[p1], [r2, c2] = RING8[p2], w = cs * 3
  return `<rect x="${ox}" y="${oy}" width="${w}" height="${w}" fill="#f7fbf8"/>` +
    `<rect x="${ox + c1 * cs}" y="${oy + r1 * cs}" width="${cs}" height="${cs}" fill="#f08a1c"/>` +
    `<rect x="${ox + c2 * cs}" y="${oy + r2 * cs}" width="${cs}" height="${cs}" fill="#2f8f5b"/>` +
    `<path d="M${ox} ${oy}h${w}v${w}h-${w}zM${ox + cs} ${oy}v${w}M${ox + cs * 2} ${oy}v${w}M${ox} ${oy + cs}h${w}M${ox} ${oy + cs * 2}h${w}" fill="none" stroke="#1d3327" stroke-width="2"/>`
}
const ARROW_MOTIFS = [
  { name: '小鱼', tip: '鱼头', body: `<polygon points="24,38 46,60 24,82" fill="#f08a1c" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><polygon points="46,30 96,60 46,90" fill="#6bc08e" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><circle cx="72" cy="56" r="5" fill="#1d3327"/>` },
  { name: '小火箭', tip: '箭头', body: `<polygon points="22,42 40,60 22,78" fill="#e0527a" stroke="#1d3327" stroke-width="2.6" stroke-linejoin="round"/><path d="M36 42 H74 L98 60 L74 78 H36 Z" fill="#8ac5f2" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><circle cx="64" cy="60" r="8" fill="#ffd766" stroke="#1d3327" stroke-width="2"/>` },
  { name: '彩旗箭头', tip: '旗尖', body: `<rect x="20" y="50" width="42" height="20" rx="4" fill="#f08a1c" stroke="#1d3327" stroke-width="2.6"/><polygon points="58,30 100,60 58,90" fill="#2f8f5b" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><circle cx="38" cy="60" r="5" fill="#fffaf0"/>` },
]
function arrowFrame(motif, ang) {
  return `<g transform="rotate(${ang} 60 60)">${motif.body}</g>`
}
function seqStrip(frames) {
  const xs = [12, 114, 216]
  let out = ''
  frames.forEach((f, i) => {
    out += `<rect x="${xs[i]}" y="12" width="84" height="84" rx="10" fill="#fff" stroke="#cfe6d5" stroke-width="2"/>` +
      `<g transform="translate(${xs[i] + 42},54) scale(0.66) translate(-60,-60)">${f}</g>` +
      `<text x="${xs[i] + 93}" y="60" text-anchor="middle" font-size="17" font-weight="700" fill="#5f7a69">→</text>`
  })
  out += `<rect x="318" y="12" width="84" height="84" rx="10" fill="#eef6fd" stroke="#3b8fd6" stroke-width="2.5" stroke-dasharray="6 5"/>` +
    `<text x="360" y="68" text-anchor="middle" font-size="38" font-weight="700" fill="#3b8fd6">？</text>`
  return svgWrap(414, 108, out)
}
function rotPattern(r, subOpt) {
  const sub = subOpt && ['wheel', 'arrow', 'ring'].includes(subOpt) ? subOpt : pick(r, ['wheel', 'arrow', 'ring'])
  const dir = pick(r, [1, -1]), dirWord = dir > 0 ? '顺时针' : '逆时针'
  if (sub === 'wheel') {
    const pair = r() < 0.6
    const step = pair ? 1 : pick(r, [1, 2])
    const s0 = randInt(r, 0, 7)
    const at = k => (s0 + dir * step * k + 80) % 8
    const secs = s => pair ? [s, (s + 4) % 8] : [s]
    const f = k => wheelFrame(secs(at(k)))
    const s2 = at(2), s3 = at(3)
    const rev = (s2 - dir * step + 80) % 8, over = (s3 + dir + 80) % 8, stay = s2
    const seen = new Set([secs(s3).sort().join(',')])
    const rawOpts = [{ svg: svgWrap(120, 120, wheelFrame(secs(s3))), ok: 1 }]
    const tryAdd = (s, say) => {
      const k = secs(s).sort().join(',')
      if (seen.has(k) || rawOpts.length >= 4) return
      seen.add(k); rawOpts.push({ svg: svgWrap(120, 120, wheelFrame(secs(s))), say })
    }
    tryAdd(rev, `转动方向看反啦！前 3 幅每次都是${dirWord}转动。`)
    tryAdd(over, `多转了 1 格！每次只${dirWord}转 ${step} 格。`)
    tryAdd(stay, `第 4 幅还要从第 3 幅继续${dirWord}转 ${step} 格，不能停在原地。`)
    for (let s = 0; s < 8 && rawOpts.length < 4; s++) tryAdd(s, `对比第 1 幅到第 2 幅，每次${dirWord}转动 ${step} 格。`)
    return {
      text: '观察下面圆盘涂色部分旋转的规律，第 4 个圆盘应该是哪一幅？',
      svg: seqStrip([f(0), f(1), f(2)]),
      autoLabel: true,
      opts: rawOpts,
      hint: '先只盯住其中一块涂色扇形，看它从第 1 幅到第 2 幅是顺时针还是逆时针转了几格。',
      explain: `涂色部分每次${dirWord}旋转 ${step} 格，所以第 4 幅要从第 3 幅继续${dirWord}转 ${step} 格。`,
    }
  }
  if (sub === 'arrow') {
    const motif = pick(r, ARROW_MOTIFS), s0 = randInt(r, 0, 3)
    const at = k => ((s0 + dir * k) % 4 + 4) % 4
    const f = k => arrowFrame(motif, at(k) * 90)
    const s3 = at(3), s2 = at(2), s1 = at(1), s0a = at(0)
    return {
      text: `观察${motif.name}旋转的规律，问号方框里应该填哪一幅？`,
      svg: seqStrip([f(0), f(1), f(2)]),
      autoLabel: true,
      opts: [
        { svg: svgWrap(120, 120, arrowFrame(motif, s3 * 90)), ok: 1 },
        { svg: svgWrap(120, 120, arrowFrame(motif, s1 * 90)), say: `旋转方向看反啦！${motif.name}每次是${dirWord}旋转 90°。` },
        { svg: svgWrap(120, 120, arrowFrame(motif, s2 * 90)), say: '这和第 3 幅一样，还要继续旋转一次才到第 4 幅。' },
        { svg: svgWrap(120, 120, arrowFrame(motif, s0a * 90)), say: '这是第 1 幅的方向，第 4 幅还没转满一圈，再按顺序数一次。' },
      ],
      hint: `看${motif.tip}指向的方向（上、右、下、左），每走一格转一个直角。`,
      explain: `${motif.name}每次${dirWord}旋转 90°（一个直角），按这个方向从第 3 幅再转一次就得到第 4 幅。`,
    }
  }
  // sub === 'ring'：3×3 外圈 8 格循环移动
  const step = 1, p0 = randInt(r, 0, 7), gap = pick(r, [2, 3, 4])
  const at = k => (p0 + dir * step * k + 80) % 8
  const pair = p => [p, (p + gap) % 8]
  const f = k => ringFrame(...pair(at(k)))
  const p2 = at(2), p3 = at(3)
  const opts = [
    { svg: svgWrap(120, 120, ringFrame(...pair(p3))), ok: 1 },
    { svg: svgWrap(120, 120, ringFrame(...pair((p2 - dir + 80) % 8))), say: `方向看反啦！盯住橙色方格，它是沿外圈${dirWord}走的。` },
    { svg: svgWrap(120, 120, ringFrame(...pair((p3 + dir + 80) % 8))), say: '多移动了 1 格！每次沿外圈只走 1 格。' },
    { svg: svgWrap(120, 120, ringFrame(...pair(p2))), say: '第 4 幅还要从第 3 幅继续往前移动 1 格。' },
  ]
  return {
    text: '观察方格里涂色块沿外圈移动的规律，第 4 幅应该是哪一幅？',
    svg: seqStrip([f(0), f(1), f(2)]),
    autoLabel: true,
    opts,
    hint: '先只盯住橙色那一格，沿着最外面一圈一格一格数它走了几步。',
    explain: `两个涂色格一起沿外圈每次${dirWord}移动 1 格，从第 3 幅再${dirWord}走 1 格即得第 4 幅。`,
  }
}

/** 7. 方格平移与倒推原位置（寻宝/棋子平移，专治「把起点格算进去少走 1 格」和「方向搞反」）。 */
function gridMove(r, modeOpt) {
  const rev = modeOpt === 'reverse' || (modeOpt !== 'forward' && r() < 0.5)
  const W = 7, H = 5
  for (let tries = 0; tries < 200; tries++) {
    const sx = randInt(r, 0, W - 1), sy = randInt(r, 0, H - 1)
    const hSign = pick(r, [-1, 1]), vSign = pick(r, [-1, 1])
    const hn = randInt(r, 2, 4), vn = randInt(r, 1, 3)
    const tx = sx + hSign * hn, ty = sy + vSign * vn
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue
    const hDir = hSign > 0 ? '东' : '西', vDir = vSign > 0 ? '南' : '北'
    const firstH = r() < 0.5
    // 正向：从 ○(sx,sy) 走到终点(tx,ty)；倒推：已知从原位置(sx,sy) 走到 △(tx,ty)，反找(sx,sy)
    const mark = rev ? [tx, ty] : [sx, sy], ans = rev ? [sx, sy] : [tx, ty]
    const inB = ([x, y]) => x >= 0 && x < W && y >= 0 && y < H
    const key = ([x, y]) => `${x},${y}`
    const cand = rev ? [
      // 倒推经典错法：数横向格数时把 △ 当第 1 格，少移 1 格
      { p: [sx + hSign, sy], say: '倒推数平移格数时，不能把 △ 所在格算成第 1 格！从你选的点按题目走一遍，会少 1 格。' },
      // 忘记把方向反过来（从 △ 继续顺着走）
      { p: [tx + hSign * hn, ty + vSign * vn], say: '倒推原来的位置要把方向反过来！顺着走会越走越远。' },
      // 只反了一个方向
      { p: [sx, ty + vSign * vn], say: '南北和东西两个方向都要反过来推，推完再正着走一遍核对。' },
      { p: [tx + hSign * hn, sy], say: '东西方向忘反过来了！题目是向' + hDir + '到达 △，倒推要向' + (hSign > 0 ? '西' : '东') + '找。' },
      // 纵向少推 1 格
      { p: [sx, sy + vSign], say: '纵向少推了 1 格！每跨过一条横格线才算平移 1 格。' },
      // 横纵格数写反
      { p: [tx - hSign * vn, ty - vSign * hn], say: '横向和纵向的格数看反啦！看清每个方向平移几格。' },
    ] : [
      // 正向经典错法：数横向格数把起点算进去，少走 1 格
      { p: [tx - hSign, ty], say: '数平移格数不能把起点 ○ 算成第 1 格，要数跨过几条格线！' },
      // 少走纵向 1 格
      { p: [tx, ty - vSign], say: '上下方向少走了 1 格！用笔尖点着一格一格数。' },
      // 只走了第一步（漏走第二步）
      { p: firstH ? [tx, sy] : [sx, ty], say: '只走完了第一步，忘了走第二步！两步都要走完。' },
      // 东西/南北走反
      { p: [sx - hSign * hn, ty], say: '东西方向看反啦！对照“上北下南、左西右东”再走一遍。' },
      { p: [tx, sy - vSign * vn], say: '南北方向看反啦！对照右上角的“↑北”再走一遍。' },
      // 横纵格数对调
      { p: [sx + hSign * vn, sy + vSign * hn], say: '横着和竖着的格数看反啦！再核对一下每个方向走几格。' },
    ]
    const used = new Set([key(mark), key(ans)]), traps = []
    for (const c of cand) {
      if (inB(c.p) && !used.has(key(c.p)) && traps.length < 3) { used.add(key(c.p)); traps.push(c) }
    }
    if (traps.length < 3) continue
    // 把 4 个点打乱贴上 A/B/C/D 标签
    const pts = [{ p: ans, ok: 1 }, ...traps]
    for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]] }
    const cs = 38, ox = 18, oy = 12
    let gridD = ''
    for (let x = 0; x <= W; x++) gridD += `M${ox + x * cs} ${oy}v${H * cs}`
    for (let y = 0; y <= H; y++) gridD += `M${ox} ${oy + y * cs}h${W * cs}`
    const grid = `<path d="${gridD}" fill="none" stroke="#89a895" stroke-width="1.8"/>`
    const cx = x => ox + x * cs + cs / 2, cy = y => oy + y * cs + cs / 2
    const marker = rev
      ? `<polygon points="${cx(mark[0])},${cy(mark[1]) - 12} ${cx(mark[0]) - 12},${cy(mark[1]) + 10} ${cx(mark[0]) + 12},${cy(mark[1]) + 10}" fill="#ffd766" stroke="#1d3327" stroke-width="2.5"/>`
      : `<circle cx="${cx(mark[0])}" cy="${cy(mark[1])}" r="11" fill="#ffd766" stroke="#1d3327" stroke-width="2.5"/>`
    const dots = pts.map((x, i) => `<circle cx="${cx(x.p[0])}" cy="${cy(x.p[1])}" r="13" fill="#3b8fd6"/><text x="${cx(x.p[0])}" y="${cy(x.p[1]) + 6}" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">${LABS[i]}</text>`).join('')
    const compass = `<line x1="330" y1="64" x2="330" y2="26" stroke="#1d3327" stroke-width="3" stroke-linecap="round"/><polygon points="330,18 323,32 337,32" fill="#1d3327"/><text x="330" y="84" text-anchor="middle" font-size="16" font-weight="700" fill="#1d3327">北</text><text x="330" y="108" text-anchor="middle" font-size="13" fill="#5f7a69">上北下南</text><text x="330" y="126" text-anchor="middle" font-size="13" fill="#5f7a69">左西右东</text>`
    const stem = svgWrap(374, 214, `<rect x="${ox}" y="${oy}" width="${W * cs}" height="${H * cs}" fill="#fff"/>${grid}${marker}${dots}${compass}`)
    const step1 = firstH ? `向${hDir}平移 ${hn} 格` : `向${vDir}平移 ${vn} 格`
    const step2 = firstH ? `向${vDir}平移 ${vn} 格` : `向${hDir}平移 ${hn} 格`
    const revH = hSign > 0 ? '西' : '东', revV = vSign > 0 ? '北' : '南'
    return {
      text: rev
        ? `小棋子从原来的位置先${step1}，再${step2}，到达了黄色 △ 的位置。它原来的位置在哪个字母处？`
        : `小棋子从黄色 ○ 出发，先${step1}，再${step2}，最后会到达哪个字母处？`,
      svg: stem,
      keepOrder: true,
      opts: pts.map((x, i) => ({ t: LABS[i], ...(x.ok ? { ok: 1 } : { say: x.say }) })),
      hint: rev
        ? '倒推原来的位置要把方向反过来：原来向东就往西数，向南就往北数；起点格不算第 1 格。'
        : '用手指从 ○ 出发一格一格走，每跨过一条格线算 1 格，走完两步再看落到哪个字母。',
      explain: rev
        ? `从 △ 倒推回去：向${revH}平移 ${hn} 格，再向${revV}平移 ${vn} 格（跨过对应条数的格线），原来在 ${LABS[pts.findIndex(x => x.ok)]} 处。`
        : `从 ○ 先${step1}、再${step2}，每跨过一条格线算 1 格，正好落到 ${LABS[pts.findIndex(x => x.ok)]} 处。`,
    }
  }
  return null
}

/** 8. 轴对称图形图片库（16 张严格轴对称 + 14 张严格非对称，每次随机抽 1+3 出图选）。 */
const SYM_YES = [
  { name: '红领巾', axis: '沿中间竖线左右对折两边完全重合', body: `<polygon points="14,34 106,34 60,94" fill="#e0527a" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><polygon points="50,34 70,34 60,48" fill="#ffd766" stroke="#1d3327" stroke-width="2.2" stroke-linejoin="round"/>` },
  { name: '蝴蝶', axis: '沿身体中线左右对折两对翅膀完全重合', body: `<ellipse cx="38" cy="46" rx="22" ry="18" fill="#f08a1c" stroke="#1d3327" stroke-width="2.5"/><ellipse cx="82" cy="46" rx="22" ry="18" fill="#f08a1c" stroke="#1d3327" stroke-width="2.5"/><ellipse cx="42" cy="76" rx="16" ry="14" fill="#ffd766" stroke="#1d3327" stroke-width="2.5"/><ellipse cx="78" cy="76" rx="16" ry="14" fill="#ffd766" stroke="#1d3327" stroke-width="2.5"/><rect x="56" y="34" width="8" height="54" rx="4" fill="#1d3327"/><path d="M58 34Q46 18 40 22M62 34Q74 18 80 22" fill="none" stroke="#1d3327" stroke-width="2.5" stroke-linecap="round"/>` },
  { name: '小飞机', axis: '沿机身中线左右对折两翼完全重合', body: `<polygon points="60,16 70,42 106,64 106,74 68,62 66,86 82,98 82,106 60,98 38,106 38,98 54,86 52,62 14,74 14,64 50,42" fill="#8ac5f2" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><circle cx="60" cy="46" r="5" fill="#fffaf0" stroke="#1d3327" stroke-width="2"/>` },
  { name: 'T 恤衫', axis: '沿正中竖线左右对折两只袖子完全重合', body: `<path d="M44 24Q60 36 76 24L104 38L94 60L82 54V98H38V54L26 60L16 38Z" fill="#6bc08e" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><circle cx="60" cy="64" r="9" fill="#ffd766" stroke="#1d3327" stroke-width="2"/>` },
  { name: '爱心', axis: '沿中间竖线左右对折两边完全重合', body: `<path d="M60 98C24 74 16 50 28 34C38 22 54 26 60 38C66 26 82 22 92 34C104 50 96 74 60 98Z" fill="#e0527a" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '五角星', axis: '沿过顶角的直线对折两边完全重合', body: `<polygon points="60,14 73,44 106,46 80,68 88,100 60,82 32,100 40,68 14,46 47,44" fill="#ffd766" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '长方形信封', axis: '沿中间竖线左右对折完全重合', body: `<rect x="16" y="30" width="88" height="60" rx="4" fill="#fffaf0" stroke="#1d3327" stroke-width="2.8"/><polyline points="16,32 60,64 104,32" fill="none" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><circle cx="60" cy="64" r="6" fill="#e0527a"/>` },
  { name: '小松树', axis: '沿树干中线左右对折完全重合', body: `<rect x="52" y="84" width="16" height="22" fill="#c98542" stroke="#1d3327" stroke-width="2.5"/><polygon points="60,14 92,50 76,50 98,84 22,84 44,50 28,50" fill="#2f8f5b" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '小皇冠', axis: '沿中间竖线左右对折完全重合', body: `<polygon points="18,88 18,38 40,60 60,26 80,60 102,38 102,88" fill="#ffd766" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><circle cx="60" cy="24" r="5" fill="#e0527a"/><circle cx="18" cy="36" r="5" fill="#3b8fd6"/><circle cx="102" cy="36" r="5" fill="#3b8fd6"/>` },
  { name: '对称小房子', axis: '门窗都在正中间，沿竖直中线对折完全重合', body: `<polygon points="18,56 60,18 102,56" fill="#e0527a" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><rect x="26" y="56" width="68" height="46" fill="#fffaf0" stroke="#1d3327" stroke-width="2.8"/><rect x="50" y="70" width="20" height="32" rx="3" fill="#3b8fd6" stroke="#1d3327" stroke-width="2.4"/><circle cx="60" cy="42" r="7" fill="#ffd766" stroke="#1d3327" stroke-width="2"/>` },
  { name: '等腰梯形', axis: '左右两条斜边一样长，沿中线对折完全重合', body: `<polygon points="36,28 84,28 104,92 16,92" fill="#8ac5f2" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/>` },
  { name: '菱形', axis: '沿横竖两条对角线对折都能完全重合', body: `<polygon points="60,16 102,60 60,104 18,60" fill="#a7d6fb" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><circle cx="60" cy="60" r="12" fill="#ffd766" stroke="#1d3327" stroke-width="2.4"/>` },
  { name: '蜻蜓', axis: '沿身体中线左右对折两对翅膀完全重合', body: `<ellipse cx="34" cy="44" rx="22" ry="8" fill="#8ac5f2" stroke="#1d3327" stroke-width="2.4"/><ellipse cx="86" cy="44" rx="22" ry="8" fill="#8ac5f2" stroke="#1d3327" stroke-width="2.4"/><ellipse cx="38" cy="60" rx="18" ry="7" fill="#a7d6fb" stroke="#1d3327" stroke-width="2.4"/><ellipse cx="82" cy="60" rx="18" ry="7" fill="#a7d6fb" stroke="#1d3327" stroke-width="2.4"/><rect x="56" y="34" width="8" height="68" rx="4" fill="#2f8f5b" stroke="#1d3327" stroke-width="2.2"/><circle cx="60" cy="28" r="9" fill="#f08a1c" stroke="#1d3327" stroke-width="2.4"/>` },
  { name: '字母 A', axis: '沿中间竖线左右对折完全重合', body: `<path d="M60 18L94 100H78L71 80H49L42 100H26ZM53 66H67L60 44Z" fill="#3b8fd6" fill-rule="evenodd" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '汉字“中”', axis: '沿中间竖线左右对折完全重合', body: `<rect x="22" y="38" width="76" height="36" fill="none" stroke="#1d3327" stroke-width="9" stroke-linejoin="round"/><line x1="60" y1="16" x2="60" y2="104" stroke="#e0527a" stroke-width="9" stroke-linecap="round"/>` },
  { name: '字母 H', axis: '沿横线或竖线对折都能完全重合', body: `<path d="M26 20H42V52H78V20H94V100H78V68H42V100H26Z" fill="#6bc08e" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
]
const SYM_NO = [
  { name: '平行四边形', say: '平行四边形看起来整齐，但沿直线对折后两边会错开，不是轴对称图形！', body: `<polygon points="34,30 104,30 86,90 16,90" fill="#f6c36b" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/>` },
  { name: '旋转风车', say: '风车转起来对称，但叶片都朝同一边斜，沿直线对折会反着错开，不是轴对称图形！', body: `<g stroke="#1d3327" stroke-width="2.4" stroke-linejoin="round"><path d="M60 60L60 16L84 36Z" fill="#e0527a"/><path d="M60 60L104 60L84 84Z" fill="#f08a1c"/><path d="M60 60L60 104L36 84Z" fill="#3b8fd6"/><path d="M60 60L16 60L36 36Z" fill="#2f8f5b"/></g><circle cx="60" cy="60" r="6" fill="#ffd766" stroke="#1d3327" stroke-width="2"/>` },
  { name: '不等边三角形', say: '这个三角形三条边都不一样长，怎么对折两边都没法完全重合。', body: `<polygon points="22,94 104,84 42,20" fill="#8ac5f2" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/>` },
  { name: '不等腰直角三角形', say: '两条直角边一长一短，无论怎么对折都不能完全重合。', body: `<polygon points="22,36 22,94 104,94" fill="#6bc08e" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><polyline points="22,80 36,80 36,94" fill="none" stroke="#1d3327" stroke-width="2.2"/>` },
  { name: '直角梯形', say: '直角梯形左边是直的、右边是斜的，对折后两边重合不了。', body: `<polygon points="24,28 70,28 100,92 24,92" fill="#f6c36b" stroke="#1d3327" stroke-width="3" stroke-linejoin="round"/><polyline points="24,78 38,78 38,92" fill="none" stroke="#1d3327" stroke-width="2.2"/>` },
  { name: '不对称小房子', say: '烟囱和圆窗在左边、门在右边，沿中间对折对不到一起！', body: `<rect x="28" y="20" width="12" height="24" fill="#f08a1c" stroke="#1d3327" stroke-width="2.5"/><polygon points="18,54 60,18 102,54" fill="#e0527a" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><rect x="26" y="54" width="68" height="46" fill="#fffaf0" stroke="#1d3327" stroke-width="2.8"/><rect x="66" y="68" width="18" height="32" fill="#3b8fd6" stroke="#1d3327" stroke-width="2.4"/><circle cx="44" cy="74" r="9" fill="#ffd766" stroke="#1d3327" stroke-width="2.2"/>` },
  { name: '弯柄雨伞', say: '伞顶虽然左右一样，但下面的伞柄只往右边弯，对折后伞柄重合不了，不是轴对称图形！', body: `<path d="M18 58A42 38 0 0 1 102 58Z" fill="#3b8fd6" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/><line x1="60" y1="14" x2="60" y2="20" stroke="#1d3327" stroke-width="4" stroke-linecap="round"/><path d="M60 58V92A10 10 0 0 0 80 92" fill="none" stroke="#1d3327" stroke-width="5" stroke-linecap="round"/>` },
  { name: '单侧小旗子', say: '旗面只挂在旗杆一边，对折后另一边是空的，不是轴对称图形。', body: `<line x1="32" y1="18" x2="32" y2="102" stroke="#1d3327" stroke-width="6" stroke-linecap="round"/><polygon points="35,20 98,38 35,58" fill="#e0527a" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '小帆船', say: '船帆偏向一边，左右不对称，对折后不能完全重合。', body: `<line x1="48" y1="20" x2="48" y2="74" stroke="#1d3327" stroke-width="4.5" stroke-linecap="round"/><polygon points="50,22 96,66 50,66" fill="#f08a1c" stroke="#1d3327" stroke-width="2.6" stroke-linejoin="round"/><polygon points="18,74 102,74 88,98 30,98" fill="#3b8fd6" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '字母 F', say: '字母 F 的两横只朝一边伸出，怎么对折都不能完全重合。', body: `<path d="M30 20H92V36H48V52H80V68H48V100H30Z" fill="#e0527a" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '字母 N', say: '字母 N 转半圈一样，但沿直线对折中间斜线会错开，不是轴对称图形！', body: `<path d="M26 100V20H44L76 72V20H94V100H76L44 48V100Z" fill="#8e5cc8" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '字母 Z', say: '字母 Z 转半圈一样，但沿直线对折会变成反 Z，不能重合！', body: `<path d="M24 22H96V38L48 84H96V100H24V84L72 38H24Z" fill="#f08a1c" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: '数字 2', say: '数字 2 左右对折会变成 5，上下对折也会变反，不是轴对称图形。', body: `<path d="M28 22H92V66H46V84H92V100H28V52H74V38H28Z" fill="#3b8fd6" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
  { name: 'L 形拐角', say: '这个 L 形一竖长、一横短，斜着对折也重合不了，不是轴对称图形。', body: `<path d="M30 16H50V82H86V100H30Z" fill="#2f8f5b" stroke="#1d3327" stroke-width="2.8" stroke-linejoin="round"/>` },
]
function pickMany(r, arr, k) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a.slice(0, k)
}
function symPick(r, subOpt) {
  const askNot = subOpt === 'not' || (subOpt !== 'is' && r() < 0.5)
  if (askNot) {
    const right = pick(r, SYM_NO)
    const wrongs = pickMany(r, SYM_YES, 3)
    return {
      text: '观察下面四幅图，哪一个图形「不是」轴对称图形？',
      autoLabel: true,
      opts: [
        { svg: svgWrap(120, 120, right.body), ok: 1 },
        ...wrongs.map(x => ({ svg: svgWrap(120, 120, x.body), say: `${x.name}${x.axis}，它是轴对称图形，本题要找「不是」的那一个！` })),
      ],
      hint: '试着在脑海里找一条直线把图形对折：如果怎么折两边都重合不了，它就不是轴对称图形。',
      explain: `${right.name}不是轴对称图形（${right.say}）；另外三幅图都能找到对称轴使两边完全重合。`,
    }
  }
  const right = pick(r, SYM_YES)
  const wrongs = pickMany(r, SYM_NO, 3)
  return {
    text: '观察下面四幅图，哪一个图形是轴对称图形（沿一条直线对折后两边能完全重合）？',
    autoLabel: true,
    opts: [
      { svg: svgWrap(120, 120, right.body), ok: 1 },
      ...wrongs.map(x => ({ svg: svgWrap(120, 120, x.body), say: x.say })),
    ],
    hint: '想象把图形沿着一条直线对折，两边能严丝合缝完全重合的才是轴对称图形。',
    explain: `${right.name}${right.axis}，是轴对称图形；另外三幅图无论怎么对折都不能完全重合。`,
  }
}

export const SYM_LIBRARY = { yes: SYM_YES, no: SYM_NO }
export const MOTION_KINDS = ['water', 'mirror_grid', 'mirror_digits', 'mirror_clock', 'pin_rotate', 'rot_pattern', 'grid_move', 'sym_pick']

/** 按模板的 motion 配置生成一道图形运动选择题（返回 { text, svg, opts, hint, explain, autoLabel, keepOrder }）。 */
export function buildMotion(m, r) {
  const kind = m?.kind
  if (kind === 'water') return waterScene(r)
  if (kind === 'mirror_grid') return mirrorGrid(r)
  if (kind === 'mirror_digits') return mirrorDigits(r)
  if (kind === 'mirror_clock') return mirrorClock(r)
  if (kind === 'pin_rotate') return pinRotate(r)
  if (kind === 'rot_pattern') return rotPattern(r, m.sub)
  if (kind === 'grid_move') return gridMove(r, m.dir)
  if (kind === 'sym_pick') return symPick(r, m.sub)
  return null
}
