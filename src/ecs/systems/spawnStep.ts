import { playSfx } from '../../audio/sfx'
import { toPx } from '../../war/px'
import { isBossWave, waveAt } from '../../data/waves'
import { BOSS_SPAWN_RELIEF, ELITE, ENEMIES, SPAWN } from '../../data/enemies'
import { densityParams, labDifficulty, labEnemySet } from '../../run/lab'
import { mapEnemyRoster } from '../../data/maps'
import { isDayAt } from '../../war/maps/daynight'
import { pickEnemy } from '../../war/enemyAi'
import { attachCarrierRing } from '../pickups'
import { spawnEnemy } from '../entities/enemy'
import { awakeCount, currentMix, dayNightOf } from '../spawn'
import { enemyCarries } from '../store'
import type { Sim } from '../sim'

// 刷怪节奏：预告落地 + 冷却推进。挑怪/落点/难度都在 ../spawn.ts，这里只管节拍。

/** 刷怪间隔缩放(昼夜图白天更密、夜晚更疏;其余图恒 1) */
function spawnIntervalScale(sim: Sim): number {
  const dn = dayNightOf(sim)
  return dn ? (isDayAt(dn.hour) ? dn.cfg.daySpawnScale : dn.cfg.nightSpawnScale) : 1
}

/** 挑一只敌人排入预告(镜像 spawnOne→spawnTelegraphed);forceElite 供精英波敌潮强制出金边 */
function spawnOne(sim: Sim, hpMultiplier: number, forceElite = false): void {
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const elite = !sim.testMode && (forceElite || (sim.wave >= ELITE.fromWave && sim.rng.next() < ELITE.chance))
  const hp = Math.round(def.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
  const pos = sim.hooks.spawnPoint(sim, false)
  sim.pendingSpawns.push({ def, x: pos.x, y: pos.y, hp, elite, boss: false, at: sim.elapsedMs + SPAWN.telegraphMs })
}

/** 测试模式补场(镜像 spawnTest):只补勾选的敌人,密度(间隔/上限/每批)与难度(血量倍率)
 * 走场内旋钮。勾选集跨图保留,但只生成本图会出现的敌人;boss 走 Boss 待遇 */
function spawnTest(sim: Sim): void {
  const d = densityParams()
  sim.spawnCooldownMs = d.intervalMs
  const roster = new Set<string>(mapEnemyRoster(sim.mapId).map((e) => e.kind))
  const kinds = [...labEnemySet()].filter((k) => k in ENEMIES && roster.has(k))
  if (kinds.length === 0) return
  const hpMul = labDifficulty()
  for (let i = 0; i < d.batch; i++) {
    if (awakeCount(sim) + sim.pendingSpawns.length >= d.cap) return
    const raw = ENEMIES[kinds[Math.floor(sim.rng.next() * kinds.length)]!]!
    const def = toPx(raw)
    const pos = sim.hooks.spawnPoint(sim, raw.role === 'boss')
    sim.pendingSpawns.push({
      def,
      x: pos.x,
      y: pos.y,
      hp: Math.round(def.hp * hpMul),
      elite: false,
      boss: raw.role === 'boss',
      at: sim.elapsedMs + SPAWN.telegraphMs,
    })
  }
}

/** 每帧:预告落地 + 刷怪冷却推进(镜像 spawn) */
export function spawnStep(sim: Sim): void {
  const atlas = sim.frames
  const delta = sim.wdtMs
  const now = sim.elapsedMs
  // 敌潮排期到点:此刻才求落点/出怪表并挂预告(镜像 spawnSurge 的 delayedCall)
  if (sim.pendingSurges.length > 0) {
    const rest: typeof sim.pendingSurges = []
    for (const s of sim.pendingSurges) {
      if (now >= s.at) spawnOne(sim, s.hpMul, s.forceElite)
      else rest.push(s)
    }
    sim.pendingSurges = rest
  }
  if (sim.pendingSpawns.length > 0) {
    const remain: typeof sim.pendingSpawns = []
    for (const p of sim.pendingSpawns) {
      if (now >= p.at) {
        const eid = spawnEnemy(sim, atlas, p.def, p.x, p.y, p.hp, p.elite, p.boss)
        if (p.boss && !sim.testMode) playSfx('boom') // 落地轰鸣只属于正式局 Boss(镜像 spawnBoss)
        if (p.carries) {
          enemyCarries[eid] = p.carries
          attachCarrierRing(sim, eid, p.carries)
        }
      }
      else remain.push(p)
    }
    sim.pendingSpawns = remain
  }
  sim.spawnCooldownMs -= delta
  if (sim.spawnCooldownMs > 0) return
  // 测试模式与常规刷怪分道:只补勾选的敌人,旋钮说了算
  if (sim.testMode) return spawnTest(sim)
  const wave = waveAt((sim.combatMs + sim.elapsedMs) / 1000)
  const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * sim.members.length
  const relief = isBossWave(sim.wave) ? BOSS_SPAWN_RELIEF : 1
  sim.spawnCooldownMs = (wave.spawnIntervalMs * relief * spawnIntervalScale(sim)) / teamFactor
  if (awakeCount(sim) + sim.pendingSpawns.length >= SPAWN.maxAlive) return
  spawnOne(sim, wave.hpMultiplier)
}
