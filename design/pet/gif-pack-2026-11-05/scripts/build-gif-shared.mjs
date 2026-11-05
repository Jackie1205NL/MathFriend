// node build-gif.mjs catch-raw.png catch --size 512 --durations 200,180,160,160,180,200,220,300
// Uses one crop/scale for all eight cells so jumping height and foot positions stay intact.
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const [inputArg, nameArg, ...flags] = process.argv.slice(2)
if (!inputArg || !nameArg || flags.length % 2) {
  throw new Error('Usage: node build-gif.mjs input-sheet.png output-name [--size 512] [--durations 200 or eight comma-separated milliseconds]')
}
const options = Object.fromEntries(Array.from({ length: flags.length / 2 }, (_, i) => [flags[i * 2], flags[i * 2 + 1]]))
if (Object.keys(options).some(k => !['--size', '--durations'].includes(k))) throw new Error('Unknown option')
const size = Number(options['--size'] || 512)
if (![384, 512].includes(size)) throw new Error('--size must be 384 or 512')
let durations = String(options['--durations'] || 200).split(',').map(Number)
if (durations.length === 1) durations = Array(8).fill(durations[0])
if (durations.length !== 8 || durations.some(ms => !Number.isInteger(ms) || ms < 20 || ms > 10000 || ms % 10)) {
  throw new Error('--durations needs one or eight delays, each 20–10000 ms in multiples of 10')
}
const input = path.resolve(inputArg), output = path.resolve(nameArg)
const frameDir = output + '-frames', gifPath = output + '.gif'
const { data: sheet, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const cellWidth = Math.ceil(info.width / 4), cellHeight = Math.ceil(info.height / 2)
const frames = [], bounds = []
for (let i = 0; i < 8; i++) {
  const col = i % 4, row = Math.floor(i / 4)
  const left = Math.floor(col * info.width / 4), top = Math.floor(row * info.height / 2)
  const width = Math.floor((col + 1) * info.width / 4) - left
  const height = Math.floor((row + 1) * info.height / 2) - top
  const pixels = await sharp(sheet, { raw: info }).extract({ left, top, width, height })
    .extend({ top: 0, left: 0, right: cellWidth - width, bottom: cellHeight - height, background: '#00000000' }).raw().toBuffer()
  let x0 = cellWidth, y0 = cellHeight, x1 = -1, y1 = -1, transparent = 0
  for (let y = 0; y < cellHeight; y++) for (let x = 0; x < cellWidth; x++) {
    const alpha = pixels[(y * cellWidth + x) * 4 + 3]
    if (!alpha) transparent++
    if (alpha > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  }
  if (x1 < 0 || transparent < cellWidth * cellHeight * .01) throw new Error(`Cell ${i} is blank or lacks actual transparency`)
  frames.push(pixels)
  bounds.push({ left: x0, top: y0, right: x1, bottom: y1, transparent })
}
const cropLeft = Math.min(...bounds.map(b => b.left)), cropTop = Math.min(...bounds.map(b => b.top))
const crop = { left: cropLeft, top: cropTop, width: Math.max(...bounds.map(b => b.right)) - cropLeft + 1, height: Math.max(...bounds.map(b => b.bottom)) - cropTop + 1 }
const margin = Math.ceil(size * .045), scale = (size - margin * 2) / Math.max(crop.width, crop.height)
const scaledWidth = Math.round(crop.width * scale), scaledHeight = Math.round(crop.height * scale)
const padLeft = Math.floor((size - scaledWidth) / 2), padTop = Math.floor((size - scaledHeight) / 2)
await fs.mkdir(frameDir, { recursive: true })
const normalized = []
for (let i = 0; i < frames.length; i++) {
  const png = await sharp(frames[i], { raw: { width: cellWidth, height: cellHeight, channels: 4 } })
    .extract(crop).resize(scaledWidth, scaledHeight)
    .extend({ left: padLeft, right: size - scaledWidth - padLeft, top: padTop, bottom: size - scaledHeight - padTop, background: '#00000000' })
    .png().toBuffer()
  await fs.writeFile(path.join(frameDir, String(i).padStart(2, '0') + '.png'), png)
  normalized.push(await sharp(png).raw().toBuffer())
}
const timingPath = path.join(frameDir, 'timing.ffconcat')
await fs.writeFile(timingPath, 'ffconcat version 1.0\n' + durations.map((ms, i) => `file '${String(i).padStart(2, '0')}.png'\noption framerate 100\nduration ${(ms / 1000).toFixed(2)}\n`).join(''))
const encoded = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', timingPath,
  '-filter_complex', '[0:v]split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=128',
  '-fps_mode', 'passthrough', '-gifflags', '-offsetting-transdiff', '-loop', '0', '-final_delay', String(durations.at(-1) / 10), gifPath], { encoding: 'utf8' })
if (encoded.error || encoded.status) throw new Error(encoded.error?.message || encoded.stderr)

// Decode the composited GIF pages, including disposal, and compare their masks to the PNG sources.
const metadata = await sharp(gifPath, { animated: true }).metadata()
const decoded = await sharp(gifPath, { animated: true }).ensureAlpha().raw().toBuffer()
if (metadata.pages !== 8 || metadata.pageHeight !== size || metadata.width !== size || metadata.loop !== 0) throw new Error('GIF dimensions/frame count/loop failed verification')
if (metadata.delay.some((ms, i) => ms !== durations[i])) throw new Error(`GIF timing changed: ${metadata.delay}`)
const checks = normalized.map((pixels, frame) => {
  let mismatch = 0, transparent = 0
  for (let p = 0; p < size * size; p++) {
    const expected = pixels[p * 4 + 3] < 128 ? 0 : 255
    const actual = decoded[(frame * size * size + p) * 4 + 3]
    if (!actual) transparent++
    if (actual !== expected) mismatch++
  }
  if (mismatch) throw new Error(`GIF alpha/disposal mismatch in frame ${frame}: ${mismatch} pixels`)
  return { frame, transparent, alphaMismatch: mismatch }
})
const validation = { input, sheet: { width: info.width, height: info.height, grid: [4, 2] }, crop, scale, size, durations, durationMs: durations.reduce((a, b) => a + b), loop: metadata.loop, bounds, frames: checks, gif: gifPath }
await fs.writeFile(output + '-validation.json', JSON.stringify(validation, null, 2) + '\n')
console.log(JSON.stringify({ gif: gifPath, size, pages: metadata.pages, durationMs: validation.durationMs, alphaDisposalVerified: true }))
