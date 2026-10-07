import { ENEMIES, SPAWN } from '../../data/enemies'
import { bossFor, MAPS } from '../../data/maps'
import type { Banner, LegacySquad } from '../../types/runs'
import { foeCount, spawnBoss, telegraphOne } from '../entities/enemy'
import { scheduleOrder } from '../entities/schedule'
import { telegraphCount } from '../entities/telegraph'
import type { Sim } from '../sim'
import { clockWave, runCurve } from './clock'
import { calm, foeOf, phaseMs, phaseOf, squadSize } from './state'
import type { FoeSpec, StreamState, WavesState } from './state'

/** 一队敌人登场：打出横幅，按此刻的强度排好每一只，护卫排在后面、和这一队一起摆；指定的头目血量不随进度涨，围圈的一队随机转一个起始角 */
export function callSquad(sim: Sim, squad: LegacySquad, banner?: Banner): void {
  if (sim.over) return
  if (banner) sim.out.banners.push(banner)
  const main = foeOf(squad)
  const clock = clockWave(sim).hpMultiplier
  const hpMul = (main.enemy?.role === 'boss' ? 1 : clock) * (squad.hpMul ?? 1)
  const phase = squad.at?.kind === 'ring' ? sim.rng.next() * Math.PI * 2 : 0
  const spread = squad.spreadMs ?? 0
  const escort = squad.escort
  const total = squadSize(squad)
  for (let i = 0; i < total; i++) {
    const place = { at: squad.at, index: i, count: total, phase }
    const spec: FoeSpec =
      i < squad.count
        ? { ...main, ...place, hpMul, elite: i < (squad.elites ?? 0), bounty: squad.bounty }
        : { ...place, hpMul: clock * (squad.hpMul ?? 1), elite: escort!.elite, enemy: ENEMIES[escort!.enemy], stats: escort!.stats }
    scheduleOrder(sim, sim.elapsedMs + (i * spread) / total, spec)
  }
}

/** 这张图的头目登场：打出横幅，写明怎么过这一阶段 */
export function callBoss(sim: Sim): void {
  if (sim.over) return
  const time = phaseOf(sim.fight).ends.find((e) => e.kind === 'time')
  const sec = time?.kind === 'time' ? Math.round(time.ms / 1000) : 0
  const told = time?.kind !== 'time' ? '击败它！' : time.lose ? `${sec} 秒内击败它！` : `击败它，或撑过 ${sec} 秒！`
  sim.out.banners.push({ title: `${bossFor(sim.mapId).name}出现`, sub: MAPS[sim.mapId].finalWaveSub ?? told })
  spawnBoss(sim)
}

/** 这条连续刷怪此刻的间隔：写了就按它，从它开刷起匀速变到 ramp 的间隔；不写就按这一局的难度曲线随进度缩短、人越多刷得越快；敌人变多的效果都再除一道 */
export function streamInterval(sim: Sim, st: StreamState): number {
  const rule = st.rule
  const mul = rule.intervalMul ?? 1
  if (rule.intervalMs === undefined) {
    const curve = runCurve(sim)
    const teamFactor = curve.teamFactorBase + curve.teamFactorPerMember * sim.characters.length
    return (clockWave(sim).spawnIntervalMs * mul) / (teamFactor * sim.foes.count)
  }
  const ramp = rule.ramp
  const since = Math.max(0, phaseMs(sim) - (rule.fromMs ?? 0))
  const ms = ramp ? rule.intervalMs + (ramp.toMs - rule.intervalMs) * Math.min(1, since / ramp.overMs) : rule.intervalMs
  return (ms * mul) / sim.foes.count
}

/** 连续刷怪：只在自己的时段里刷、放满就停，场上满了就这一轮不刷 */
export function runStream(sim: Sim, st: StreamState, deltaMs: number): void {
  const rule = st.rule
  const t = phaseMs(sim)
  if (t < (rule.fromMs ?? 0) || t >= (rule.untilMs ?? Infinity) || st.spawned >= (rule.total ?? Infinity)) return
  st.cooldownMs -= deltaMs
  if (st.cooldownMs > 0) return
  st.cooldownMs = streamInterval(sim, st)
  if (foeCount(sim) + telegraphCount(sim) >= Math.min(rule.cap ?? Infinity, SPAWN.maxAlive)) return
  st.spawned++
  telegraphOne(sim, { ...st.foe, hpMul: clockWave(sim).hpMultiplier, at: rule.at })
}

/** 一组一组来：第一组到点就来，之后等场上清空再隔一阵来下一组 */
export function runWaves(sim: Sim, w: WavesState): void {
  const r = w.rule
  if (w.next >= r.squads.length) return
  if (w.next === 0) {
    if (phaseMs(sim) < r.atMs) return
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
