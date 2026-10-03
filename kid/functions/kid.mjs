// Netlify Function：孩子端的全部接口 /api/kid/*，存档放在 Netlify Blobs。
// Netlify 环境变量：SYNC_TOKEN（家长端同步令牌）、ADMIN_PIN（管理员 admin 的密码，网站上管理账号用）；
// KID_PIN、KID_USER 只在第一次启用账号时用来建第一个孩子账号（以前的存档归它），之后密码由管理员在网站上改。
// 正式站（uat 的生产部署）用存储 kid；dev 分支部署和预览用 kid-dev，在 dev 上试玩不会动到孩子的正式存档。
import { getStore } from '@netlify/blobs'
import { createApi } from '../server/game.js'

export default async (req, context) => {
  // 只有明确是分支部署、预览时才换存储；读不到部署信息时一律当正式站，保证孩子的存档不会「不见」
  const dev = ['branch-deploy', 'deploy-preview'].includes(context?.deploy?.context || process.env.CONTEXT)
  const blobs = getStore({ name: dev ? 'kid-dev' : 'kid', consistency: 'strong' })
  const store = { get: k => blobs.get(k, { type: 'json' }), set: (k, v) => blobs.setJSON(k, v) }
  return createApi(store, { KID_PIN: process.env.KID_PIN, KID_USER: process.env.KID_USER, ADMIN_PIN: process.env.ADMIN_PIN, SYNC_TOKEN: process.env.SYNC_TOKEN, CLOCK: dev })(req)
}

export const config = { path: '/api/kid/*' }
