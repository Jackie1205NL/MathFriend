import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { POSTCARDS } from '../../shared/contract.js'
import { postcardSource } from '../src/postcards.js'

test('已有的三个地点、十二个收藏索引对应完整且不同的横版插画', async () => {
  const hashes = new Set()
  for (const [k, cards] of Object.entries(POSTCARDS)) {
    assert.equal(cards.length, 4)
    for (const [i] of cards.entries()) {
      const source = postcardSource({ k, i, at: '2026-10-11' })
      const bytes = await fs.readFile(new URL('../public' + source, import.meta.url))
      const meta = await sharp(bytes).metadata()
      assert.equal(meta.width, 1200, source)
      assert.equal(meta.height, 800, source)
      hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'))
    }
  }
  assert.equal(hashes.size, 12)
})

test('不把未收录的地点或无效索引组成图片地址', () => {
  for (const card of [{ k: 'yard', i: 4 }, { k: 'snow', i: -1 }, { k: 'park', i: '0' }, { k: '../pet', i: 0 }]) {
    assert.equal(postcardSource(card), '')
  }
})
