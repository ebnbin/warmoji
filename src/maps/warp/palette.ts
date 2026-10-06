/**
 * 四间房的签名：主色与地板的待机律动绑在一起。金色从中心一圈圈往外脉冲，薄荷绿顺着一个方向扫过光波，紫色棋盘式明灭，冰青几乎不动；
 * 都避开了队伍的信号蓝与敌人的信号红
 */
export const SIGNS = [
  { color: 0xffb42e, pattern: 0 },
  { color: 0x2fe8a4, pattern: 1 },
  { color: 0xb070ff, pattern: 2 },
  { color: 0x6fe6ff, pattern: 3 },
] as const

/** 地砖被队伍踩亮是信号蓝，被敌人踩亮是信号红 */
export const TEAM_GLOW = 0x3d8bff
export const FOE_GLOW = 0xff2e48

/** 虚空的底色与核心柱的光 */
export const VOID_DEEP = 0x02050d
export const CORE_GLOW = 0xd9fbff

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
