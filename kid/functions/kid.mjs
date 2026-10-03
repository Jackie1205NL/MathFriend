// Netlify Function：孩子端的全部接口 /api/kid/*，存档放在 Netlify Blobs。
// 需要在 Netlify 的环境变量里设置 KID_PIN（孩子的口令）和 SYNC_TOKEN（家长端同步令牌）。
import { getStore } from '@netlify/blobs'
import { createApi } from '../server/game.js'

export default async req => {
  const blobs = getStore({ name: 'kid', consistency: 'strong' })
  const store = { get: k => blobs.get(k, { type: 'json' }), set: (k, v) => blobs.setJSON(k, v) }
  return createApi(store, { KID_PIN: process.env.KID_PIN, SYNC_TOKEN: process.env.SYNC_TOKEN })(req)
}

export const config = { path: '/api/kid/*' }
