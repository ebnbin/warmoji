import { query } from 'bitecs'
import { UNIT } from '../core/units'
import { toPx } from '../battle/px'
import { playSfx } from '../audio/sfx'
import { bossFor } from '../maps/registry'
import { waveAt, isBossWave } from '../run/waves'
import {
  BOSS_SPAWN_RELIEF,
  ELITE,
  SPAWN,
  enemyMixAt,
  pickEnemy,
} from '../enemies/registry'
import { randomMapPoint } from '../enemies/spawn'
import { MAPS } from '../maps/registry'
import { ENEMY_SET } from './components'
import { spawnEnemy } from './enemy'
import type { Sim } from './sim'
import type { EcsAtlas } from './render/atlas'

// 刷怪节奏(P3e,常规波次制):随跨波累计战斗时长递增难度,供给随在场人数缩放,Boss 波减压;
// 预告(telegraph)以「延迟落地」建模(视觉标记 P6 补)。测试模式的勾选敌人补场 P4 细化。

function spawnPoint(sim: Sim): { x: number; y: number } {
  return randomMapPoint(sim.rng, sim.mapW, sim.mapH, SPAWN.edgeInset * UNIT, sim.center, SPAWN.minPlayerDist * UNIT)
}

/** 挑一只敌人排入预告(镜像 spawnOne→spawnTelegraphed) */
function spawnOne(sim: Sim, hpMultiplier: number): void {
  const def = toPx(pickEnemy(enemyMixAt(MAPS[sim.mapId].mix, sim.wave), () => sim.rng.next()))
  const elite = sim.wave >= ELITE.fromWave && sim.rng.next() < ELITE.chance
  const hp = Math.round(def.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
  const pos = spawnPoint(sim)
  sim.pendingSpawns.push({ def, x: pos.x, y: pos.y, hp, elite, boss: false, at: sim.elapsedMs + SPAWN.telegraphMs })
}

/** 生成本图 Boss(镜像 spawnBoss:同一 materialize 管线,boss 标记金边/深度/HUD 血条)。
 * 正常模式的 Boss 波开场调用;测试模式经 __ecsSpawnEnemy(bossKind) 直投 */
export function spawnBossEcs(sim: Sim, atlas: EcsAtlas): void {
  if (sim.over) return
  const def = toPx(bossFor(sim.mapId))
  const pos = spawnPoint(sim)
  spawnEnemy(sim, atlas, def, pos.x, pos.y, def.hp, false, true)
  playSfx('boom')
}

/** 每帧:预告落地 + 刷怪冷却推进(镜像 spawn) */
export function spawnStep(sim: Sim, atlas: EcsAtlas, delta: number): void {
  const now = sim.elapsedMs
  if (sim.pendingSpawns.length > 0) {
    const remain: typeof sim.pendingSpawns = []
    for (const p of sim.pendingSpawns) {
      if (now >= p.at) spawnEnemy(sim, atlas, p.def, p.x, p.y, p.hp, p.elite, p.boss)
      else remain.push(p)
    }
    sim.pendingSpawns = remain
  }
  sim.spawnCooldownMs -= delta
  if (sim.spawnCooldownMs > 0) return
  const wave = waveAt((sim.combatMs + sim.elapsedMs) / 1000)
  const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * sim.members.length
  const relief = isBossWave(sim.wave) ? BOSS_SPAWN_RELIEF : 1
  sim.spawnCooldownMs = (wave.spawnIntervalMs * relief) / teamFactor // spawnIntervalScale=1(无昼夜)
  const active = query(sim.world, ENEMY_SET as unknown as object[]).length
  if (active + sim.pendingSpawns.length >= SPAWN.maxAlive) return
  spawnOne(sim, wave.hpMultiplier)
}
