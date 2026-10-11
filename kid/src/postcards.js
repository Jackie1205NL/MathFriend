import { POSTCARDS } from '../../shared/contract.js'

// 保留后端地点与索引，让已有收藏直接显示新插画。
export const postcardSource = ({ k, i }) => Object.hasOwn(POSTCARDS, k) && Number.isInteger(i) && POSTCARDS[k][i]
  ? `/postcards/${k}-${i + 1}.webp` : ''
