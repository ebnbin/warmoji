import type Phaser from 'phaser'
import type { DevTheme } from './types'

export const COLOR = {
  bg: 0x0b0d12,
  line: 0xffffff,
  chip: 0xffffff,
  danger: 0xef5350,
  warn: 0xffd54f,
  text: '#e8e8f0',
  muted: '#9a9aa8',
  onAccent: '#1c1d24',
  error: '#ff8a80',
  warnText: '#ffd54f',
} as const

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export interface RoundRectStyle {
  readonly fill?: number
  readonly fillAlpha?: number
  readonly stroke?: number
  readonly strokeAlpha?: number
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
  const r = Math.min(radius, w / 2, h / 2)
  if (style.fill !== undefined) {
    g.fillStyle(style.fill, style.fillAlpha ?? 1)
    g.fillRoundedRect(x, y, w, h, r)
  }
  if (style.stroke !== undefined) {
    g.lineStyle(style.strokeWidth ?? 1, style.stroke, style.strokeAlpha ?? 1)
    g.strokeRoundedRect(x, y, w, h, r)
  }
}

interface TextOpts {
  readonly color?: string
  readonly mono?: boolean
  readonly bold?: boolean
  readonly wrap?: number
  readonly align?: 'left' | 'center' | 'right'
}

export function textStyle(theme: DevTheme, size: number, opts: TextOpts = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: opts.mono ? theme.mono : theme.font,
    fontSize: `${size}px`,
    fontStyle: opts.bold ? 'bold' : 'normal',
    color: opts.color ?? COLOR.text,
    resolution: theme.res,
    align: opts.align ?? 'left',
    lineSpacing: Math.round(size * 0.15),
    ...(opts.wrap === undefined ? {} : { wordWrap: { width: opts.wrap, useAdvancedWrap: true } }),
  }
}
