import type Phaser from 'phaser'
import { query } from 'bitecs'
import { createAbility } from '../../abilities/create'
import type { AbilityOwner, TargetInfo } from '../../abilities/types'
import { Alive, Dormant, ENEMY_SET, Hurt, Morph, Transform } from '../components'
import { enemyAbilities, enemyDef, enemyFireDelayMs, enemyOwner } from '../store'
import { restoreMorphVisual } from '../morph'
import { makeEnemyCtx, memberRefOf } from './enemyCtx'
import type { Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 敌人持械(镜像 armEnemy)+ 每帧驱动。复用 createAbility 造出的能力运行时(阵营中立),
// 不重写任何能力逻辑。lazy-arm:敌人首次被驱动时装配(spawn 在纯逻辑层,ctx 需 phaser,
// 故推迟到场景侧首帧)。死亡(enemyDef 清空)时销毁其能力,清理持械视觉/在途 clip。

/** 已装配能力的敌人 eid 集(死亡清理只扫这一小撮,不全表扫描) */
const armedEids = new Set<number>()

/** 跨局清场:上一局的持械登记不能留给新实体(eid 从 0 重新分配) */
export function clearEnemyWire(): void {
  armedEids.clear()
}

/** 给单个敌人装配能力(镜像 armEnemy:首发延迟喂初始冷却;projectile.firstDelayMs 优先) */
function armEnemyEcs(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas, eid: number): void {
  const rows = enemyDef[eid]?.abilities
  if (!rows || rows.length === 0) return
  const old = enemyAbilities[eid]
  if (old) for (const w of old) w.destroy()
  const owner: AbilityOwner = {
    get x() {
      return Transform.x[eid]!
    },
    get y() {
      return Transform.y[eid]!
    },
    setVisualOffset() {},
  }
  const ctx = makeEnemyCtx(sim, scene, atlas, eid)
  const fireDelay = enemyFireDelayMs[eid]!
  enemyOwner[eid] = owner
  enemyAbilities[eid] = rows.map((w, i) =>
    createAbility(w, ctx, (w.kind === 'projectile' ? w.firstDelayMs : undefined) ?? fireDelay ?? 600 + i * 230),
  )
  armedEids.add(eid)
}

/** 每帧:重建队员存活快照 + lazy-arm/驱动各活着敌人的能力 + 清理已死敌人的能力 */
export function updateEnemyAbilities(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas, delta: number): void {
  // 队员存活快照(敌方能力索敌共享)
  const targets: TargetInfo[] = []
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    const x = Transform.x[m]!
    const y = Transform.y[m]!
    const radius = Hurt.radius[m]!
    const ref = memberRefOf(m)
    targets.push({ x, y, radius, ref })
    // 环面:持械敌人隔着传送门也能瞄准队员
    for (const g of sim.hooks.ghosts(sim, x, y)) targets.push({ x: g.x, y: g.y, radius, ref })
  }
  sim.memberTargets = targets

  const now = sim.elapsedMs
  const alive = new Set<number>()
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    alive.add(eid)
    if (Dormant.v[eid]) continue // 休眠:能力一并冻结(不开火、不推进冷却),回到活跃范围自然接管
    // lazy-arm 提到压制期判定之前:压制期内新生的持械敌人冷却照常推进(旧实现在出生时就装配)
    if (enemyDef[eid]?.abilities?.length && !enemyAbilities[eid]) armEnemyEcs(sim, scene, atlas, eid)
    const abilities = enemyAbilities[eid]
    const owner = enemyOwner[eid]
    // 压制期(蹦迪/变形)缴械:只推进冷却不开火——保持敌侧攻击的时间表语义
    //(窗口结束若冷却已尽则立即出手,与旧一致)。整段短路,故蹦迪期连魔尘复形都不跑:
    // 旧 steerEnemies 的蹦迪分支 continue 在复形分支之前,变形到期也得等舞会散场
    if (now < sim.danceEndsAt) {
      if (abilities) for (const w of abilities) w.tickCooldown?.(delta)
      continue
    }
    if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) {
      if (abilities) for (const w of abilities) w.tickCooldown?.(delta)
      continue
    }
    // 魔尘变形到期:复形 + 缴械后延(避免复形瞬间齐射,镜像 restoreMorph 的 postponeFire)
    if (Morph.until[eid] !== 0) {
      restoreMorphVisual(atlas, eid)
      sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 6, kind: 'puff' }) // 复形灰烟
      if (abilities) for (const w of abilities) w.postponeFire?.(700)
    }
    if (!abilities || !owner) continue
    for (const w of abilities) w.update(delta, owner)
  }
  // 死亡清理:能力仍挂但敌人已不在(击杀/自毁)→ 销毁并清空(释放持械视觉)
  for (const eid of armedEids) {
    if (alive.has(eid)) continue
    const abilities = enemyAbilities[eid]
    if (abilities) for (const w of abilities) w.destroy()
    enemyAbilities[eid] = undefined
    enemyOwner[eid] = undefined
    armedEids.delete(eid)
  }
}
