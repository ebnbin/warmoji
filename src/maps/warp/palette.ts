/**
 * 四间房的签名，按春、夏、秋、冬：主色与地板的待机律动绑在一起。春是薄荷绿，顺着一个方向扫过光波；夏是金色，从中心一圈圈往外脉冲；
 * 秋是紫色，棋盘式明灭；冬是冰青，几乎不动。都避开了队伍的信号蓝与敌人的信号红
 */
export const SIGNS = [
  { color: 0x2fe8a4, pattern: 1 },
  { color: 0xffb42e, pattern: 0 },
  { color: 0xb070ff, pattern: 2 },
  { color: 0x6fe6ff, pattern: 3 },
] as const

/** 地砖被队伍踩亮是信号蓝，被敌人踩亮是信号红 */
export const TEAM_GLOW = 0x3d8bff
export const FOE_GLOW = 0xff2e48

/** 虚空的底色与核心柱的光：全站的主题色是 cyan */
export const VOID_DEEP = 0x000610
/** 熄了灯的房间压上的那层暗色 */
export const DARK = 0x01050c
export const CORE_GLOW = 0xa8ffff

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
