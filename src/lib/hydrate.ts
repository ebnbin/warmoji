import { UNIT } from './units'

// 实体数据（JSON）→ 运行时数值的唯一换算边界。
// 数据按设计单位书写：空间量 "Nu"（格，× UNIT → 逻辑 px）、角度 "Ndeg"（→ 弧度）；
// 纯数字/字符串/布尔原样通过。换算只发生在这里——下游永远拿运行时单位。

const UNIT_RE = /^(-?\d+(?:\.\d+)?)u$/
const DEG_RE = /^(-?\d+(?:\.\d+)?)deg$/
const HEX_RE = /^0x[0-9a-fA-F]+$/

function hydrateValue(v: unknown): unknown {
  if (typeof v === 'string') {
    const u = UNIT_RE.exec(v)
    if (u) return Number(u[1]) * UNIT
    const d = DEG_RE.exec(v)
    if (d) return (Number(d[1]) * Math.PI) / 180
    if (HEX_RE.test(v)) return parseInt(v, 16)
    return v
  }
  if (Array.isArray(v)) return v.map(hydrateValue)
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = hydrateValue(val)
    return out
  }
  return v
}

/** 深水合：返回换算后的新对象（原 JSON 不动）。类型由调用方按注册表类型收口 */
export function hydrate<T>(data: unknown): T {
  return hydrateValue(data) as T
}
