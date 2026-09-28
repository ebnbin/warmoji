import { ENEMIES, SPAWN } from '../../data/enemies'
import { bossFor, MAPS } from '../../data/maps'
import { waveAt } from '../../data/waves'
import type { Banner, CarrierRule, Squad } from '../../types/runs'
import { dayNightOf, foeCount, spawnBoss, telegraphOne } from '../entities/enemy'
import { scheduleCall, scheduleCarrier, scheduleOrder } from '../entities/schedule'
import { telegraphCount } from '../entities/telegraph'
import { rollCarriers } from '../utils/battleFx'
import { isDayAt } from '../worlds/daynight'
import type { Sim } from '../sim'
import { calm } from './state'
import type { StreamState, WavesState } from './state'

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
      case 'waves':
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

/** 一队敌人登场：打出横幅，按此刻的强度排好每一只；指定的头目血量不随进度涨，围圈的一队随机转一个起始角 */
export function callSquad(sim: Sim, squad: Squad, banner?: Banner): void {
  if (sim.over) return
  if (banner) sim.out.banners.push(banner)
  const raw = squad.enemy ? ENEMIES[squad.enemy] : undefined
  const enemy = raw && squad.drive ? { ...raw, drive: squad.drive } : raw
  const clock = raw?.role === 'boss' ? 1 : waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  const hpMul = squad.hpMul === undefined ? clock : clock * squad.hpMul
  const phase = squad.at?.kind === 'ring' ? sim.rng.next() * Math.PI * 2 : 0
  const spread = squad.spreadMs ?? 0
  for (let i = 0; i < squad.count; i++) {
    scheduleOrder(sim, sim.elapsedMs + (i * spread) / squad.count, {
      hpMul,
      elite: i < (squad.elites ?? 0),
      chance: squad.eliteChance ?? 0,
      enemy,
      at: squad.at,
      index: i,
      count: squad.count,
      phase,
      bounty: squad.bounty,
    })
  }
}

/** 这张图的头目登场：打出横幅，写明怎么过这一场 */
export function callBoss(sim: Sim): void {
  if (sim.over) return
  const time = sim.fight.def.ends.find((e) => e.kind === 'time')
  const sec = time?.kind === 'time' ? Math.round(time.ms / 1000) : 0
  const told = time?.kind !== 'time' ? '击败它！' : time.lose ? `${sec} 秒内击败它！` : `击败它，或撑过 ${sec} 秒！`
  sim.out.banners.push({ title: `${bossFor(sim.mapId).name}出现`, sub: MAPS[sim.mapId].finalWaveSub ?? told })
  spawnBoss(sim)
}

function spawnIntervalScale(sim: Sim): number {
  const dn = dayNightOf(sim)
  return dn ? (isDayAt(dn.hour) ? dn.cfg.daySpawnScale : dn.cfg.nightSpawnScale) : 1
}

/** 连续刷怪：间隔不固定时随进度缩短、人越多刷得越快、昼夜图按时辰；只在自己的时段里刷，场上满了就这一轮不刷 */
export function runStream(sim: Sim, st: StreamState, deltaMs: number): void {
  const rule = st.rule
  if (sim.elapsedMs < (rule.fromMs ?? 0) || sim.elapsedMs >= (rule.untilMs ?? Infinity)) return
  st.cooldownMs -= deltaMs
  if (st.cooldownMs > 0) return
  const wave = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000)
  const mul = rule.intervalMul ?? 1
  if (rule.intervalMs !== undefined) {
    st.cooldownMs = (rule.intervalMs * mul) / sim.foes.count
  } else {
    const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * sim.characters.length
    st.cooldownMs = (wave.spawnIntervalMs * mul * spawnIntervalScale(sim)) / (teamFactor * sim.foes.count)
  }
  if (foeCount(sim) + telegraphCount(sim) >= Math.min(rule.cap ?? Infinity, SPAWN.maxAlive)) return
  telegraphOne(sim, { hpMul: wave.hpMultiplier, chance: rule.eliteChance ?? 0, at: rule.at })
}

/** 一组一组来：第一组到点就来，之后等场上清空再隔一阵来下一组 */
export function runWaves(sim: Sim, w: WavesState): void {
  const r = w.rule
  if (w.next >= r.squads.length) return
  if (w.next === 0) {
    if (sim.elapsedMs < r.atMs) return
  } else {
    if (!calm(sim)) {
      w.calmAt = -1
      return
    }
    if (w.calmAt < 0) w.calmAt = sim.elapsedMs
    if (sim.elapsedMs - w.calmAt < r.gapMs) return
  }
  const sq = r.squads[w.next]!
  w.next++
  w.calmAt = -1
  callSquad(sim, sq, sq.banner)
}
