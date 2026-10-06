/**
 * 记号笔的手写字：每个字在 4 宽 6 高的字格里（y 朝下，0 是字顶、6 是基线），由几条折线组成；
 * 折线之间用 | 隔开，折线上的点写成 x,y、用空格隔开
 */
const GLYPHS: Readonly<Record<string, string>> = {
  ' ': '',
  '0': '2,0 0.9,0.4 0.2,1.6 0,3 0.2,4.4 0.9,5.6 2,6 3.1,5.6 3.8,4.4 4,3 3.8,1.6 3.1,0.4 2,0',
  '1': '0.8,1.2 2,0 2,6',
  '2': '0.2,1.4 0.9,0.3 2,0 3.2,0.4 3.7,1.4 3.4,2.5 0,6 4,6',
  '3': '0.3,0.8 1.4,0.05 2.8,0.1 3.6,0.9 3.5,2 2.4,2.8 1.4,2.9|2.4,2.8 3.6,3.6 3.8,4.8 3.1,5.7 1.8,6 0.6,5.6 0.1,4.9',
  '4': '2.8,6 2.8,0 0,4.2 4,4.2',
  '5': '3.6,0 0.6,0 0.3,2.8 1.6,2.3 2.9,2.5 3.8,3.5 3.8,4.8 3,5.8 1.6,6 0.5,5.6 0,4.9',
  '6': '3.4,0.4 2.3,0 1.2,0.3 0.4,1.4 0.1,3 0.2,4.6 0.9,5.7 2,6 3.1,5.7 3.8,4.7 3.8,3.6 3.1,2.7 2,2.4 0.9,2.8 0.2,3.8',
  '7': '0,0 4,0 1.4,6',
  '8': '2,2.9 0.8,2.3 0.4,1.3 0.9,0.3 2,0 3.1,0.3 3.6,1.3 3.2,2.3 2,2.9 0.6,3.6 0.1,4.7 0.7,5.7 2,6 3.3,5.7 3.9,4.7 3.4,3.6 2,2.9',
  '9': '3.7,2.4 2.9,3.2 1.8,3.4 0.7,3 0.1,2 0.3,0.9 1.1,0.1 2.2,0 3.2,0.4 3.8,1.4 3.8,3.2 3.4,4.8 2.5,5.8 1.4,6 0.5,5.6',
  A: '0,6 2,0 4,6|0.8,3.8 3.2,3.8',
  B: '0.3,6 0.3,0 2.4,0 3.4,0.5 3.6,1.4 3.1,2.4 2.2,2.8 0.3,2.8|2.2,2.8 3.4,3.3 3.9,4.3 3.6,5.4 2.6,6 0.3,6',
  C: '3.8,1 3,0.2 1.9,0 0.9,0.4 0.2,1.6 0,3 0.2,4.4 0.9,5.6 2,6 3.1,5.7 3.9,4.9',
  N: '0.3,6 0.3,0 3.7,6 3.7,0',
  P: '0.3,6 0.3,0 2.5,0 3.5,0.5 3.8,1.5 3.4,2.6 2.4,3.1 0.3,3.1',
  '°': '1,0.2 1.6,0 2.2,0.2 2.4,0.8 2.2,1.4 1.6,1.6 1,1.4 0.8,0.8 1,0.2',
  '/': '0.4,6 3.6,0',
  '.': '1.8,5.6 2.2,6',
}

/** 字距：一个字连着后面的空当占多宽，以字格计 */
const ADVANCE = 4.8

/** 一段笔画：两头的点 */
export interface InkSeg {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
}

const PARSED = new Map<string, readonly InkSeg[]>()

/** 一个字的笔画拆成字格里的线段；不认识的字当空格 */
function glyph(ch: string): readonly InkSeg[] {
  let segs = PARSED.get(ch)
  if (segs) return segs
  const out: InkSeg[] = []
  for (const line of (GLYPHS[ch] ?? '').split('|')) {
    const pts = line
      .split(' ')
      .filter((p) => p !== '')
      .map((p) => p.split(',').map(Number) as [number, number])
    for (let i = 1; i < pts.length; i++) out.push({ ax: pts[i - 1]![0], ay: pts[i - 1]![1], bx: pts[i]![0], by: pts[i]![1] })
  }
  segs = out
  PARSED.set(ch, segs)
  return segs
}

/**
 * 一行手写字的笔画，格：字高 size、中心在 (x, y)、整行转过 rot 弧度；jitter 给第 i 个字一点歪斜与上下的错落（手写的样子），
 * 返回的是字的笔画中线
 */
export function markerText(s: string, x: number, y: number, size: number, rot: number, jitter: (i: number) => { readonly dx: number; readonly dy: number; readonly turn: number }): InkSeg[] {
  const k = size / 6
  const width = s.length === 0 ? 0 : (s.length - 1) * ADVANCE + 4
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const out: InkSeg[] = []
  for (let i = 0; i < s.length; i++) {
    const j = jitter(i)
    const ox = i * ADVANCE - width / 2 + 2 + j.dx
    const oy = j.dy
    const jc = Math.cos(j.turn)
    const js = Math.sin(j.turn)
    // 字格里先绕字心转一点，再挪到行里，最后整行转过去
    const place = (gx: number, gy: number): { x: number; y: number } => {
      const lx = (gx - 2) * jc - (gy - 3) * js + ox
      const ly = (gx - 2) * js + (gy - 3) * jc + oy
      return { x: x + (lx * cos - ly * sin) * k, y: y + (lx * sin + ly * cos) * k }
    }
    for (const g of glyph(s[i]!)) {
      const a = place(g.ax, g.ay)
      const b = place(g.bx, g.by)
      out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y })
    }
  }
  return out
}
