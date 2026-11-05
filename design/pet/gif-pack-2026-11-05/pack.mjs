import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'

const root = path.dirname(fileURLToPath(import.meta.url)), manifestPath = path.join(root, 'manifest.json')
const encoder = path.join(root, 'scripts/build-gif-shared.mjs'), size = 512, count = 8
const [command = 'check', ...ids] = process.argv.slice(2)
if (!['check', 'build', 'validate', 'preview', 'zip'].includes(command)) throw new Error('命令：check / build [动作ID...] / validate / preview / zip')
if (ids.length && command !== 'build') throw new Error('只有 build 可以指定动作 ID')
const sha = data => createHash('sha256').update(data).digest('hex')
const read = file => fs.readFile(file)
const exists = async file => { try { await fs.access(file); return true } catch { return false } }
const relative = file => path.relative(root, file).split(path.sep).join('/')
const asset = (id, tail) => path.join(root, 'assets', id + tail)
const inside = value => {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes('\\')) throw new Error('raw 必须是本目录中的相对路径')
  const full = path.resolve(root, value)
  if (!full.startsWith(root + path.sep) || value.split('/').includes('..')) throw new Error('raw 不能指向素材包目录外')
  return full
}

async function loadManifest() {
  const bytes = await read(manifestPath), manifest = JSON.parse(bytes)
  if (manifest.version !== 1 || !Array.isArray(manifest.stages) || !Array.isArray(manifest.items) || !manifest.items.length) throw new Error('清单需要 version: 1、stages 和非空 items 数组')
  const stages = new Set(), names = new Set(), raws = new Set()
  for (const stage of manifest.stages) {
    if (![2, 3].includes(stage.id) || stages.has(stage.id) || !stage.name?.trim()) throw new Error('阶段必须是唯一的 2 / 3，且有中文名称')
    stages.add(stage.id)
  }
  for (const item of manifest.items) {
    if (!/^s[23]-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || names.has(item.id)) throw new Error(`动作 ID 无效或重复：${item.id}`)
    if (!stages.has(item.stage) || !item.id.startsWith(`s${item.stage}-`)) throw new Error(`动作阶段不匹配：${item.id}`)
    if (typeof item.name !== 'string' || !item.name.trim() || typeof item.category !== 'string' || !item.category.trim()) throw new Error(`动作缺少名称或分类：${item.id}`)
    if (!Array.isArray(item.coverage) || item.coverage.some(v => typeof v !== 'string') || (item.note != null && typeof item.note !== 'string')) throw new Error(`coverage / note 格式不正确：${item.id}`)
    if (!Array.isArray(item.durations) || item.durations.length !== count || item.durations.some(ms => !Number.isInteger(ms) || ms < 20 || ms > 10000 || ms % 10)) throw new Error(`动作必须有八个 20–10000 毫秒、10 的倍数的延迟：${item.id}`)
    const raw = inside(item.raw)
    if (!item.raw.startsWith('raw/') || !/\.(png|webp)$/i.test(item.raw) || raws.has(raw)) throw new Error(`原图应为 raw/ 下独立的 PNG / WebP：${item.id}`)
    names.add(item.id); raws.add(raw)
  }
  for (const id of ids) if (!names.has(id)) throw new Error(`清单里没有动作：${id}`)
  let coverage = null
  if (manifest.coverageSource) {
    const mapping = JSON.parse(await fs.readFile(inside(manifest.coverageSource), 'utf8')), actions = new Set(mapping.actions?.map(a => a.id))
    if (!actions.size || !Array.isArray(mapping.entries)) throw new Error('覆盖清单缺少 actions / entries')
    if (mapping.stageGifCount !== manifest.items.length) throw new Error('覆盖清单与素材清单的阶段 GIF 数不一致')
    for (const action of mapping.actions) for (const stage of action.stages) if (manifest.items.filter(i => i.stage === Number(String(stage).replace(/^s/, '')) && (i.action || i.id.slice(3)) === action.id).length !== 1) throw new Error(`阶段动作缺失或重复：${stage}-${action.id}`)
    for (const entry of mapping.entries) if (!Array.isArray(entry.assetIds) || entry.assetIds.some(id => !actions.has(id))) throw new Error(`入口引用未知动作：${entry.id}`)
    for (const item of manifest.items) if (!actions.has(item.action || item.id.slice(3))) throw new Error(`素材动作未列入覆盖清单：${item.id}`)
    coverage = { actions: actions.size, entries: mapping.entries.length, intentionallyStatic: mapping.entries.filter(e => !e.assetIds.length).length, important: mapping.important || '' }
  }
  return { manifest, manifestHash: sha(bytes), encoderHash: sha(await read(encoder)), coverage }
}

function pixelsInfo(pixels, width, height) {
  let transparent = 0, visible = 0, left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = pixels[(y * width + x) * 4 + 3]
    if (alpha === 0) transparent++
    if (alpha > 8) { visible++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y) }
  }
  const edgeClearance = [left, top, width - 1 - right, height - 1 - bottom]
  return { transparent, visible, transparentFraction: transparent / (width * height), bounds: [left, top, right, bottom], edgeClearance, minMargin: Math.min(...edgeClearance) }
}

async function checkRaw(item) {
  const file = inside(item.raw)
  if (!(await fs.realpath(file)).startsWith(root + path.sep)) throw new Error('原图的符号链接指向本目录外')
  const bytes = await read(file), metadata = await sharp(bytes).metadata()
  if (!metadata.hasAlpha || !['png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('原图需要单页 PNG / WebP 和真实 Alpha 通道；不自动抠底')
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), frames = []
  for (let i = 0; i < count; i++) {
    const col = i % 4, row = Math.floor(i / 4), left = Math.floor(col * info.width / 4), top = Math.floor(row * info.height / 2)
    const width = Math.floor((col + 1) * info.width / 4) - left, height = Math.floor((row + 1) * info.height / 2) - top
    const pixels = await sharp(data, { raw: info }).extract({ left, top, width, height }).raw().toBuffer()
    const frame = pixelsInfo(pixels, width, height)
    if (frame.visible < width * height * .01 || frame.transparentFraction < .01) throw new Error(`第 ${i + 1} 格为空，或没有足够的真实透明区域`)
    if (frame.minMargin < 1) throw new Error(`原图第 ${i + 1} 格主体触碰格边，疑似裁断；请人工复核或重新生成`)
    frames.push(frame)
  }
  return { sha256: sha(bytes), width: metadata.width, height: metadata.height, grid: [4, 2], frames }
}

async function checkGif(item, source, encoderHash) {
  const gifPath = asset(item.id, '.gif'), validationPath = asset(item.id, '-validation.json')
  const bytes = await read(gifPath), signature = bytes.subarray(0, 6).toString('ascii')
  if (!['GIF87a', 'GIF89a'].includes(signature)) throw new Error('输出不是实际 GIF 编码')
  const provenance = JSON.parse(await fs.readFile(validationPath, 'utf8')).source
  if (!provenance || provenance.sha256 !== source.sha256 || provenance.encoderSha256 !== encoderHash || JSON.stringify(provenance.durations) !== JSON.stringify(item.durations)) throw new Error('原图、帧延迟或编码器已改变，需要重新 build')
  const metadata = await sharp(bytes, { animated: true }).metadata()
  if (metadata.format !== 'gif' || metadata.pages !== count || metadata.width !== size || metadata.pageHeight !== size || metadata.loop !== 0) throw new Error('GIF 尺寸 / 八帧 / 循环校验失败')
  if (JSON.stringify(metadata.delay) !== JSON.stringify(item.durations)) throw new Error('GIF 帧延迟与清单不一致')
  const decoded = await sharp(bytes, { animated: true }).ensureAlpha().raw().toBuffer(), frames = [], hashes = new Set()
  for (let i = 0; i < count; i++) {
    const pixels = decoded.subarray(i * size * size * 4, (i + 1) * size * size * 4), frame = pixelsInfo(pixels, size, size)
    if (frame.transparentFraction < .01 || frame.visible < size * size * .01) throw new Error(`GIF 第 ${i + 1} 帧为空或失去透明背景`)
    if (frame.minMargin < 2) throw new Error(`GIF 第 ${i + 1} 帧缺少透明外边距`)
    const pngPath = path.join(asset(item.id, '-frames'), `${String(i).padStart(2, '0')}.png`)
    const png = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    if (png.info.width !== size || png.info.height !== size) throw new Error(`PNG 第 ${i + 1} 帧尺寸异常`)
    let mismatch = 0
    for (let p = 0; p < size * size; p++) if (pixels[p * 4 + 3] !== (png.data[p * 4 + 3] < 128 ? 0 : 255)) mismatch++
    if (mismatch) throw new Error(`GIF 第 ${i + 1} 帧 Alpha / 清屏与 PNG 不一致：${mismatch} 像素`)
    hashes.add(sha(pixels)); frames.push({ ...frame, alphaMismatch: mismatch })
  }
  if (hashes.size < 2) throw new Error('八帧完全相同，不是动画')
  const bottoms = frames.map(f => f.bounds[3]), bottomRangePx = Math.max(...bottoms) - Math.min(...bottoms), warnings = []
  if (!['hop', 'disc'].includes(item.action) && bottomRangePx > 12) warnings.push(`非跳跃动作的整体不透明包围框底部漂移 ${bottomRangePx}px，请目检是否需要稳定位移`)
  return { sha256: sha(bytes), bytes: bytes.length, width: size, height: size, pages: count, durationMs: metadata.delay.reduce((a, b) => a + b, 0), loop: 0, uniqueFrames: hashes.size, bottomRangePx, startEndBottomDeltaPx: bottoms.at(-1) - bottoms[0], warnings, frames }
}

async function processItem(item, encoderHash) {
  const result = { ...item, status: 'pending', message: '等待原图', files: null }
  if (!await exists(inside(item.raw))) return result
  try {
    const source = result.source = await checkRaw(item)
    const selected = command === 'build' && (!ids.length || ids.includes(item.id))
    let technical
    try { technical = await checkGif(item, source, encoderHash) } catch (error) {
      if (!selected) {
        if (!await exists(asset(item.id, '.gif'))) { result.message = '原图通过，等待合成'; return result }
        throw error
      }
      await fs.mkdir(path.join(root, 'assets'), { recursive: true })
      const encoded = spawnSync(process.execPath, [encoder, inside(item.raw), asset(item.id, ''), '--size', String(size), '--durations', item.durations.join(',')], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
      if (encoded.error || encoded.status) throw new Error(encoded.error?.message || encoded.stderr || '编码失败')
      const validationPath = asset(item.id, '-validation.json'), validation = JSON.parse(await fs.readFile(validationPath, 'utf8'))
      validation.input = item.raw; validation.gif = relative(asset(item.id, '.gif'))
      validation.source = { sha256: source.sha256, encoderSha256: encoderHash, durations: item.durations }
      await fs.writeFile(validationPath, JSON.stringify(validation, null, 2) + '\n')
      technical = await checkGif(item, source, encoderHash)
    }
    result.status = 'passed'; result.message = '技术校验通过，视觉检查见预览' + (technical.warnings.length ? '；' + technical.warnings.join('；') : ''); result.technical = technical
    result.files = { gif: relative(asset(item.id, '.gif')), poster: relative(path.join(asset(item.id, '-frames'), '00.png')), validation: relative(asset(item.id, '-validation.json')) }
  } catch (error) { result.status = 'failed'; result.message = error.message }
  return result
}

const htmlEscape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
async function contacts(catalog) {
  for (const stage of catalog.stages) {
    const items = catalog.items.filter(i => i.stage === stage.id), width = 320, height = 236, columns = 4, cells = []
    for (const [index, item] of items.entries()) {
      const label = { passed: '技术通过', pending: '待生成或合成', failed: '需修正' }[item.status]
      const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="316" height="232" rx="12" fill="#f9fbf5"/><g font-family="Arial Unicode MS,Heiti SC,sans-serif" fill="#223b2e"><text x="12" y="22" font-size="14">${htmlEscape(item.id)} · ${label}</text><text x="12" y="45" font-size="16">${htmlEscape(item.name)}</text><rect x="10" y="58" width="145" height="145" rx="8" fill="#263b35"/><rect x="165" y="58" width="145" height="145" rx="8" fill="#263b35"/><text x="48" y="223" font-size="12">首帧 01</text><text x="204" y="223" font-size="12">中帧 05</text>${item.status !== 'passed' ? '<text x="110" y="135" font-size="14" fill="#a9b9ae">'+label+'</text>' : ''}</g></svg>`)
      const layers = []
      if (item.status === 'passed') for (const [frame, left] of [['00', 10], ['04', 165]]) layers.push({ input: await sharp(path.join(asset(item.id, '-frames'), frame + '.png')).resize(145, 145, { fit: 'contain' }).png().toBuffer(), left, top: 58 })
      const cell = await sharp(svg).composite(layers).png().toBuffer()
      cells.push({ input: cell, left: index % columns * width, top: Math.floor(index / columns) * height })
    }
    await sharp({ create: { width: columns * width, height: Math.max(1, Math.ceil(items.length / columns)) * height, channels: 4, background: '#dce8dd' } }).composite(cells).png().toFile(path.join(root, `s${stage.id}-contact.png`))
  }
}
function preview(catalog) {
  const data = JSON.stringify(catalog).replace(/</g, '\\u003c'), stageOptions = catalog.stages.map(s => `<option value="${s.id}">${htmlEscape(s.name)}</option>`).join('')
  return `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>少年与青年 · 宠物互动 GIF</title>
<style>
.filters label input{width:18px;min-width:18px;height:18px;padding:0;flex:none}
*{box-sizing:border-box}body{margin:0;background:#edf5ef;color:#223b2e;font-family:system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:28px 20px}h1{margin:0 0 10px;font-size:clamp(26px,4vw,36px)}p{line-height:1.7}.intro{max-width:800px;color:#566e5e}.filters{display:flex;flex-wrap:wrap;gap:10px;position:sticky;top:0;z-index:2;background:#edf5efee;padding:14px 0;backdrop-filter:blur(10px)}button,input,select{font:inherit;border-radius:10px;padding:10px 12px;border:1px solid #c5d8ca;background:#fff;color:inherit}button{cursor:pointer;background:#2b8156;border-color:#2b8156;color:white}button:disabled{cursor:default;opacity:.55}input{flex:1;min-width:160px}label{display:flex;align-items:center;gap:5px}label input{min-width:0;flex:0;accent-color:#2b8156}.summary{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.summary span{padding:6px 12px;background:#fff;border-radius:30px}.stages{display:flex;flex-wrap:wrap;gap:10px;color:#566e5e;font-size:14px}.stages p{margin:0;flex:1;min-width:250px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,265px),1fr));gap:18px;margin:20px 0}.card{padding:18px;background:#fffdf5;border:1px solid #d6e3d7;border-radius:22px;min-width:0}.card h2{font-size:22px;margin:0 0 8px}.meta,.note{font-size:14px;color:#566e5e;overflow-wrap:anywhere}.stage{display:grid;place-items:center;aspect-ratio:1;background:#e4f1e5;border-radius:16px;overflow:hidden;margin:12px 0}.stage img{display:block;width:100%;height:100%;object-fit:contain}.checker .stage{background:conic-gradient(#dfe5e0 25%,#fff 0 50%,#dfe5e0 0 75%,#fff 0) 0 0/24px 24px}.dark .stage{background:#263b35}.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.actions a{color:#246e4a;font-size:14px}.pill{font-size:12px;padding:4px 8px;border-radius:20px;background:#e5efe6}.failed .pill{background:#fde0d3;color:#843d23}.pending .pill{background:#efe8d3;color:#6a5b28}.empty{grid-column:1/-1;padding:50px;text-align:center;background:#fff9;border-radius:20px}.placeholder{padding:20px;text-align:center;line-height:1.7;color:#6c786d}.card details{margin-top:12px;font-size:13px;line-height:1.6;overflow-wrap:anywhere}.notice{font-size:13px;color:#566e5e}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #e4a332;outline-offset:3px}@media(max-width:600px){main{padding:22px 14px}.card{padding:16px}.filters select{flex:1;min-width:95px}.filters input[type=search]{flex-basis:100%}}
</style><main><h1>少年与青年 · 宠物互动 GIF</h1><p class="intro">按成长阶段和互动分类查看动作。默认显示静帧，点「播放」后查看循环；可逐张暂停。所有样片只用于素材预览，尚未接入孩子端。</p>
<div class="stages">${catalog.stages.map(s => `<p><b>${htmlEscape(s.name)}</b> ${htmlEscape(s.identity || '')}</p>`).join('')}</div>
<p class="notice">${htmlEscape(catalog.scope)}</p>
<div class="summary" id="summary" aria-live="polite"></div><div class="filters"><select id="stage" aria-label="成长阶段"><option value="">全部阶段</option>${stageOptions}</select><select id="category" aria-label="互动分类"><option value="">全部分类</option></select><select id="status" aria-label="制作状态"><option value="">全部状态</option><option value="passed">已通过</option><option value="pending">待生成或合成</option><option value="failed">需修正</option></select><input id="search" type="search" placeholder="搜索动作、场景或覆盖交互" aria-label="搜索动作"><button id="pause">全部暂停</button><label><input type="checkbox" id="checker">棋盘底</label><label><input type="checkbox" id="dark">深色底</label></div><p id="visible" class="notice" aria-live="polite"></p><section class="grid" id="grid"></section><p class="notice">GIF 512 × 512、八帧，真实透明背景。通过指技术检查通过；角色身份、手脚、道具和动作连续性仍需逐项视觉确认。原图不齐或检查失败的项不会显示为成品。</p></main>
<script type="application/json" id="catalog">${data}</script><script>
const catalog=JSON.parse(document.getElementById('catalog').textContent),els=Object.fromEntries(['grid','summary','stage','category','status','search','visible'].map(id=>[id,document.getElementById(id)])),labels={passed:'已通过',pending:'待生成或合成',failed:'需修正'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stageName=id=>catalog.stages.find(s=>s.id===id)?.name||id;
for(const c of [...new Set(catalog.items.map(i=>i.category))]){const o=document.createElement('option');o.value=c;o.textContent=c;els.category.append(o)}
els.summary.innerHTML='<span>共 '+catalog.items.length+' 个动作</span>'+Object.entries(labels).map(([k,v])=>'<span>'+v+' '+catalog.items.filter(i=>i.status===k).length+'</span>').join('');
function draw(){const items=catalog.items.filter(i=>(!els.stage.value||i.stage===+els.stage.value)&&(!els.category.value||i.category===els.category.value)&&(!els.status.value||i.status===els.status.value)&&(!els.search.value||[i.id,i.name,i.note,...i.coverage].join(' ').toLowerCase().includes(els.search.value.toLowerCase())));els.visible.textContent='当前显示 '+items.length+' / '+catalog.items.length+' 个动作';els.grid.innerHTML=items.map(i=>'<article class="card '+i.status+'" data-id="'+escape(i.id)+'"><h2>'+escape(i.name)+'</h2><div class="meta">'+escape(stageName(i.stage))+' · '+escape(i.category)+' <span class="pill">'+labels[i.status]+'</span></div><div class="stage">'+(i.files?'<img loading="lazy" decoding="async" src="'+escape(i.files.poster)+'" alt="'+escape(stageName(i.stage)+' '+i.name)+'" width="512" height="512">':'<div class="placeholder">'+escape(i.message)+'</div>')+'</div><div class="actions">'+(i.files?'<button data-play="'+escape(i.id)+'" aria-pressed="false">播放</button><a href="'+escape(i.files.gif)+'" download>下载 GIF</a><a href="'+escape(i.files.poster)+'" download>静帧 PNG</a>':'<button disabled>'+labels[i.status]+'</button>')+'</div>'+(i.technical?'<p class="meta">8 帧 · '+(i.technical.durationMs/1000)+' 秒 · '+Math.round(i.technical.bytes/1024)+' KB</p>':'')+(i.note?'<p class="note">'+escape(i.note)+'</p>':'')+'<details><summary>覆盖交互与检查</summary><p>'+escape(i.coverage.join('、')||'未填写覆盖交互')+'</p><p>'+escape(i.message)+'</p><code>'+escape(i.id)+'</code></details></article>').join('')||'<div class="empty">没有符合条件的动作。</div>'}
for(const id of ['stage','category','status','search'])els[id].addEventListener(id==='search'?'input':'change',draw);
els.grid.addEventListener('click',e=>{const button=e.target.closest('[data-play]');if(!button)return;const item=catalog.items.find(i=>i.id===button.dataset.play),img=button.closest('article').querySelector('img'),playing=button.getAttribute('aria-pressed')==='true';img.src=playing?item.files.poster:item.files.gif;button.textContent=playing?'播放':'暂停';button.setAttribute('aria-pressed',String(!playing))});
document.getElementById('pause').onclick=()=>document.querySelectorAll('[data-play][aria-pressed="true"]').forEach(b=>b.click());
document.getElementById('checker').onchange=e=>document.body.classList.toggle('checker',e.target.checked);document.getElementById('dark').onchange=e=>document.body.classList.toggle('dark',e.target.checked);
draw();
</script></html>\n`
}

async function zip(catalog) {
  if (catalog.items.some(i => i.status !== 'passed')) throw new Error('清单中仍有待生成或不通过项，全部 passed 后才能打包')
  for (const item of catalog.items) {
    const prompt = path.join(root, 'prompts', item.id + '.json')
    if (!await exists(prompt)) throw new Error(`缺少提示词 / 来源记录：${item.id}`)
    JSON.parse(await fs.readFile(prompt, 'utf8'))
  }
  const files = ['manifest.json', 'catalog.json', 'preview.html', 'README.md']
  for (const item of catalog.items) files.push(item.files.gif, item.files.poster)
  const sources = ['manifest.json', 'catalog.json', 'README.md', 'pack.mjs', '.gitignore', relative(encoder)]
  for (const file of ['coverage.json', 'coverage.md']) if (await exists(path.join(root, file))) { files.push(file); sources.push(file) }
  const browserReport = path.join(root, 'preview-validation.json')
  if (await exists(browserReport)) {
    const report = JSON.parse(await fs.readFile(browserReport, 'utf8'))
    if (report.manifestSha256 !== catalog.manifestSha256 || catalog.items.some(i => report.assetSha256?.[i.id] !== i.technical.sha256)) throw new Error('浏览器验收后清单或素材已改变，请更新 preview-validation.json 后再打包')
    files.push('preview-validation.json'); sources.push('preview-validation.json')
  }
  for (const stage of catalog.stages) { const contact = `s${stage.id}-contact.png`; files.push(contact); sources.push(contact) }
  for (const stage of catalog.stages) { const layout = `s${stage.id}-layout.png`; if (await exists(path.join(root, layout))) sources.push(layout) }
  for (const item of catalog.items) {
    sources.push(item.raw, item.files.validation)
    for (let i = 0; i < count; i++) sources.push(relative(path.join(asset(item.id, '-frames'), `${String(i).padStart(2, '0')}.png`)))
    sources.push(relative(path.join(asset(item.id, '-frames'), 'timing.ffconcat')))
  }
  for (const entry of await fs.readdir(root, { withFileTypes: true })) if ((entry.isFile() || entry.isDirectory()) && /prompt|提示词|brief/i.test(entry.name) && !files.includes(entry.name)) sources.push(entry.name)
  const outputDir = path.join(root, 'packages'); await fs.mkdir(outputDir, { recursive: true })
  for (const [name, list] of [['pet-gifs-deliverable.zip', files], ['pet-gifs-sources.zip', sources]]) {
    const output = path.join(outputDir, name); await fs.rm(output, { force: true })
    const result = spawnSync('zip', ['-qr', output, ...[...new Set(list)]], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 })
    if (result.error || result.status) throw new Error(result.error?.message || result.stderr || `打包失败：${name}`)
    const verify = spawnSync('unzip', ['-tqq', output], { encoding: 'utf8' })
    if (verify.error || verify.status) throw new Error(`ZIP 完整性检查失败：${name}`)
    console.log(`已打包：${relative(output)}`)
  }
}

try {
  const { manifest, manifestHash, encoderHash, coverage } = await loadManifest(), items = []
  for (const item of manifest.items) {
    const result = await processItem(item, encoderHash); items.push(result)
    if (command !== 'preview') console.log(`${result.status.padEnd(7)} ${item.id} ${result.message}`)
  }
  const catalog = { version: 1, updatedAt: new Date().toISOString(), manifestSha256: manifestHash, encoderSha256: encoderHash, scope: manifest.scope || '基础动作可复用；具体场景、食物、配饰和事件物件保留独立图层。', method: manifest.method || '', coverage, stages: manifest.stages, items }
  await fs.writeFile(path.join(root, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
  await fs.writeFile(path.join(root, 'preview.html'), preview(catalog))
  await contacts(catalog)
  console.log(`总数 ${items.length}；通过 ${items.filter(i => i.status === 'passed').length}；待完成 ${items.filter(i => i.status === 'pending').length}；需修正 ${items.filter(i => i.status === 'failed').length}`)
  if (command === 'zip') await zip(catalog)
  if (items.some(i => i.status === 'failed')) process.exitCode = 1
} catch (error) { console.error(error.message); process.exitCode = 1 }
