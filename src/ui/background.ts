import type { Palette } from '../core/palette'

/** 屏幕锚定的渐变背景：画在 canvas 之下的页面层，天然不随相机移动 */
export function applyBackground(p: Palette): void {
  document.body.style.background = `linear-gradient(135deg, ${p.bgFrom}, ${p.bgTo})`
}
