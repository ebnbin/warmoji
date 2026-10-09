import { EMOJI_BOX } from './pack'
import { EMOJI_PAD } from './svg'

/** 界面图标的描边：width 是往外描多宽，SVG 单位 */
export const OUTLINE = {
  width: 2,
  colors: {
    player: '#000000',
    enemy: '#8e24aa',
    enemyProjectile: '#d32f2f',
    elite: '#ffb300',
  },
} as const

export type OutlineKind = keyof typeof OUTLINE.colors

if (OUTLINE.width > EMOJI_PAD) throw new Error(`描边 ${OUTLINE.width} 宽过了 emoji 四周留的 ${EMOJI_PAD}`)

/** 剪影往外扩时取的方向数：越多边越圆 */
const DIRS = 16

/** 边长 size 像素的图标描边的像素宽 */
export function outlinePx(size: number): number {
  return (OUTLINE.width * size) / (EMOJI_BOX + EMOJI_PAD * 2)
}

/** 按光栅后的剪影往外描 px 宽的一圈 color，再把原图盖回去：只看像素，与图是怎么画出来的无关 */
export function outlineRaster(img: CanvasImageSource, size: number, px: number, color: string): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  const g = cv.getContext('2d')
  if (!g) throw new Error('描边拿不到 2D 画布')
  // 只扩最外一圈时，比描边还细的部件中间会漏
  for (const r of [px, px / 2]) {
    for (let i = 0; i < DIRS; i++) {
      const a = (i / DIRS) * Math.PI * 2
      g.drawImage(img, Math.cos(a) * r, Math.sin(a) * r, size, size)
    }
  }
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, size, size)
  g.globalCompositeOperation = 'source-over'
  g.drawImage(img, 0, 0, size, size)
  return cv
}
