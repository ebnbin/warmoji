import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { SPAWN } from '../../data/enemies'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import { centered, FRAME_MID } from '../frame'
import type { VolcanoConfig } from '../../types/maps'
import { around, fumaroles, makeField, moltenAt, NO_SPILL, spillOf, spillVolume, stepLava, VENT_COUNT, volcanoMarks } from './model'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import type { VolcanoState } from './model'
import { Alive, ENEMY_SET, Radius, Transform } from '../../ecs/components'
import { hit } from '../../ecs/systems/shared/damage'
import { hazardSource } from '../../ecs/utils/source'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'
import { grounded } from '../../ecs/utils/pass'
import { solidOf, solidsTrace, wallsOf } from '../../ecs/worlds/solids'
import { bounded, wanderIn } from '../../ecs/worlds/hooks'
import { mapEvent } from '../../ecs/fight/events'
import type { WorldHooks } from '../../ecs/worlds/hooks'

function volcanoCfg(sim: Sim): VolcanoConfig {
  return MAPS[sim.mapId].volcano!
}

/** 火山的地形由布景种子定下，视图从这里读；喷发的时刻与熔岩往哪几股漫出由对局的随机数决定 */
function volcanoOf(sim: Sim): VolcanoState {
  let s = sim.worldState.volcano
  if (!s) {
    const cfg = volcanoCfg(sim)
    const size = MAPS[sim.mapId].size!
    const field = makeField(new Rng(sim.run.decorSeed ^ 0x7a1c), cfg, centered(size.w, size.h), FRAME_MID)
    const vents = fumaroles(field, cfg, VENT_COUNT)
    s = { field, solids: wallsOf(field.basin, 'rock'), vents, marks: volcanoMarks(field, cfg, vents), phase: 'dormant', since: 0, nextAt: cfg.eruption.firstMs, spill: NO_SPILL, count: 0, stepAcc: 0, hurtAt: cfg.lava.tickMs }
    sim.worldState.volcano = s
  }
  return s
}

/** 山体最远伸到离火山口多远，像素 */
function mountainPx(sim: Sim): number {
  const c = volcanoCfg(sim).cone
  return c.blockU * (1 + c.blockJitter) * UNIT
}

const LAVA_TINT = 0xff6d00

/** 喷发的节奏：到点先起预兆并定下熔岩往哪几股漫出，预兆完了熔岩漫过口沿，流量先涨后落，出完回到平静 */
function tickEruption(sim: Sim, s: VolcanoState, cfg: VolcanoConfig): void {
  const e = cfg.eruption
  const now = sim.elapsedMs
  if (s.phase === 'dormant' && now >= s.nextAt) {
    s.spill = spillOf(s.field, cfg, sim.rng)
    s.phase = 'warn'
    s.since = now
    s.nextAt = now + e.intervalMs + (sim.rng.next() * 2 - 1) * e.intervalJitterMs
  } else if (s.phase === 'warn' && now >= s.since + e.warnMs) {
    s.phase = 'erupt'
    s.since = now
    s.count++
    mapEvent(sim, 'erupt')
  } else if (s.phase === 'erupt' && now >= s.since + e.effuseMs) {
    s.phase = 'dormant'
    s.since = now
  }
}

/** 脚下的熔岩没凝固就挨烫：脚不沾地的不烫 */
function burnOnLava(sim: Sim, s: VolcanoState, cfg: VolcanoConfig): void {
  const now = sim.elapsedMs
  if (now < s.hurtAt) return
  s.hurtAt = now + cfg.lava.tickMs
  const frac = cfg.lava.tickMs / 1000
  const src = hazardSource('lava', LAVA_TINT)
  const onLava = (eid: number): boolean => grounded(sim.world, eid) && moltenAt(s.field, Transform.x[eid]!, Transform.y[eid]!)
  const dmg = Math.round(cfg.lava.teamDps * frac)
  for (const m of sim.characters) if (Alive.v[m] && onLava(m)) hit(sim, src, m, dmg, { tick: true })
  const edmg = Math.round(cfg.lava.enemyDps * frac)
  for (const eid of [...query(sim.world, ENEMY_SET)]) if (onLava(eid)) hit(sim, src, eid, edmg, { tick: true })
}

/** 刷怪点落在盆地里、离岩壁至少一格，避开熔岩 */
function clearGround(sim: Sim, p: Point): boolean {
  const f = volcanoOf(sim).field
  return roomAt(f.basin, p.x, p.y) >= UNIT && !moltenAt(f, p.x, p.y)
}

/**
 * 火山：能走的是崖壁围着的盆地，岩壁与山体是硬边界，身体走到跟前就停住、顺着壁面滑；火山定期喷发，
 * 熔岩按地势往四面八方流、离火山口越远凉得越快，盖住的地方敌我都受伤
 */
export const volcano: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, _from, next) {
    return keepOut(volcanoOf(sim).field.basin, next.x, next.y, Radius.v[eid]!)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(volcanoOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(volcanoOf(sim).solids, x, y)
  },
  basin(sim) {
    return volcanoOf(sim).field.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const f = volcanoOf(sim).field
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const rad = Radius.v[eid]!
    const d = around(f, mountainPx(sim) + rad + 0.3 * UNIT, x, y, tx, ty)
    return alongWall(f.basin, x, y, d.x, d.y, rad + 0.3 * UNIT)
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(volcanoOf(sim).field.basin, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    return alongWall(volcanoOf(sim).field.basin, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  spawnPoint(sim, boss) {
    let p = bounded.spawnPoint(sim, boss)
    for (let i = 0; i < 24 && !clearGround(sim, p); i++) p = bounded.spawnPoint(sim, boss)
    return keepOut(volcanoOf(sim).field.basin, p.x, p.y, UNIT)
  },
  settle(sim, p) {
    return keepOut(volcanoOf(sim).field.basin, p.x, p.y, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    const f = volcanoOf(sim).field
    return roomFor(f.basin, x, y, radius) && !moltenAt(f, x, y)
  },
  /** 关卡要它喷发：平静时立刻起预兆，正在喷发的这一次出完立刻再起预兆，已经在预兆的照旧 */
  cue(sim, c) {
    const s = volcanoOf(sim)
    if (c === 'erupt' && s.phase !== 'warn') s.nextAt = sim.elapsedMs
  },
  /** 火山口只在喷发时抛出东西 */
  landmarks(sim) {
    const s = volcanoOf(sim)
    return s.phase === 'erupt' ? s.marks.erupt : s.marks.calm
  },
  onStart(sim) {
    volcanoOf(sim)
  },
  tick(sim, delta) {
    const cfg = volcanoCfg(sim)
    const s = volcanoOf(sim)
    tickEruption(sim, s, cfg)
    const step = cfg.lava.stepMs
    s.stepAcc = Math.min(s.stepAcc + delta, step * 4)
    while (s.stepAcc >= step) {
      s.stepAcc -= step
      const now = sim.elapsedMs - s.stepAcc
      const erupting = s.phase === 'erupt'
      stepLava(s.field, cfg.lava, step / 1000, now, erupting ? s.spill : NO_SPILL, erupting ? spillVolume(cfg, now - s.since) : 0)
    }
    burnOnLava(sim, s, cfg)
  },
}
