import { query } from 'bitecs'
import { describe, expect, it } from 'vitest'
import { CAPTAINS, PICKABLE_CAPTAIN_IDS } from '../data/captains'
import { ROSTER_IDS } from '../data/characters'
import { MAP, MAPS, MAP_IDS } from '../data/maps'
import { isBossWave, isEliteWave, waveDurationMs } from '../data/waves'
import { beginRun, tickSkillCd } from '../run/state'
import { INVINCIBLE_HP } from '../run/sandbox'
import { UNIT } from '../util/units'
import { CharHp, Transform } from './components'
import { spawnBossEcs, spawnSurgeEcs } from './entities/enemy'
import { armCaptain, armTeam } from './entities/loadout'
import { scheduleCarrier } from './entities/schedule'
import { initialLayout, makeSim, worldTimeScale } from './sim'
import { resetEntityStorage } from './storage'
import { requestCast } from './systems/shared/ability'
import { replayDeath } from './systems/shared/death'
import { settleWave } from './systems/shared/wave'
import { stepFrame } from './systems/pipeline/frame'
import { rollWaveCarriers } from './utils/battleFx'
import { centerX, centerY } from './utils/team'
import { makeWorld } from './world'
import type { FrameIndex } from './frames'
import type { CaptainId } from '../types/captains'
import type { CharacterId } from '../types/characters'
import type { ItemId } from '../types/items'
import type { MapId } from '../types/maps'

// 守卫：各地图的精英波与终波里，任何一帧抛错（战斗冻结）、坐标变 NaN（实体消失）或某个角色的能力没接进帧流程（零输出），都不会自行暴露

const frames: FrameIndex = { index: () => 0, clip: () => ({ base: 0, frames: 0 }) }
const VIEW = { w: 1280, h: 720 }

/** 同 views.ts 各视图的 layout() */
function layout(mapId: MapId): { w: number; h: number; x: number; y: number } {
  const def = MAPS[mapId]
  const w = (def.size?.w ?? MAP.width) * UNIT
  const h = (def.size?.h ?? MAP.height) * UNIT
  if (def.kind === 'ice') {
    const s = def.ice!.floeU * UNIT
    return { w: s, h: s, x: s / 2, y: s / 2 }
  }
  if (def.kind === 'infinite' || def.kind === 'space') return { w, h, x: 0, y: 0 }
  if (def.kind === 'river') {
    const s = def.river!.viewScale
    return { w: VIEW.w * s, h: VIEW.h * s, x: (VIEW.w * s) / 2, y: (VIEW.h * s) / 2 }
  }
  if (def.kind === 'void') {
    const t = def.torus!
    return { w: t.arenaLong * UNIT, h: t.arenaShort * UNIT, x: (t.arenaLong * UNIT) / 2, y: (t.arenaShort * UNIT) / 2 }
  }
  return { w, h, x: w / 2, y: h / 2 }
}

/** 同 EcsBattleScene 的 boot 与 update，去掉视图与 HUD；队伍无敌、绕圈走、技能就绪即放；返回各槽位造成的伤害 */
function play(mapId: MapId, wave: number, captain: CaptainId, roster: CharacterId[], gems: number): number[] {
  const run = beginRun(captain, roster, mapId)
  run.wave = wave
  run.memberItems = roster.map(() => Array<ItemId>(gems).fill('gemHeart'))
  const world = makeWorld()
  resetEntityStorage()
  const l = layout(mapId)
  const sim = makeSim(world, frames as never, run, false, { x: l.x, y: l.y }, l.w, l.h, true)
  initialLayout(sim)
  sim.hooks.onStart(sim)
  sim.onDeathFx = (d) => replayDeath(sim, d)
  armTeam(sim, run, false)
  armCaptain(sim, run)
  for (const m of sim.characters) CharHp.max[m] = CharHp.hp[m] = INVINCIBLE_HP
  const dur = waveDurationMs(wave)
  const carriers = rollWaveCarriers(mapId, wave, isBossWave(wave), () => sim.rng.next())
  carriers.forEach((p, i) => scheduleCarrier(sim, dur * 0.12 + (dur * 0.7 * i) / carriers.length, p))
  if (isBossWave(wave)) sim.hooks.onFinalWave(sim)
  let surge = isEliteWave(wave)
  let boss = isBossWave(wave)
  const dt = 1000 / 60
  for (let f = 0; sim.elapsedMs < Math.min(dur, 30_000); f++) {
    sim.dtMs = dt
    sim.wdtMs = dt * worldTimeScale(sim)
    run.skillCdMs = tickSkillCd(run.skillCdMs, dt)
    if (run.skillCdMs <= 0) {
      run.skillCdMs = CAPTAINS[captain].skill.cdMs
      requestCast(sim, sim.captain)
    }
    sim.teamDir = { x: Math.cos(f / 120), y: Math.sin(f / 120) }
    sim.moveInputRaw = 1
    sim.view.x = centerX(sim) - VIEW.w / 2
    sim.view.y = centerY(sim) - VIEW.h / 2
    sim.view.right = sim.view.x + VIEW.w
    sim.view.bottom = sim.view.y + VIEW.h
    stepFrame(sim)
    if (surge && sim.fxMs >= 600) {
      surge = false
      spawnSurgeEcs(sim)
    }
    if (boss && sim.fxMs >= 600) {
      boss = false
      spawnBossEcs(sim)
    }
    sim.out.bursts.length = 0
    sim.out.collects.length = 0
    sim.out.flash = null
    if (f % 60 === 0) {
      const lost = query(world, [Transform]).filter((e) => !Number.isFinite(Transform.x[e]! + Transform.y[e]!))
      expect(lost, `${mapId} 第 ${wave} 波 ${Math.round(sim.elapsedMs)}ms：坐标为 NaN 的实体`).toEqual([])
    }
  }
  settleWave(sim)
  return run.stats.damage
}

// 16 局 × 3 人轮遍全部角色；1 级雪人只减速不伤害，只用 2、3 级（8、32 颗生命宝石）
describe.each(MAP_IDS.map((id, i) => [id, i] as const))('%s', (mapId, i) => {
  it.each([10, 18])('第 %i 波跑满不抛错，每个角色都有伤害', (wave) => {
    const k = i * 2 + (wave === 18 ? 1 : 0)
    const roster = [0, 1, 2].map((j) => ROSTER_IDS[(k * 3 + j) % ROSTER_IDS.length]!)
    const captain = PICKABLE_CAPTAIN_IDS[k % PICKABLE_CAPTAIN_IDS.length]!
    const damage = play(mapId, wave, captain, roster, wave === 18 ? 32 : 8)
    expect(roster.filter((_, slot) => !(damage[slot]! > 0)), `${captain} 队：零输出的角色`).toEqual([])
  })
})
