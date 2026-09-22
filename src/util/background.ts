import type { Palette } from './palette'

/** 画在 canvas 之下的页面层；同步 theme-color：iOS Safari 竖屏用它给状态栏区域着色 */
export function applyBackground(p: Palette): void {
  document.body.style.background = `linear-gradient(135deg, ${p.bgFrom}, ${p.bgTo})`
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bgFrom)
}
