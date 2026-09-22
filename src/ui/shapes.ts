import type Phaser from 'phaser'

export interface RoundRectStyle {
  /** 省略则不填充 */
  readonly fill?: number
  /** 缺省 1 */
  readonly fillAlpha?: number
  /** 省略则不描边 */
  readonly stroke?: number
  /** 缺省 1 */
  readonly strokeAlpha?: number
  /** 缺省 1 */
  readonly strokeWidth?: number
}

export function roundRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  style: RoundRectStyle,
): void {
  if (style.fill !== undefined) {
    g.fillStyle(style.fill, style.fillAlpha ?? 1)
    g.fillRoundedRect(x, y, w, h, radius)
  }
  if (style.stroke !== undefined) {
    g.lineStyle(style.strokeWidth ?? 1, style.stroke, style.strokeAlpha ?? 1)
    g.strokeRoundedRect(x, y, w, h, radius)
  }
}
