import type Phaser from 'phaser'

// 圆角矩形：全项目的面板/卡片/按钮底都是这一个形状。
// 直接用 Phaser API 要写四行（fillStyle + fillRoundedRect + lineStyle + strokeRoundedRect），
// 且同一组几何参数得敲两遍——描边与填充错位是抄改时最容易犯的错。此处一次写清。

export interface RoundRectStyle {
  /** 填充色；省略则不填充 */
  readonly fill?: number
  /** 填充透明度，缺省 1 */
  readonly fillAlpha?: number
  /** 描边色；省略则不描边 */
  readonly stroke?: number
  /** 描边透明度，缺省 1 */
  readonly strokeAlpha?: number
  /** 描边宽度，缺省 1 */
  readonly strokeWidth?: number
}

/** 在 g 上画一个圆角矩形（填充 / 描边按 style 给出的部分绘制，几何参数只写一次） */
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
