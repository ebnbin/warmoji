/**
 * 四间房的签名：主色、地板的待机律动与出口那扇门是哪一季的东西绑在一起。樱粉配寺院的木门（春），铜黄配潜艇的舱门（夏），
 * 紫配晶洞的石拱（秋），冰青配冰砌的门（冬）；律动依次是从中心一圈圈往外的脉冲、顺着一个方向扫过的光波、棋盘式明灭、几乎不动。
 * 都避开了队伍的信号蓝、敌人的信号红与安全出口的绿
 */
export const SIGNS = [
  { color: 0xff8ccf, pattern: 0 },
  { color: 0xffb42e, pattern: 1 },
  { color: 0xb070ff, pattern: 2 },
  { color: 0x6fe6ff, pattern: 3 },
] as const

/** 地砖被队伍踩亮是信号蓝，被敌人踩亮是信号红 */
export const TEAM_GLOW = 0x3d8bff
export const FOE_GLOW = 0xff2e48

/** 虚空的底色：全站的主题色是 cyan；正中那扇真正的出口透出来的是日光 */
export const VOID_DEEP = 0x000610
export const CORE_GLOW = 0xffe8b0
/** 出口开着时照到地上的绿 */
export const EXIT_GLOW = 0x30ff90

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
