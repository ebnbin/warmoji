import type { Palette } from '../core/palette'

/** 屏幕锚定的渐变背景：画在 canvas 之下的页面层，天然不随相机移动。
 * 同步更新 theme-color：iOS Safari 竖屏无法把网页画进状态栏区域（viewport-fit=cover
 * 只覆盖横屏刘海与 Home 条），但会用 theme-color 给该区域着色，取渐变顶色使其融入页面 */
export function applyBackground(p: Palette): void {
  document.body.style.background = `linear-gradient(135deg, ${p.bgFrom}, ${p.bgTo})`
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bgFrom)
}
