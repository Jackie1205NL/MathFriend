import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { STORY } from '../src/story.js'
import { itemSource } from '../src/pet-items.js'
const publicRoot = new URL('../public/', import.meta.url)

test('故事第 1 页沿用小窝，余下 15 页都有独立插画', async () => {
  assert.equal(STORY.length, 16)
  assert.equal(STORY[0].image, undefined)
  assert.equal(STORY[0].title, '小窝里的呼噜')
  const hashes = new Set()
  for (const story of STORY.slice(1)) {
    const bytes = await fs.readFile(new URL('.' + story.image, publicRoot))
    const m = await sharp(bytes).metadata()
    assert.ok(m.width >= 600 && m.height >= 400, story.title)
    assert.ok(Math.abs(m.width / m.height - 1.5) < .02, story.title + ' postcard aspect ratio')
    hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'))
  }
  assert.equal(hashes.size, 15)
})

test('17 件物品资源有效且保留真正的透明背景', async () => {
  const ids = ['scarf', 'curtain', 'ball', 'disc', 'bow', 'hat', 'pillow', 'lantern', 'house', 'swing', 'flower', 'kite', 'mat', 'pond', 'snowman', 'sled', 'stove']
  for (const id of ids) {
    const file = new URL('.' + itemSource(id), publicRoot)
    const bytes = await fs.readFile(file), m = await sharp(bytes).metadata()
    assert.equal(m.hasAlpha, true, id)
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alpha = (x, y) => data[(y * info.width + x) * info.channels + info.channels - 1]
    for (const [x, y] of [[0,0], [info.width-1,0], [0,info.height-1], [info.width-1,info.height-1]]) assert.equal(alpha(x,y),0,id+' corner alpha')
    let transparent=0, opaque=0
    for(let i=info.channels-1;i<data.length;i+=info.channels){if(data[i]===0)transparent++;if(data[i]>250)opaque++}
    assert.ok(transparent > info.width * info.height * .1, id+' transparent area')
    assert.ok(opaque > info.width * info.height * .05, id+' visible artwork')
  }
})
