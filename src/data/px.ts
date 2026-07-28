import { UNIT } from '../util/units'

// 使用侧换算：注册表数值一律格值（项目约定，见 CLAUDE.md），战斗引擎在
// 进场处调 toPx 一次性换算成运行时 px。按字段名识别空间量、深拷贝换算；
// 同一原始对象的换算结果按引用缓存——分裂链（泡泡→小泡泡）共享同一份
// 换算后的子 def，重复换算天然幂等。
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

/** 格值 def → px def（深拷贝，原注册表对象不动） */
export function toPx<T>(value: T): T {
  return walk(value, null) as T
}
