import { $internal } from 'bitecs'
import type { InternalWorld } from 'bitecs'
import { expect, it } from 'vitest'
import { MAP, MAPS } from '../data/maps'
import { applySandboxPreset, sandboxCaptain, sandboxStarters } from '../run/sandbox'
import { beginRun } from '../run/state'
import { UNIT } from '../util/units'
import { armCaptain, armTeam } from './entities/loadout'
import { scheduleSurge } from './entities/schedule'
import { initialLayout, makeSim, worldTimeScale } from './sim'
import { clearEcsStore } from './store'
import { stepFrame } from './systems/pipeline/frame'
import { replayDeath } from './systems/shared/death'
import { ENTITY_BUDGET, makeWorld, MAX_ENTITIES } from './world'
import type { EcsAtlas } from './atlas'

// 守卫：无限类地图上休眠敌人不计刷怪上限、金币与敌弹不回收，实体数越过 MAX_ENTITIES 后组件数组静默写丢，
// 越界 eid 落到带能力的敌人时整局抛错

const atlas = { index: () => 0, clip: () => ({ base: -1, frames: 0 }) } as unknown as EcsAtlas

it('k8 下实体数顶到预算线后，eid 不越过 MAX_ENTITIES', () => {
  applySandboxPreset('k8')
  const run = beginRun(sandboxCaptain(), sandboxStarters(), 'desert', true)
  const world = makeWorld()
  clearEcsStore()
  const w = (MAPS.desert.size?.w ?? MAP.width) * UNIT
  const h = (MAPS.desert.size?.h ?? MAP.height) * UNIT
  const sim = makeSim(world, atlas, run, true, { x: 0, y: 0 }, w, h)
  initialLayout(sim)
  sim.hooks.onStart(sim)
  sim.onDeathFx = (d) => replayDeath(sim, d)
  armTeam(sim, run, true)
  armCaptain(sim, run)
  // 永不到点的占位实体先占掉大半预算，几百帧内就能顶到预算线
  for (let i = 0; i < ENTITY_BUDGET - 3000; i++) scheduleSurge(sim, Infinity, 1, false)
  sim.view = { x: -640, y: -360, right: 640, bottom: 360 }
  for (let f = 0; f < 300; f++) {
    sim.dtMs = 1000 / 60
    sim.wdtMs = sim.dtMs * worldTimeScale(sim)
    stepFrame(sim)
    sim.out.bursts.length = 0
    sim.out.collects.length = 0
    sim.out.flash = null
  }
  expect((world as InternalWorld)[$internal].entityIndex.maxId).toBeLessThan(MAX_ENTITIES)
}, 60_000)
