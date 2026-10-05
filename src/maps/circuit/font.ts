/**
 * 丝印的笔画字：每个字在 4 宽 6 高的字格里（y 朝下，0 是字顶、6 是基线），由几条折线组成；
 * 折线之间用 | 隔开，折线上的点写成 x,y、用空格隔开
 */
const O = '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0'
const P = '0,6 0,0 3,0 4,1 4,2 3,3 0,3'
const GLYPHS: Readonly<Record<string, string>> = {
  ' ': '',
  A: '0,6 2,0 4,6|0.7,4 3.3,4',
  B: '0,3 3,3 4,4 4,5 3,6 0,6 0,0 3,0 4,1 4,2 3,3',
  C: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5',
  D: '0,0 0,6 2.5,6 4,4.5 4,1.5 2.5,0 0,0',
  E: '4,0 0,0 0,6 4,6|0,3 3,3',
  F: '4,0 0,0 0,6|0,3 3,3',
  G: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3.5 2.5,3.5',
  H: '0,0 0,6|4,0 4,6|0,3 4,3',
  I: '1,0 3,0|2,0 2,6|1,6 3,6',
  J: '4,0 4,5 3,6 1,6 0,5',
  K: '0,0 0,6|4,0 0,4|1.3,2.7 4,6',
  L: '0,0 0,6 4,6',
  M: '0,6 0,0 2,3 4,0 4,6',
  N: '0,6 0,0 4,6 4,0',
  O,
  P,
  Q: `${O}|2.5,4.5 4,6`,
  R: `${P}|2,3 4,6`,
  S: '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5',
  T: '0,0 4,0|2,0 2,6',
  U: '0,0 0,5 1,6 3,6 4,5 4,0',
  V: '0,0 2,6 4,0',
  W: '0,0 1,6 2,2 3,6 4,0',
  X: '0,0 4,6|4,0 0,6',
  Y: '0,0 2,3 4,0|2,3 2,6',
  Z: '0,0 4,0 0,6 4,6',
  '0': O,
  '1': '1,1 2,0 2,6|1,6 3,6',
  '2': '0,1 1,0 3,0 4,1 4,2 0,6 4,6',
  '3': '0,1 1,0 3,0 4,1 4,2 3,3 1.5,3|3,3 4,4 4,5 3,6 1,6 0,5',
  '4': '3,6 3,0 0,4 4,4',
  '5': '4,0 0,0 0,3 3,3 4,4 4,5 3,6 1,6 0,5',
  '6': '3.5,0 1.5,0 0,1.5 0,5 1,6 3,6 4,5 4,4 3,3 0,3',
  '7': '0,0 4,0 1.5,6',
  '8': '1,3 0,2 0,1 1,0 3,0 4,1 4,2 3,3 1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3',
  '9': '4,3 1,3 0,2 0,1 1,0 3,0 4,1 4,4.5 2.5,6 0.5,6',
  '+': '2,1.5 2,4.5|0.5,3 3.5,3',
  '-': '0.5,3 3.5,3',
  '.': '2,5.7 2,6',
  '/': '0,6 4,0',
}

/** 字距：一个字连着后面的空当占多宽，以字格计 */
const ADVANCE = 5.4
/** 笔画粗细，以字格计 */
export const STROKE = 0.8

/** 一段笔画：字格里从 a 到 b */
export interface StrokeSeg {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
}

const SEGS = new Map<string, readonly StrokeSeg[]>()

/** 一个字的笔画拆成线段；不认识的字当空格 */
export function glyphSegments(ch: string): readonly StrokeSeg[] {
  let segs = SEGS.get(ch)
  if (segs) return segs
  const out: StrokeSeg[] = []
  for (const line of (GLYPHS[ch] ?? '').split('|')) {
    const pts = line
      .split(' ')
      .filter((p) => p !== '')
      .map((p) => p.split(',').map(Number) as [number, number])
    for (let i = 1; i < pts.length; i++) out.push({ ax: pts[i - 1]![0], ay: pts[i - 1]![1], bx: pts[i]![0], by: pts[i]![1] })
  }
  segs = out
  SEGS.set(ch, segs)
  return segs
}

/** 字高 size 格的一行字有多宽，格 */
export function textWidth(s: string, size: number): number {
  return (lineUnits(s.length) * size) / 6
}

/** 这行字从左往右第 i 个字的字格原点在字格坐标里往右挪了多少 */
export function glyphOffset(i: number): number {
  return i * ADVANCE
}

/** 字格坐标里 n 个字的一行有多宽 */
export function lineUnits(n: number): number {
  return n === 0 ? 0 : n * ADVANCE - (ADVANCE - 4)
}

/** 字格坐标里 x 落在第几个字上（落在两个字之间的空当里取左边那个） */
export function glyphAt(x: number): number {
  return Math.floor(x / ADVANCE)
}
