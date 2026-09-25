const INITIAL_CAP = 256
export const DAMAGE_NUMBER_RISE_MS = 350

export interface DamageNumbers {
  x: Float32Array
  y: Float32Array
  value: Int32Array
  crit: Uint8Array
  born: Float64Array
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
