import { UNIT } from '../../util/units'
import { cellAt } from './masonry'
import { toWorld } from './layout'
import type { RuinsPlan } from './layout'
import type { Landmark } from '../landmark'

/** 墙上的口子从墙头往里多远起、每隔多远一站，格 */
const WALL_FROM_U = 1.25
const WALL_STEP_U = 2.5
/** 翻墙的口子在墙面外这么远，格：起点落在墙头上 */
const WALL_OFF_U = 0.5

/**
 * 残垣的地标，像素，按开局的砌体一次定下：door 是通到院外、开局没被木板封住的门洞，朝院落里；
 * 外墙、内墙与塔楼的墙每隔一段一站，标准身高跨不过的站两侧各一处：wall 在墙面外，haunt 在墙心，都朝那一侧。墙塌了地标照旧，翻过的是碎石堆；
 * tower 是塔楼里头的正中
 */
export function ruinsMarks(plan: RuinsPlan, walk: number): Record<string, Landmark[]> {
  const f = plan.frame
  const at = (u: number, v: number, du: number, dv: number): Landmark => {
    const w = toWorld(f, u, v)
    return { x: w.x * UNIT, y: w.y * UNIT, r: 0, nx: du * f.cos - dv * f.sin, ny: du * f.sin + dv * f.cos }
  }
  const door: Landmark[] = []
  for (const d of plan.doors) {
    if (!d.outer) continue
    const mid = (d.a + d.b) / 2
    const u = d.axis === 0 ? mid : d.line
    const v = d.axis === 0 ? d.line : mid
    if (plan.timber[cellAt(plan.grid, u, v)]) continue
    door.push(d.axis === 0 ? at(u, v, 0, Math.sign(f.h / 2 - d.line) || 1) : at(u, v, Math.sign(f.w / 2 - d.line) || 1, 0))
  }
  const wall: Landmark[] = []
  const haunt: Landmark[] = []
  plan.structures.forEach((st, k) => {
    if (st.kind !== 'outer' && st.kind !== 'inner' && st.kind !== 'tower') return
    const along0 = st.axis === 0 ? st.u0 : st.v0
    const along1 = st.axis === 0 ? st.u1 : st.v1
    const mid = st.axis === 0 ? (st.v0 + st.v1) / 2 : (st.u0 + st.u1) / 2
    const half = (st.axis === 0 ? st.v1 - st.v0 : st.u1 - st.u0) / 2
    for (let s = along0 + WALL_FROM_U; s <= along1 - WALL_FROM_U + 1e-6; s += WALL_STEP_U) {
      const cu = st.axis === 0 ? s : mid
      const cv = st.axis === 0 ? mid : s
      const c = cellAt(plan.grid, cu, cv)
      if (c < 0 || plan.sid[c] !== k + 1 || plan.n[c]! <= walk) continue
      for (const side of [1, -1]) {
        const du = st.axis === 0 ? 0 : side
        const dv = st.axis === 0 ? side : 0
        const off = half + WALL_OFF_U
        wall.push(at(cu + du * off, cv + dv * off, du, dv))
        haunt.push(at(cu, cv, du, dv))
      }
    }
  })
  const tower = plan.spaces.flatMap((sp) => (sp.kind === 'tower' ? [at((sp.u0 + sp.u1) / 2, (sp.v0 + sp.v1) / 2, 0, 0)] : []))
  return { door, wall, haunt, tower }
}
