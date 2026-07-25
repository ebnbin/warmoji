import { query } from 'bitecs'
import { toPx } from '../battle/px'
import { playSfx } from '../audio/sfx'
import { bossFor } from '../maps/registry'
import { waveAt, isBossWave } from '../run/waves'
import {
  BOSS_SPAWN_RELIEF,
  ELITE,
  ENEMIES,
  SPAWN,
  SURGE,
  enemyMixAt,
  pickEnemy,
} from '../enemies/registry'
import { DENSITY_PARAMS, labDensity, labDifficulty, labEnemySet } from '../run/lab'
import { MAPS, mapEnemyRoster } from '../maps/registry'
import type { MapDef } from '../maps/registry'
import { hourAt, isDayAt } from '../maps/daynight'
import { Dormant, ENEMY_SET } from './components'
import { spawnEnemy } from './enemy'
import { enemyCarries } from './store'
import type { Sim } from './sim'
import type { FieldPickupDef } from '../battlefield/registry'
import type { EcsAtlas } from './render/atlas'

// 刷怪节奏(P3e,常规波次制):随跨波累计战斗时长递增难度,供给随在场人数缩放,Boss 波减压;
// 预告(telegraph)以「延迟落地」建模(视觉标记 P6 补)。测试模式的勾选敌人补场 P4 细化。

/** 当前时钟小时(昼夜图用;非昼夜图恒 undefined) */
function dayNightOf(sim: Sim): { cfg: NonNullable<MapDef['dayNight']>; hour: number } | undefined {
  const cfg = MAPS[sim.mapId].dayNight
  if (!cfg) return undefined
  return { cfg, hour: hourAt((sim.combatMs + sim.elapsedMs) / 1000, cfg) }
}

/** 本图当前出怪表(昼夜图按时刻在 dayMix/nightMix 间切换,波内也实时换批) */
export function currentMix(sim: Sim): ReturnType<typeof enemyMixAt> {
  const m = MAPS[sim.mapId]
  const dn = dayNightOf(sim)
  const rows = dn ? ((isDayAt(dn.hour) ? m.dayMix : m.nightMix) ?? m.mix) : m.mix
  return enemyMixAt(rows, sim.wave)
}

/** 刷怪间隔缩放(昼夜图白天更密、夜晚更疏;其余图恒 1) */
function spawnIntervalScale(sim: Sim): number {
  const dn = dayNightOf(sim)
  return dn ? (isDayAt(dn.hour) ? dn.cfg.daySpawnScale : dn.cfg.nightSpawnScale) : 1
}

/** 在场活跃敌人数(休眠者不占刷怪上限,镜像 spawnCapCount) */
function awakeCount(sim: Sim): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) if (!Dormant.v[eid]) n++
  return n
}

/** 挑一只敌人排入预告(镜像 spawnOne→spawnTelegraphed);forceElite 供精英波敌潮强制出金边 */
function spawnOne(sim: Sim, hpMultiplier: number, forceElite = false): void {
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const elite = forceElite || (sim.wave >= ELITE.fromWave && sim.rng.next() < ELITE.chance)
  const hp = Math.round(def.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
  const pos = sim.hooks.spawnPoint(sim, false)
  sim.pendingSpawns.push({ def, x: pos.x, y: pos.y, hp, elite, boss: false, at: sim.elapsedMs + SPAWN.telegraphMs })
}

/** 精英波敌潮(镜像 spawnSurge):一口气排 SURGE.count 只,前 SURGE.elites 只强制金边;
 * 落地时刻在 spreadMs 内均摊铺开(用预告时刻表达,无需场景侧计时器) */
export function spawnSurgeEcs(sim: Sim): void {
  if (sim.over) return
  const hpMul = waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  const base = sim.elapsedMs + SPAWN.telegraphMs
  for (let i = 0; i < SURGE.count; i++) {
    const before = sim.pendingSpawns.length
    spawnOne(sim, hpMul, i < SURGE.elites)
    const p = sim.pendingSpawns[before]
    if (p) p.at = base + (i * SURGE.spreadMs) / SURGE.count
  }
}

/** 生成本图 Boss(镜像 spawnBoss:同一 materialize 管线,boss 标记金边/深度/HUD 血条)。
 * 正常模式的 Boss 波开场调用;测试模式经 __ecsSpawnEnemy(bossKind) 直投 */
export function spawnBossEcs(sim: Sim): void {
  if (sim.over) return
  const def = toPx(bossFor(sim.mapId))
  const pos = sim.hooks.spawnPoint(sim, true)
  // 与普通敌人同一条预告管线,只是标记更大、预告更久(镜像 spawnBoss)
  sim.pendingSpawns.push({
    def,
    x: pos.x,
    y: pos.y,
    hp: def.hp,
    elite: false,
    boss: true,
    at: sim.elapsedMs + SPAWN.telegraphMs * 1.6,
  })
}

/** 投放一名携带者(镜像 spawnCarrier):从当前出怪表取普通怪 + carries 载荷,走同一预告管线。
 * 场上过挤则本次跳过 */
export function spawnCarrierEcs(sim: Sim, pickup: FieldPickupDef): void {
  if (sim.over) return
  if (awakeCount(sim) + sim.pendingSpawns.length >= SPAWN.maxAlive) return
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const hp = Math.round(def.hp * waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier)
  const pos = sim.hooks.spawnPoint(sim, false)
  sim.pendingSpawns.push({
    def,
    x: pos.x,
    y: pos.y,
    hp,
    elite: false,
    boss: false,
    at: sim.elapsedMs + SPAWN.telegraphMs,
    carries: pickup,
  })
}

/** 测试模式补场(镜像 spawnTest):只补勾选的敌人,密度(间隔/上限/每批)与难度(血量倍率)
 * 走场内旋钮。勾选集跨图保留,但只生成本图会出现的敌人;boss 走 Boss 待遇 */
function spawnTest(sim: Sim): void {
  const d = DENSITY_PARAMS[labDensity()]
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
export function spawnStep(sim: Sim, atlas: EcsAtlas, delta: number): void {
  const now = sim.elapsedMs
  if (sim.pendingSpawns.length > 0) {
    const remain: typeof sim.pendingSpawns = []
    for (const p of sim.pendingSpawns) {
      if (now >= p.at) {
        const eid = spawnEnemy(sim, atlas, p.def, p.x, p.y, p.hp, p.elite, p.boss)
        if (p.boss) playSfx('boom')
        if (p.carries) {
          enemyCarries[eid] = p.carries
          sim.pendingAuras.push({ eid, def: p.carries })
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
