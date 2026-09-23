import { removeEntity } from 'bitecs'
import { describe, expect, it } from 'vitest'
import { Radius, Transform } from '../components'
import { spawnEnemy } from '../entities/enemy'
import { ENEMY_DEFS } from '../../data/enemies'
import { toPx } from '../../data/px'
import { resetEntityStorage } from '../storage'
import { makeWorld } from '../world'
import { worldFor } from '../worlds/hooks'
import { boltSource } from './source'
import { nearestTarget, targetsNear } from './targets'
import { Rng } from '../../util/rng'
import type { Sim } from '../sim'

function arena(mapId: 'void' | 'forest', w: number, h: number, n: number, seed: number): { sim: Sim; eids: number[] } {
  resetEntityStorage()
  const world = makeWorld()
  const rng = new Rng(seed)
  const frames = { index: () => 0, clip: () => ({ base: 0, frames: 0 }) }
  const sim = { world, mapW: w, mapH: h, hooks: worldFor(mapId), characterTargets: [], rng, elapsedMs: 0, frames } as unknown as Sim
  const def = toPx(ENEMY_DEFS[0]!)
  const eids: number[] = []
  for (let i = 0; i < n; i++) {
    const eid = spawnEnemy(sim, frames, def, 0, 0, 10, false, false)
    // 一半贴着接缝放
    const edge = i % 2 === 0
    Transform.x[eid] = edge ? (rng.next() < 0.5 ? rng.next() * 40 : w - rng.next() * 40) : rng.next() * w
    Transform.y[eid] = edge ? (rng.next() < 0.5 ? rng.next() * 40 : h - rng.next() * 40) : rng.next() * h
    Radius.v[eid] = 10 + rng.next() * 30
    eids.push(eid)
  }
  return { sim, eids }
}

describe('我方索敌现查', () => {
  // 守卫：环面接缝附近按观察点取像时漏掉次近像，技能静默打不中贴缝的敌人
  it('环面上与暴力枚举全部镜像的结果一致', () => {
    const W = 1536
    const H = 864
    const { sim, eids } = arena('void', W, H, 300, 7)
    const src = boltSource(-1)
    const rng = new Rng(99)
    for (let q = 0; q < 200; q++) {
      const cx = rng.next() < 0.5 ? rng.next() * W : (rng.next() < 0.5 ? -60 : W + 60)
      const cy = rng.next() * H
      const reach = 20 + rng.next() * 760
      const expected: string[] = []
      let best: { eid: number; d: number } | null = null
      for (const eid of eids) {
        for (const kx of [-1, 0, 1]) {
          for (const ky of [-1, 0, 1]) {
            const x = Transform.x[eid]! + kx * W
            const y = Transform.y[eid]! + ky * H
            const d2 = (x - cx) ** 2 + (y - cy) ** 2
            const rr = reach + Radius.v[eid]!
            if (d2 <= rr * rr) expected.push(`${eid}:${x.toFixed(3)}:${y.toFixed(3)}`)
            if (d2 < reach * reach && (!best || d2 < best.d)) best = { eid, d: d2 }
          }
        }
      }
      const got = targetsNear(sim, src, cx, cy, reach).map((t) => `${t.eid}:${t.x.toFixed(3)}:${t.y.toFixed(3)}`)
      expect(got.sort()).toEqual(expected.sort())
      const near = nearestTarget(sim, src, cx, cy, reach)
      if (!best) expect(near).toBeNull()
      else expect((near!.x - cx) ** 2 + (near!.y - cy) ** 2).toBeCloseTo(best.d, 3)
    }
  })

  // 守卫：本帧已被删除的敌人仍被选为目标，伤害被吞而冷却照扣
  it('已删除的敌人立即不再被索敌', () => {
    const { sim, eids } = arena('forest', 1600, 1600, 50, 3)
    const src = boltSource(-1)
    const victim = eids[10]!
    removeEntity(sim.world, victim)
    const x = Transform.x[victim]!
    const y = Transform.y[victim]!
    expect(targetsNear(sim, src, x, y, 5000).some((t) => t.eid === victim)).toBe(false)
    expect(nearestTarget(sim, src, x, y, 5000)?.eid).not.toBe(victim)
  })
})
