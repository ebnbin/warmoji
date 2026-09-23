import { removeEntity } from 'bitecs'
import { expect, it } from 'vitest'
import { Uid } from '../components'
import { spawnEnemy } from '../entities/enemy'
import { ENEMY_DEFS } from '../../data/enemies'
import { toPx } from '../../data/px'
import { resetEntityStorage } from '../storage'
import { makeWorld } from '../world'
import { worldFor } from '../worlds/hooks'
import { isSameEntity } from './identity'
import { Rng } from '../../util/rng'
import type { Sim } from '../sim'

// 守卫：eid 被新实体复用后，记下的旧目标被认成新实体——金币雨隔空打到别的敌人、新敌人对贯穿弹免疫

it('eid 复用后 (eid, uid) 不再认作同一实体', () => {
  resetEntityStorage()
  const world = makeWorld()
  const frames = { index: () => 0, clip: () => ({ base: 0, frames: 0 }) }
  const sim = { world, hooks: worldFor('forest'), mapW: 1600, mapH: 1600, rng: new Rng(1), elapsedMs: 0, frames } as unknown as Sim
  const def = toPx(ENEMY_DEFS[0]!)
  const a = spawnEnemy(sim, frames, def, 100, 100, 10, false, false)
  const aUid = Uid.v[a]!
  expect(isSameEntity(world, a, aUid)).toBe(true)
  removeEntity(world, a)
  expect(isSameEntity(world, a, aUid)).toBe(false)
  const b = spawnEnemy(sim, frames, def, 900, 900, 10, false, false)
  expect(b).toBe(a)
  expect(Uid.v[b]).not.toBe(aUid)
  expect(isSameEntity(world, a, aUid)).toBe(false)
})
