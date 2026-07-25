import type Phaser from 'phaser'
import { query } from 'bitecs'
import type { GroundEffectDef } from '../groundEffects/defs'
import { Alive, ENEMY_SET, Transform } from './components'
import { applyDamage, hurtMember } from './combat'
import type { Sim } from './sim'

// 地面效果(阵营中立,镜像 groundEffects.ts):留在地面的持续区,敌我同构——
// team 放的按区域脉冲烧敌人(每 tickMs 烧区内全部)、enemy 放的按受害者节流烧队员
//(每 tickMs 至多掉一次血)。视觉是半透明圆(非 emoji,走 Phaser graphics,场景侧管理);
// 逻辑跳伤复用 applyDamage/hurtMember,战报归属随区携带(team 记槽位、enemy 记敌人名)。

type Faction = 'team' | 'enemy'

interface Zone {
  x: number
  y: number
  r2: number
  faction: Faction
  /** 战报归属:team 区记出手槽位、enemy 区记敌人名 */
  srcSlot: number
  srcName: string
  until: number
  tickMs: number
  damage: number
  nextTickAt: number
  gfx: Phaser.GameObjects.Graphics
}

let zones: Zone[] = []
const memberGroundHit = new Map<number, number>()

/** 在场地面效果区数(e2e 探针) */
export function groundZoneCount(): number {
  return zones.length
}

/** 开局清空(场景重建:上一局的区与节流全清) */
export function clearGroundEffectsEcs(): void {
  for (const z of zones) z.gfx.destroy()
  zones = []
  memberGroundHit.clear()
}

/** 生成一块地面效果(镜像 spawnGroundEffect:圆形视觉入场缩放 + 逻辑区入列) */
export function spawnGroundEffectEcs(
  sim: Sim,
  scene: Phaser.Scene,
  x: number,
  y: number,
  def: GroundEffectDef,
  faction: Faction,
  srcSlot = -1,
  srcName = '',
): void {
  const gfx = scene.add.graphics().setDepth(2)
  gfx.fillStyle(def.color, def.fillAlpha)
  gfx.fillCircle(0, 0, def.radius)
  gfx.lineStyle(2, def.color, def.lineAlpha)
  gfx.strokeCircle(0, 0, def.radius)
  gfx.setPosition(x, y)
  gfx.setScale(0.3)
  scene.tweens.add({ targets: gfx, scale: 1, duration: def.enterMs, ease: 'Back.easeOut' })
  zones.push({
    x,
    y,
    r2: def.radius * def.radius,
    faction,
    srcSlot,
    srcName,
    until: sim.elapsedMs + def.durationMs,
    tickMs: def.tickMs,
    damage: def.damage,
    nextTickAt: sim.elapsedMs + def.tickMs,
    gfx,
  })
}

/** 每帧:到期淡出回收 + team 区脉冲烧敌 + enemy 区节流烧队员(镜像 updateGroundEffects) */
export function updateGroundEffectsEcs(sim: Sim, scene: Phaser.Scene): void {
  if (zones.length === 0) return
  const now = sim.elapsedMs
  zones = zones.filter((g) => {
    if (now >= g.until) {
      scene.tweens.add({ targets: g.gfx, alpha: 0, duration: 250, onComplete: () => g.gfx.destroy() })
      return false
    }
    return true
  })
  // 烧队员:按受害者节流(队员少:无论踩几个区,每 tickMs 至多掉一次血)
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    for (const g of zones) {
      if (g.faction !== 'enemy') continue
      const dx = g.x - Transform.x[m]!
      const dy = g.y - Transform.y[m]!
      if (dx * dx + dy * dy > g.r2) continue
      const last = memberGroundHit.get(m) ?? -Infinity
      if (now - last >= g.tickMs) {
        memberGroundHit.set(m, now)
        hurtMember(sim, m, g.damage, g.srcName || undefined, 0xa5d86a) // 中毒/灼烧的地面伤害走毒绿闪
      }
      break
    }
  }
  // 烧敌人:按区域脉冲(敌人多:每区自打节拍,每拍烧区内全部)
  const enemies = query(sim.world, ENEMY_SET as unknown as object[])
  for (const g of zones) {
    if (g.faction !== 'team' || now < g.nextTickAt) continue
    g.nextTickAt = now + g.tickMs
    for (const eid of enemies) {
      const dx = Transform.x[eid]! - g.x
      const dy = Transform.y[eid]! - g.y
      if (dx * dx + dy * dy <= g.r2) applyDamage(sim, eid, g.damage, 0, undefined, undefined, g.srcSlot)
    }
  }
}
