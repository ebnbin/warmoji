import { UNIT } from '../util/units'
import type { AbilityDef } from '../types/abilityDefs'
import type { EnemyDef } from '../types/enemies'
import type { GearWhen, ItemReaction } from '../types/items'

/** 会经过 toPx 的数值字段名：stats 底下按属性表自己的单位，不算；只能不写的字段也不算 */
type NumField<T, Depth extends unknown[] = []> = Depth['length'] extends 6
  ? never
  : T extends readonly (infer U)[]
    ? NumField<U, Depth>
    : T extends object
      ? { [K in Exclude<keyof T & string, 'stats'>]-?: [NonNullable<T[K]>] extends [never] ? never : (NonNullable<T[K]> extends number ? K : never) | NumField<NonNullable<T[K]>, [...Depth, 0]> }[Exclude<keyof T & string, 'stats'>]
      : never

/** 每个数值字段都要说明是不是以格为单位的长度或速度：新字段不登记就编译不过 */
const UNIT_OF: Record<NumField<EnemyDef | AbilityDef | GearWhen | ItemReaction>, 'cell' | 'plain'> = {
  aggroRange: 'cell',
  alpha: 'plain',
  amount: 'plain',
  arcDeg: 'plain',
  at: 'plain',
  atLeast: 'plain',
  behindDist: 'cell',
  below: 'plain',
  bossRatio: 'plain',
  breach: 'plain',
  cdMs: 'plain',
  chance: 'plain',
  charges: 'plain',
  coinMagnetRadius: 'cell',
  coins: 'plain',
  color: 'plain',
  cooldownMs: 'plain',
  cost: 'plain',
  count: 'plain',
  damage: 'plain',
  damageMul: 'plain',
  dash: 'cell',
  decay: 'plain',
  decayDelayMs: 'plain',
  degPerSec: 'plain',
  delayMs: 'plain',
  detectRange: 'cell',
  distance: 'cell',
  dmgRatio: 'plain',
  dps: 'plain',
  dropMs: 'plain',
  durMs: 'plain',
  durationMs: 'plain',
  enterMs: 'plain',
  escape: 'plain',
  everyMs: 'plain',
  everyN: 'plain',
  exertion: 'plain',
  factor: 'plain',
  fillAlpha: 'plain',
  firstDelayMs: 'plain',
  form: 'plain',
  fromAbove: 'cell',
  fxRadius: 'cell',
  gain: 'plain',
  gap: 'cell',
  gcdMs: 'plain',
  height: 'cell',
  hits: 'plain',
  hopRange: 'cell',
  hops: 'plain',
  hp: 'plain',
  hpCost: 'plain',
  hpRatio: 'plain',
  intervalMs: 'plain',
  knockback: 'cell',
  length: 'cell',
  lifeMs: 'plain',
  lineAlpha: 'plain',
  lineWidth: 'plain',
  linger: 'plain',
  lockMs: 'plain',
  lungeDist: 'cell',
  max: 'plain',
  maxAlive: 'plain',
  maxMs: 'plain',
  mend: 'plain',
  mountGap: 'cell',
  mountSide: 'plain',
  ms: 'plain',
  mul: 'plain',
  offset: 'cell',
  onHit: 'plain',
  onHurt: 'plain',
  onKill: 'plain',
  outMs: 'plain',
  p: 'plain',
  peakM: 'plain',
  pierce: 'plain',
  priority: 'plain',
  pull: 'cell',
  radius: 'cell',
  range: 'cell',
  ratio: 'plain',
  reach: 'cell',
  reachMul: 'plain',
  regen: 'plain',
  reloadMs: 'plain',
  restOffset: 'cell',
  returnSpeed: 'cell',
  rotationOffsetDeg: 'plain',
  size: 'cell',
  speed: 'cell',
  speedMul: 'plain',
  spend: 'plain',
  spinDegPerSec: 'plain',
  spinRadPerSec: 'plain',
  spit: 'cell',
  spread: 'cell',
  spreadDeg: 'plain',
  staggerMs: 'plain',
  standoffDist: 'cell',
  start: 'plain',
  strikeMs: 'plain',
  targets: 'plain',
  tickMs: 'plain',
  to: 'plain',
  traction: 'plain',
  value: 'plain',
  vulnMul: 'plain',
  wakeMul: 'plain',
  windowMs: 'plain',
  xp: 'plain',
}

const SPATIAL: ReadonlySet<string> = new Set(Object.entries(UNIT_OF).flatMap(([k, u]) => (u === 'cell' ? [k] : [])))

const cache = new WeakMap<object, unknown>()

function walk(value: unknown, key: string | null): unknown {
  // 属性修正用格这些自然单位，由属性表自己换算
  if (key === 'stats') return value
  if (typeof value === 'number') return key !== null && SPATIAL.has(key) ? value * UNIT : value
  if (Array.isArray(value)) return value.map((v) => walk(v, null))
  if (value !== null && typeof value === 'object') {
    const hit = cache.get(value)
    if (hit) return hit
    const out: Record<string, unknown> = {}
    cache.set(value, out)
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, k)
    return out
  }
  return value
}

export function toPx<T>(value: T): T {
  return walk(value, null) as T
}
