/** 界面配色全部取自 Twemoji 调色板，与 emoji 同源；中性色是 #292F33 的明暗阶 */
export const INK = {
  ink: 0xf5f8fa,
  soft: 0xccd6dd,
  muted: 0x99aab5,
  faint: 0x66757f,
  dark: 0x292f33,
} as const

export const SURFACE = {
  bg: 0x292f33,
  sunken: 0x1e2326,
  raised: 0x353d42,
  raisedHi: 0x3e474d,
  outline: 0x14171a,
} as const

export type Ink = keyof typeof INK

export type Tone = 'accent' | 'steel' | 'good' | 'warn' | 'bad' | 'info' | 'epic'

interface ToneSpec {
  /** 填充 */
  readonly face: number
  /** 按钮面下沿的厚边 */
  readonly lip: number
  /** 填充上的文字 */
  readonly on: Ink
  /** 深底上的文字 */
  readonly text: number
}

export const TONE: Readonly<Record<Tone, ToneSpec>> = {
  accent: { face: 0xffdc5d, lip: 0xf4900c, on: 'dark', text: 0xffdc5d },
  steel: { face: 0x66757f, lip: 0x4b5760, on: 'ink', text: INK.soft },
  good: { face: 0x77b255, lip: 0x5c913b, on: 'dark', text: 0x77b255 },
  warn: { face: 0xffac33, lip: 0xe07b0a, on: 'dark', text: 0xffac33 },
  // 红色填充在深底上作小字对比度不足，文字用浅一阶
  bad: { face: 0xdd2e44, lip: 0xa0041e, on: 'ink', text: 0xea596e },
  info: { face: 0x55acee, lip: 0x3b88c3, on: 'dark', text: 0x55acee },
  epic: { face: 0xaa8dd8, lip: 0x744eaa, on: 'dark', text: 0xaa8dd8 },
}

export type TextColor = Ink | Tone

export function textColor(c: TextColor): number {
  return c in INK ? INK[c as Ink] : TONE[c as Tone].text
}

export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export const FONT_FAMILY =
  'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'

export const TEXT = {
  caption: { size: 20, bold: false },
  label: { size: 22, bold: false },
  body: { size: 26, bold: false },
  heading: { size: 30, bold: true },
  lead: { size: 34, bold: true },
  title: { size: 38, bold: true },
  banner: { size: 56, bold: true },
  display: { size: 76, bold: true },
} as const

export type TextKind = keyof typeof TEXT

export const SHAPE = {
  /** 描边宽度 */
  line: 3,
  /** 按钮面下沿厚边的高度 */
  lip: 6,
  /** 外投影的下移量 */
  drop: 5,
  radius: { sm: 10, md: 16, lg: 22 },
} as const

export const GAP = { xs: 6, sm: 10, md: 16, lg: 24, xl: 40 } as const

/** 遮罩压暗程度 */
export const SCRIM_ALPHA = 0.62

export const LAYER = { hud: 100, toast: 250, overlay: 400, dialog: 600 } as const

export const MOTION = { press: 70, slide: 140, pop: 240, fade: 420 } as const
