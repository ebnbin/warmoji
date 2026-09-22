// 仿真只写、渲染层只读；满了顶掉最老的一条，不建实体

export const DAMAGE_NUMBER_CAP = 256
export const DAMAGE_NUMBER_RISE_MS = 350

export interface DamageNumbers {
  readonly x: Float32Array
  readonly y: Float32Array
  readonly value: Int32Array
  readonly crit: Uint8Array
  /** fxMs；空槽为 -Infinity */
  readonly born: Float64Array
  /** 下一条写入的槽位，也是最老的一条 */
  head: number
}

export function newDamageNumbers(): DamageNumbers {
  return {
    x: new Float32Array(DAMAGE_NUMBER_CAP),
    y: new Float32Array(DAMAGE_NUMBER_CAP),
    value: new Int32Array(DAMAGE_NUMBER_CAP),
    crit: new Uint8Array(DAMAGE_NUMBER_CAP),
    born: new Float64Array(DAMAGE_NUMBER_CAP).fill(-Infinity),
    head: 0,
  }
}

export function pushDamageNumber(
  d: DamageNumbers, x: number, y: number, value: number, crit: boolean, fxMs: number,
): void {
  const i = d.head
  d.x[i] = x
  d.y[i] = y
  d.value[i] = value
  d.crit[i] = crit ? 1 : 0
  d.born[i] = fxMs
  d.head = (i + 1) % DAMAGE_NUMBER_CAP
}
