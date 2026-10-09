const INITIAL_CAP = 128

/** 打中时的指示：trace 是看不见出手的一下从出手处牵到挨打处的一道光，spark 是挨打处顺着来向迸开的火花，hurt 是队员挨打时身边指向来处的一弧 */
export const HIT_CUE = { trace: 0, spark: 1, hurt: 2 } as const
export type HitCueKind = (typeof HIT_CUE)[keyof typeof HIT_CUE]

/** 各种指示演多久，画面时钟 */
export const HIT_CUE_MS: Readonly<Record<HitCueKind, number>> = { 0: 220, 1: 200, 2: 480 }

/** 不是实体，按画面时钟画完就作废；(x0, y0) 是挨打处，(x1, y1) 是来处；hurt 跟着挨打的身体 who 走，身体换了人就停在原处 */
export interface HitCues {
  kind: Uint8Array
  x0: Float32Array
  y0: Float32Array
  x1: Float32Array
  y1: Float32Array
  color: Uint32Array
  who: Int32Array
  whoUid: Uint32Array
  born: Float64Array
  head: number
}

export function newHitCues(): HitCues {
  return {
    kind: new Uint8Array(INITIAL_CAP),
    x0: new Float32Array(INITIAL_CAP),
    y0: new Float32Array(INITIAL_CAP),
    x1: new Float32Array(INITIAL_CAP),
    y1: new Float32Array(INITIAL_CAP),
    color: new Uint32Array(INITIAL_CAP),
    who: new Int32Array(INITIAL_CAP).fill(-1),
    whoUid: new Uint32Array(INITIAL_CAP),
    born: new Float64Array(INITIAL_CAP).fill(-Infinity),
    head: 0,
  }
}

const LONGEST_MS = Math.max(...Object.values(HIT_CUE_MS))

type Column = Uint8Array | Float32Array | Uint32Array | Int32Array | Float64Array

function grow(c: HitCues): void {
  const cap = c.born.length
  const order = <T extends Column>(a: T, next: T): T => {
    next.set(a.subarray(c.head) as never, 0)
    next.set(a.subarray(0, c.head) as never, cap - c.head)
    return next
  }
  c.kind = order(c.kind, new Uint8Array(cap * 2))
  c.x0 = order(c.x0, new Float32Array(cap * 2))
  c.y0 = order(c.y0, new Float32Array(cap * 2))
  c.x1 = order(c.x1, new Float32Array(cap * 2))
  c.y1 = order(c.y1, new Float32Array(cap * 2))
  c.color = order(c.color, new Uint32Array(cap * 2))
  c.who = order(c.who, new Int32Array(cap * 2).fill(-1))
  c.whoUid = order(c.whoUid, new Uint32Array(cap * 2))
  c.born = order(c.born, new Float64Array(cap * 2).fill(-Infinity))
  c.head = cap
}

export function pushHitCue(
  c: HitCues, kind: HitCueKind, x0: number, y0: number, x1: number, y1: number, color: number, fxMs: number, who = -1, whoUid = 0,
): void {
  if (fxMs - c.born[c.head]! < LONGEST_MS) grow(c)
  const i = c.head
  c.kind[i] = kind
  c.x0[i] = x0
  c.y0[i] = y0
  c.x1[i] = x1
  c.y1[i] = y1
  c.color[i] = color
  c.who[i] = who
  c.whoUid[i] = whoUid
  c.born[i] = fxMs
  c.head = (i + 1) % c.born.length
}
