// 仿真只写、渲染层只读；最老的一条还没播完就翻倍扩容，不覆盖、不建实体

const INITIAL_CAP = 256
export const DAMAGE_NUMBER_RISE_MS = 350

export interface DamageNumbers {
  x: Float32Array
  y: Float32Array
  value: Int32Array
  crit: Uint8Array
  /** fxMs；空槽为 -Infinity */
  born: Float64Array
  /** 下一条写入的槽位，也是最老的一条 */
  head: number
}

export function newDamageNumbers(): DamageNumbers {
  return {
    x: new Float32Array(INITIAL_CAP),
    y: new Float32Array(INITIAL_CAP),
    value: new Int32Array(INITIAL_CAP),
    crit: new Uint8Array(INITIAL_CAP),
    born: new Float64Array(INITIAL_CAP).fill(-Infinity),
    head: 0,
  }
}

/** 从最老的一条起按序搬进两倍长的新数组，新槽位接在末尾 */
function grow(d: DamageNumbers): void {
  const cap = d.born.length
  const order = <T extends Float32Array | Int32Array | Uint8Array | Float64Array>(a: T, next: T): T => {
    next.set(a.subarray(d.head), 0)
    next.set(a.subarray(0, d.head), cap - d.head)
    return next
  }
  d.x = order(d.x, new Float32Array(cap * 2))
  d.y = order(d.y, new Float32Array(cap * 2))
  d.value = order(d.value, new Int32Array(cap * 2))
  d.crit = order(d.crit, new Uint8Array(cap * 2))
  d.born = order(d.born, new Float64Array(cap * 2).fill(-Infinity))
  d.head = cap
}

export function pushDamageNumber(
  d: DamageNumbers, x: number, y: number, value: number, crit: boolean, fxMs: number,
): void {
  if (fxMs - d.born[d.head]! < DAMAGE_NUMBER_RISE_MS) grow(d)
  const i = d.head
  d.x[i] = x
  d.y[i] = y
  d.value[i] = value
  d.crit[i] = crit ? 1 : 0
  d.born[i] = fxMs
  d.head = (i + 1) % d.born.length
}
