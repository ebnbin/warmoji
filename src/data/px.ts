import { UNIT } from '../util/units'

// 数据表一律格值，进场处 toPx 一次换算成 px
const SPATIAL = new Set([
  'knockback',
  'size',
  'radius',
  'speed',
  'reach',
  'hitRadius',
  'lungeDist',
  'range',
  'beamRadius',
  'detectRange',
  'blastRadius',
  'returnSpeed',
  'behindDist',
  'arcRange',
  'restOffset',
  'mountGap',
  'coinMagnetRadius',
  'dashSpeed',
  'dist',
  'fleeRange',
  'ringRadius',
  'fromAbove',
  'standoffDist',
  'triggerRange',
  'orbitRadius',
  'aggroRange',
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

/** 深拷贝，原对象不动 */
export function toPx<T>(value: T): T {
  return walk(value, null) as T
}
