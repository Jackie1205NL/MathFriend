// 与原柴犬素材同一套 2D 卡通贴纸画风。商品、穿戴、场景共用透明图片。
// SVG 只作为场景的图片容器，不再用简化线条重画物品。
const original = new Set(['scarf', 'curtain', 'ball', 'disc'])
const redrawn = new Set(['bow', 'hat', 'pillow', 'lantern', 'house', 'swing', 'flower', 'kite', 'mat', 'pond', 'snowman', 'sled', 'stove'])
export const itemSource = k => original.has(k) ? `/pet/item-${k}.webp` : redrawn.has(k) ? `/pet/items-v2/${k}.png` : null
export const itemArt = (k, attrs = '') => {
  const src = itemSource(k)
  return src ? `<svg ${attrs} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><image href="${src}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/></svg>` : ''
}
export const itemIcon = k => itemArt(k, 'class="item-art"') || `<img src="/pet/item-${k}.webp" alt="">`

// 户外场景直接嵌入图片，让长形物件充分使用各自的摆放区域。
export const itemScene = (k, attrs) => `<image ${attrs} href="${itemSource(k)}" preserveAspectRatio="xMidYMid meet"/>`
