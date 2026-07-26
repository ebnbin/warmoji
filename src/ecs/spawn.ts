import { query } from 'bitecs'
import { toPx } from '../war/px'
import { bossFor } from '../data/maps'
import { waveAt } from '../data/waves'
import { SPAWN, SURGE } from '../data/enemies'
import { MAPS } from '../data/maps'
import type { MapDef } from '../types/maps'
import { hourAt, isDayAt } from '../war/maps/daynight'
import { Dormant, ENEMY_SET } from './components'
import type { Sim } from './sim'
import type { FieldPickupDef } from '../types/battlefield'
import { enemyMixAt, pickEnemy } from '../war/enemyAi'

// 刷怪节奏(常规波次制):随跨波累计战斗时长递增难度,供给随在场人数缩放,Boss 波减压;
// 预告(telegraph)以「延迟落地」建模,视觉标记由场景侧按 pendingSpawns 对帐。
// 试炼场与常规刷怪分道:只补勾选的敌人,密度/难度走场内旋钮。

/** 当前时钟小时(昼夜图用;非昼夜图恒 undefined) */
export function dayNightOf(sim: Sim): { cfg: NonNullable<MapDef['dayNight']>; hour: number } | undefined {
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

/** 在场活跃敌人数(休眠者不占刷怪上限,镜像 spawnCapCount) */
export function awakeCount(sim: Sim): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) if (!Dormant.v[eid]) n++
  return n
}

/** 精英波敌潮(镜像 spawnSurge):在 spreadMs 内均摊排 SURGE.count 只,前 SURGE.elites 只强制金边。
 * 只排「何时出」,落点与出怪表留到各自时刻才现算——镜像旧实现把整个 spawnOne 塞进 delayedCall:
 * 敌潮会追着移动中的队伍铺开,⚠ 预告也一个个亮起,而非开场一次性算死 14 个落点 */
export function spawnSurgeEcs(sim: Sim): void {
  if (sim.over) return
  const hpMul = waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (let i = 0; i < SURGE.count; i++) {
    sim.pendingSurges.push({
      at: sim.elapsedMs + (i * SURGE.spreadMs) / SURGE.count,
      hpMul,
      forceElite: i < SURGE.elites,
    })
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

