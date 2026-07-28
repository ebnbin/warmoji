import { playSfx } from '../../audio/sfx'
import { toPx } from '../../data/px'
import { isBossWave, waveAt } from '../../data/waves'
import { BOSS_SPAWN_RELIEF, ENEMIES, SPAWN } from '../../data/enemies'
import { spawnParams, sandboxDifficulty, sandboxEnemySet } from '../../run/sandbox'
import { mapEnemyRoster } from '../../data/maps'
import { isDayAt } from '../worlds/daynight'
import { attachCarrierRing } from '../entities/pickup'
import { spawnEnemy } from '../entities/enemy'
import { awakeCount, dayNightOf, telegraphOne } from '../entities/enemy'
import { spawnTelegraph, telegraphCount } from '../entities/telegraph'
import { enemyCarries, telegraphCarries, telegraphDef } from '../store'
import { Due, Telegraph, Transform } from '../components'
import { query, removeEntity } from 'bitecs'
import type { Sim } from '../sim'

// 刷怪节奏：预告落地 + 冷却推进。挑怪/落点/难度都在 ../spawn.ts，这里只管节拍。

/** 刷怪间隔缩放(昼夜图白天更密、夜晚更疏;其余图恒 1) */
function spawnIntervalScale(sim: Sim): number {
  const dn = dayNightOf(sim)
  return dn ? (isDayAt(dn.hour) ? dn.cfg.daySpawnScale : dn.cfg.nightSpawnScale) : 1
}

/** 试炼场补场(镜像 spawnSandbox):只补勾选的敌人,密度(间隔/上限/每批)与难度(血量倍率)
 * 走场内旋钮。勾选集跨图保留,但只生成本图会出现的敌人;boss 走 Boss 待遇 */
function spawnSandbox(sim: Sim): void {
  const d = spawnParams()
  sim.spawnCooldownMs = d.intervalMs
  const roster = new Set<string>(mapEnemyRoster(sim.mapId).map((e) => e.kind))
  const kinds = [...sandboxEnemySet()].filter((k) => k in ENEMIES && roster.has(k))
  if (kinds.length === 0) return
  const hpMul = sandboxDifficulty()
  for (let i = 0; i < d.batch; i++) {
    if (awakeCount(sim) + telegraphCount(sim) >= d.cap) return
    const raw = ENEMIES[kinds[Math.floor(sim.rng.next() * kinds.length)]!]!
    const def = toPx(raw)
    const pos = sim.hooks.spawnPoint(sim, raw.role === 'boss')
    spawnTelegraph(sim, def, pos.x, pos.y, Math.round(def.hp * hpMul), false, raw.role === 'boss')
  }
}

/** 每帧:预告落地 + 刷怪冷却推进(镜像 spawn) */
export function spawnStep(sim: Sim): void {
  const atlas = sim.frames
  const delta = sim.wdtMs
  const now = sim.elapsedMs
  // 预告到点:在原地换成真敌人。快照迭代——spawnEnemy 会建实体,直接迭代活查询集会漏
  for (const e of [...query(sim.world, [Telegraph, Due])]) {
    if (now < Due.at[e]!) continue
    const boss = Telegraph.boss[e] === 1
    const eid = spawnEnemy(sim, atlas, telegraphDef[e]!, Transform.x[e]!, Transform.y[e]!,
      Telegraph.hp[e]!, Telegraph.elite[e] === 1, boss)
    if (boss && !sim.sandbox) playSfx('boom') // 落地轰鸣只属于正式局 Boss(镜像 spawnBoss)
    const carries = telegraphCarries[e]
    if (carries) {
      enemyCarries[eid] = carries
      attachCarrierRing(sim, eid, carries)
    }
    removeEntity(sim.world, e)
  }
  sim.spawnCooldownMs -= delta
  if (sim.spawnCooldownMs > 0) return
  // 试炼场与常规刷怪分道:只补勾选的敌人,旋钮说了算
  if (sim.sandbox) return spawnSandbox(sim)
  const wave = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000)
  const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * sim.characters.length
  const relief = isBossWave(sim.run.wave) ? BOSS_SPAWN_RELIEF : 1
  sim.spawnCooldownMs = (wave.spawnIntervalMs * relief * spawnIntervalScale(sim)) / teamFactor
  if (awakeCount(sim) + telegraphCount(sim) >= SPAWN.maxAlive) return
  telegraphOne(sim, wave.hpMultiplier)
}
