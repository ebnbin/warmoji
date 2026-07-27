import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EnemyArm, FACTION, Morph, Transform } from '../components'
import { equipAbility, NEUTRAL_AMP } from '../entities/ability'
import { postponeAbilities } from './shared/ability'
import { restoreMorphVisual } from '../entities/enemy'
import { enemyDef } from '../store'
import type { Sim } from '../sim'

// 新登场的持械敌人装配 + 魔尘复形。敌人是被扫到时才装（lazy-arm，
// 与旧实现的出生即装配等价——压制期照样推进冷却）。装配本身在 ../ability/arm.ts。

/** 每帧：给新登场的持械敌人装配 + 魔尘变形到期复形（缴械后延避免复形瞬间齐射）。
 * 出手与冷却由能力系统统一驱动，此处只管装配与形象 */
export function armEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue // 休眠：连装配都推迟，回到活跃范围自然接管
    if (!EnemyArm.armed[eid]) armEnemy(sim, eid)
    // 蹦迪期整段短路，故舞会散场前连复形都不跑（镜像旧 steerEnemies 的分支次序）
    if (now < sim.danceEndsAt) continue
    if (Morph.until[eid] === 0 || now < Morph.until[eid]!) continue
    restoreMorphVisual(sim.frames, eid)
    sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 6, kind: 'puff' }) // 复形灰烟
    postponeAbilities(sim, eid, 700)
  }
}

/** 给单个敌人装配能力（首发延迟喂初始冷却；projectile.firstDelayMs 优先） */
function armEnemy(sim: Sim, eid: number): void {
  const rows = enemyDef[eid]?.abilities
  EnemyArm.armed[eid] = 1
  if (!rows) return
  const fireDelay = EnemyArm.fireDelayMs[eid]!
  rows.forEach((w, i) => {
    // 「有没有声明首发延迟」是能力自己的性质，不该问它是不是某个 kind
    const delay = ('firstDelayMs' in w ? w.firstDelayMs : undefined) ?? fireDelay ?? 600 + i * 230
    equipAbility(sim, eid, w, FACTION.enemy, delay, NEUTRAL_AMP)
  })
}
