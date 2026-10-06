/**
 * 四间房的签名：主色与地板的待机律动绑在一起。金色从中心一圈圈往外脉冲，薄荷绿顺着一个方向扫过光波，紫色棋盘式明灭，冰青几乎不动；
 * 都避开了队伍的信号蓝与敌人的信号红。relic 是那间内角标本罐里封着的东西：金色那间一枚夏天的贝壳，薄荷绿一朵春天的樱花，紫色一片秋天的枫叶，冰青一片冬天的雪花
 */
export const SIGNS = [
  { color: 0xffb42e, pattern: 0, relic: '1f41a' },
  { color: 0x2fe8a4, pattern: 1, relic: '1f338' },
  { color: 0xb070ff, pattern: 2, relic: '1f341' },
  { color: 0x6fe6ff, pattern: 3, relic: '2744' },
] as const

/** 墙压到底时墙面烧成的颜色 */
export const PRESS_HOT = 0xff5a2e
/** 推进来的墙顶：深色的钢板 */
export const WALL_TOP = 0x0c1824
export const WALL_SEAM = 0x1d3346

/** 地砖被队伍踩亮是信号蓝，被敌人踩亮是信号红 */
export const TEAM_GLOW = 0x3d8bff
export const FOE_GLOW = 0xff2e48

/** 虚空的底色与核心柱的光：全站的主题色是 cyan */
export const VOID_DEEP = 0x000610
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

/** 两种颜色按 t 混 */
export function mix(a: number, b: number, t: number): number {
  const f = (s: number): number => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * t)
  return (f(16) << 16) | (f(8) << 8) | f(0)
}
