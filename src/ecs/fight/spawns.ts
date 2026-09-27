import { SPAWN } from '../../data/enemies'
import { bossFor, MAPS } from '../../data/maps'
import { timeLimitMs } from '../../data/runs'
import { waveAt } from '../../data/waves'
import type { Banner, CarrierRule, Squad } from '../../types/runs'
import { dayNightOf, foeCount, spawnBoss, telegraphOne } from '../entities/enemy'
import { scheduleCall, scheduleCarrier, scheduleOrder } from '../entities/schedule'
import { telegraphCount } from '../entities/telegraph'
import { rollCarriers } from '../utils/battleFx'
import { isDayAt } from '../worlds/daynight'
import type { Sim } from '../sim'
import type { StreamState } from './state'

/** 开打：定时登场的排好，带光圈的敌人抽好效果排好 */
export function startFight(sim: Sim): void {
  for (const rule of sim.fight.def.spawns) {
    switch (rule.kind) {
      case 'batch':
      case 'boss':
        scheduleCall(sim, rule.atMs, rule)
        break
      case 'carriers':
        scheduleCarriers(sim, rule)
        break
      case 'stream':
      case 'knobs':
        break
    }
  }
}

function scheduleCarriers(sim: Sim, rule: CarrierRule): void {
  const carriers = rollCarriers(sim.mapId, rule.buff, rule.debuff, () => sim.rng.next())
  carriers.forEach((pickup, i) => {
    scheduleCarrier(sim, rule.atMs + (rule.spanMs * i) / carriers.length, pickup)
  })
}

/** 一队敌人登场：打出横幅，按此刻的强度排好每一只 */
export function callSquad(sim: Sim, squad: Squad, banner?: Banner): void {
  if (sim.over) return
  if (banner) sim.out.banners.push(banner)
  const hpMul = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  const spread = squad.spreadMs ?? 0
  for (let i = 0; i < squad.count; i++) {
    scheduleOrder(sim, sim.elapsedMs + (i * spread) / squad.count, hpMul, i < (squad.elites ?? 0), squad.eliteChance ?? 0)
  }
}

/** 这张图的头目登场：打出横幅，有时限就提醒撑过它也行 */
export function callBoss(sim: Sim): void {
  if (sim.over) return
  const limit = timeLimitMs(sim.fight.def)
  const sub = MAPS[sim.mapId].finalWaveSub ?? (limit === undefined ? '击败它！' : `击败它，或撑过 ${Math.round(limit / 1000)} 秒！`)
  sim.out.banners.push({ title: `${bossFor(sim.mapId).name}出现`, sub })
  spawnBoss(sim)
}

function spawnIntervalScale(sim: Sim): number {
  const dn = dayNightOf(sim)
  return dn ? (isDayAt(dn.hour) ? dn.cfg.daySpawnScale : dn.cfg.nightSpawnScale) : 1
}

/** 连续刷怪：间隔随进度缩短，人越多刷得越快，昼夜图按时辰；场上满了就这一轮不刷 */
export function runStream(sim: Sim, st: StreamState, deltaMs: number): void {
  st.cooldownMs -= deltaMs
  if (st.cooldownMs > 0) return
  const wave = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000)
  const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * sim.characters.length
  st.cooldownMs = (wave.spawnIntervalMs * (st.rule.intervalMul ?? 1) * spawnIntervalScale(sim)) / (teamFactor * sim.foes.count)
  if (foeCount(sim) + telegraphCount(sim) >= SPAWN.maxAlive) return
  telegraphOne(sim, wave.hpMultiplier, false, st.rule.eliteChance ?? 0)
}
