// Pet art -> kid/public/pet/*.webp. New art: drop sheets into design/pet/src/ (same names/grids) and rerun `node scripts/kid-assets.mjs`.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'design/pet/src/', OUT = 'kid/public/pet/';
mkdirSync(OUT, { recursive: true });
const FACES = ['happy', 'hungry', 'sleepy', 'thinking', 'proud', 'shy'];
const ACTS = ['eat', 'bath', 'catch', 'sleep', 'shake', 'wag'];
const ITEMS = ['cookie', 'rice', 'bento', 'soap', 'ball', 'disc', 'scarf', 'curtain'];
const BADGES = ['nose', 'queue', 'paw', 'tail', 'patrol', 'path'];
// [source, cols, rows, size, names (null = skip that cell)]
const JOBS = [['stages-sheet', 5, 1, 512, ['s0', null, null, null, null]]];
for (const s of [1, 2, 3, 4]) JOBS.push(
  [`s${s}-single`, 1, 1, 512, [`s${s}`]],
  [`s${s}-faces`, 3, 2, 384, FACES.map(n => `s${s}-face-${n}`)],
  [`s${s}-actions`, 3, 2, 384, ACTS.map(n => `s${s}-act-${n}`)]);
JOBS.push(['items', 4, 2, 192, ITEMS.map(n => `item-${n}`)], ['badges', 3, 2, 192, BADGES.map(n => `badge-${n}`)]);

const A_ON = 8, SPECK = 40, PAD = 8;
let bad = 0;

// Step 1: if the border is opaque near-white, flood-fill it away from the image edge.
function removeWhiteBg(d, W, H) {
  const minC = i => Math.min(d[i], d[i + 1], d[i + 2]);
  const white = p => { const i = p * 4; return d[i + 3] > 0 && minC(i) >= 235 && Math.max(d[i], d[i + 1], d[i + 2]) - minC(i) <= 20; };
  let n = 0, w = 0;
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { n++; if (white(y * W + x)) w++; }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { n++; if (white(y * W + x)) w++; }
  if (w < n * 0.5) return false;
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H); let h = 0, t = 0;
  const push = p => { if (!seen[p] && white(p)) { seen[p] = 1; q[t++] = p; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (h < t) {
    const p = q[h++], x = p % W; d[p * 4 + 3] = 0;
    if (x > 0) push(p - 1); if (x < W - 1) push(p + 1); if (p >= W) push(p - W); if (p < W * (H - 1)) push(p + W);
  }
  for (let pass = 0; pass < 2; pass++) { // soft 1-2 px edge for 215..235 pixels touching removed ones
    const soft = [];
    for (let p = 0; p < W * H; p++) {
      const i = p * 4, m = minC(i), x = p % W;
      if (seen[p] || d[i + 3] === 0 || m < 215) continue;
      if ((x > 0 && seen[p - 1]) || (x < W - 1 && seen[p + 1]) || (p >= W && seen[p - W]) || (p < W * (H - 1) && seen[p + W])) soft.push(p);
    }
    for (const p of soft) { const i = p * 4; d[i + 3] = Math.round(d[i + 3] * Math.min(1, (235 - minC(i)) / 20)); seen[p] = 1; }
  }
  return true;
}

// Step 2: connected components (8-conn) of opaque pixels; returns label map + component list.
function components(d, W, H) {
  const lab = new Int32Array(W * H), q = new Int32Array(W * H), comps = [];
  for (let s = 0; s < W * H; s++) {
    if (lab[s] || d[s * 4 + 3] < A_ON) continue;
    const id = comps.length + 1, c = { id, n: 0, sx: 0, sy: 0, x0: W, y0: H, x1: 0, y1: 0 };
    let h = 0, t = 0; q[t++] = s; lab[s] = id;
    while (h < t) {
      const p = q[h++], x = p % W, y = (p - x) / W;
      c.n++; c.sx += x; c.sy += y;
      c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, np = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !lab[np] && d[np * 4 + 3] >= A_ON) { lab[np] = id; q[t++] = np; }
      }
    }
    comps.push(c);
  }
  return { lab, comps: comps.filter(c => c.n >= SPECK) };
}

const save = async (img, name) => {
  const info = await img.toFile(OUT + name + '.webp');
  console.log(`${name}.webp`.padEnd(26), `${info.width}×${info.height}`);
};

for (const [src, cols, rows, size, names] of JOBS) {
  const { data: d, info: { width: W, height: H } } = await sharp(SRC + src + '.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (removeWhiteBg(d, W, H)) console.log(`(${src}: removed white background)`);
  const { lab, comps } = components(d, W, H);
  const bx0 = Math.min(...comps.map(c => c.x0)), bx1 = Math.max(...comps.map(c => c.x1));
  const by0 = Math.min(...comps.map(c => c.y0)), by1 = Math.max(...comps.map(c => c.y1));
  const cells = Array.from({ length: cols * rows }, () => []);
  for (const c of comps) {
    const col = Math.min(cols - 1, Math.floor((c.sx / c.n - bx0) / ((bx1 - bx0 + 1) / cols)));
    const row = Math.min(rows - 1, Math.floor((c.sy / c.n - by0) / ((by1 - by0 + 1) / rows)));
    cells[row * cols + col].push(c);
  }
  const filled = cells.filter(c => c.length).length;
  if (filled !== cols * rows) { console.error(`✗ ${src}: ${filled}/${cols * rows} non-empty cells`); bad++; }
  for (const [k, cs] of cells.entries()) {
    if (!names[k] || !cs.length) continue;
    const ids = new Set(cs.map(c => c.id));
    const x0 = Math.max(0, Math.min(...cs.map(c => c.x0)) - PAD), x1 = Math.min(W - 1, Math.max(...cs.map(c => c.x1)) + PAD);
    const y0 = Math.max(0, Math.min(...cs.map(c => c.y0)) - PAD), y1 = Math.min(H - 1, Math.max(...cs.map(c => c.y1)) + PAD);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y + y0) * W + x + x0;
      if (ids.has(lab[p])) d.copy(buf, (y * w + x) * 4, p * 4, p * 4 + 4);
    }
    await save(sharp(buf, { raw: { width: w, height: h, channels: 4 } })
      .resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 100 }), names[k]);
  }
}
await save(sharp(SRC + 'room.webp').removeAlpha().resize({ width: 720 }).webp({ quality: 82 }), 'room');
if (bad) process.exit(1);
