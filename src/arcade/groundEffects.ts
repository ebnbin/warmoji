import type Phaser from 'phaser'
import type { GroundEffectDef } from '../types/groundEffects'
import type { ArcadeBattleScene, ImageObj } from './ArcadeBattleScene'

// 地面效果（阵营中立）：留在地面的持续区，敌我同构——team 放的烧敌人、
// enemy 放的烧队员（同 PoE ground effect 的阵营规则）。跳伤施加语义按
// 目标阵营分流，两种语义都来自合并前的毒液池/灼烧地面，行为不变：
// · 烧队员 = 按受害者节流（队员少：无论踩几个区，每 tickMs 至多掉一次血）
// · 烧敌人 = 按区域脉冲（敌人多：每区自打节拍，每拍烧区内全部敌人）

export type GroundEffectOwner =
  | { faction: 'team'; srcSlot: number }
  | { faction: 'enemy'; srcName: string }

export interface GroundEffect {
  x: number
  y: number
  r2: number
  faction: 'team' | 'enemy'
  until: number
  tickMs: number
  damage: number
  /** team 区的脉冲节拍时刻（enemy 区按受害者节流，不用） */
  nextTickAt: number
  /** 伤害归属：team 区记出招槽位，enemy 区记来源名 */
  srcSlot: number
  srcName: string
  gfx: Phaser.GameObjects.Graphics
}

export function spawnGroundEffect(
  scene: ArcadeBattleScene,
  x: number,
  y: number,
  def: GroundEffectDef,
  owner: GroundEffectOwner,
): void {
  const gfx = scene.add.graphics().setDepth(2)
  gfx.fillStyle(def.color, def.fillAlpha)
  gfx.fillCircle(0, 0, def.radius)
  gfx.lineStyle(2, def.color, def.lineAlpha)
  gfx.strokeCircle(0, 0, def.radius)
  gfx.setPosition(x, y)
  gfx.setScale(0.3)
  scene.tweens.add({ targets: gfx, scale: 1, duration: def.enterMs, ease: 'Back.easeOut' })
  scene.groundEffects.push({
    x,
    y,
    r2: def.radius * def.radius,
    faction: owner.faction,
    until: scene.elapsedMs + def.durationMs,
    tickMs: def.tickMs,
    damage: def.damage,
    nextTickAt: scene.elapsedMs + def.tickMs,
    srcSlot: owner.faction === 'team' ? owner.srcSlot : -1,
    srcName: owner.faction === 'enemy' ? owner.srcName : '',
    gfx,
  })
}

export function updateGroundEffects(scene: ArcadeBattleScene): void {
  if (scene.groundEffects.length === 0) return
  const now = scene.elapsedMs
  scene.groundEffects = scene.groundEffects.filter((g) => {
    if (now >= g.until) {
      scene.tweens.add({ targets: g.gfx, alpha: 0, duration: 250, onComplete: () => g.gfx.destroy() })
      return false
    }
    return true
  })
  // 烧队员：按受害者节流
  for (const m of scene.members) {
    if (!m.alive) continue
    for (const g of scene.groundEffects) {
      if (g.faction !== 'enemy') continue
      const d = scene.worldDelta(g, m.image)
      if (d.x * d.x + d.y * d.y > g.r2) continue
      if (now - m.lastGroundHitMs >= g.tickMs) {
        m.lastGroundHitMs = now
        scene.hurtMember(m, g.damage, 0xa5d86a, g.srcName)
      }
      break
    }
  }
  // 烧敌人：按区域脉冲
  for (const g of scene.groundEffects) {
    if (g.faction !== 'team' || now < g.nextTickAt) continue
    g.nextTickAt = now + g.tickMs
    // frameTargets 直查（虚空含镜像：镜像间距 ≥ 半场 ≫ 效果半径，不会重复命中）
    for (const t of scene.frameTargets) {
      const dx = t.x - g.x
      const dy = t.y - g.y
      if (dx * dx + dy * dy <= g.r2) {
        scene.applyDamage(t.ref as ImageObj, g.damage, 0, undefined, undefined, g.srcSlot)
      }
    }
  }
}
