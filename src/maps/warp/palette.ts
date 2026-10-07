/**
 * 四季各一种舱室的主色与地板的待机律动：春是嫩绿、从中心一圈圈往外的脉冲，夏是沙金、顺着一个方向扫过的光波，
 * 秋是晶紫、棋盘式明灭，冬是霜白、几乎不动；都避开了队伍的信号蓝与敌人的信号红
 */
export const SEASONS = [
  { color: 0x8ff07a, pattern: 0 },
  { color: 0xffb42e, pattern: 1 },
  { color: 0xb070ff, pattern: 2 },
  { color: 0xd4f0ff, pattern: 3 },
] as const

/** 地砖被队伍踩亮是信号蓝，被敌人踩亮是信号红 */
export const TEAM_GLOW = 0x3d8bff
export const FOE_GLOW = 0xff2e48
/** 「出口」的应急绿 */
export const EXIT_GREEN = 0x19e07a

/** 虚空的底色与入口的光：整座实验室的主题色是 cyan */
export const VOID_DEEP = 0x000610
export const CYAN_GLOW = 0xa8ffff

export function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255]
}

/** 颜色往白里提 k */
export function lift(c: number, k: number): number {
  const f = (v: number): number => Math.round(v + (255 - v) * k)
  return (f((c >> 16) & 0xff) << 16) | (f((c >> 8) & 0xff) << 8) | f(c & 0xff)
}

/** 颜色压暗到 k 倍 */
export function shade(c: number, k: number): number {
  return (Math.round(((c >> 16) & 0xff) * k) << 16) | (Math.round(((c >> 8) & 0xff) * k) << 8) | Math.round((c & 0xff) * k)
}

export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`
}
