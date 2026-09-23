import { expect, it } from 'vitest'
import { Dormant, Nest, Transform } from '../components'
import { enemyDef } from '../store'
import { resetEntityStorage } from '../storage'
import { INITIAL_CAPACITY, makeWorld } from '../world'
import { newEntity } from './entity'
import type { EnemyDef } from '../../types/enemies'

// 守卫：组件数组定长时，eid 越过容量后的写入被静默丢弃、读出 undefined，曾致整局抛错

it('eid 越过初始容量后写入照常读回，重置后容量复原', () => {
  resetEntityStorage()
  const world = makeWorld()
  let eid = 0
  while (eid < INITIAL_CAPACITY * 4) eid = newEntity(world)
  Transform.x[eid] = 12.5
  Dormant.v[eid] = 1
  const def = {} as EnemyDef
  enemyDef[eid] = def
  expect(Transform.x[eid]).toBe(12.5)
  expect(Dormant.v[eid]).toBe(1)
  expect(Nest.of[eid]).toBe(-1)
  expect(enemyDef[eid]).toBe(def)
  resetEntityStorage()
  expect(Transform.x.length).toBe(INITIAL_CAPACITY)
  expect(enemyDef.length).toBe(INITIAL_CAPACITY)
  expect(enemyDef[eid]).toBeUndefined()
})
