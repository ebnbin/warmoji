import { UNIT } from '../util/units'
import type { AbilityDef } from '../types/abilityDefs'
import type { EnemyDef } from '../types/enemies'

type FieldName<T, Depth extends unknown[] = []> = Depth['length'] extends 6
  ? never
  : T extends readonly (infer U)[]
    ? FieldName<U, Depth>
    : T extends object
      ? { [K in keyof T & string]-?: K | FieldName<T[K], [...Depth, 0]> }[keyof T & string]
      : never

const SPATIAL: ReadonlySet<string> = new Set<FieldName<EnemyDef | AbilityDef>>([
  'knockback',
  'size',
  'radius',
  'speed',
  'reach',
  'lungeDist',
  'range',
  'hopRange',
  'returnSpeed',
  'behindDist',
  'restOffset',
  'mountGap',
  'coinMagnetRadius',
  'dashSpeed',
  'dist',
  'fxRadius',
  'fromAbove',
  'standoffDist',
  'triggerRange',
  'orbitRadius',
  'aggroRange',
  'distance',
  'height',
  'spread',
  'blastRadius',
  'detectRange',
])

const cache = new WeakMap<object, unknown>()

function walk(value: unknown, key: string | null): unknown {
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
