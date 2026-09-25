import type { Palette } from './palette'

export function applyBackground(p: Palette): void {
  document.body.style.background = `linear-gradient(135deg, ${p.bgFrom}, ${p.bgTo})`
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bgFrom)
}
