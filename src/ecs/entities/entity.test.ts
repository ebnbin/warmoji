import { expect, it } from 'vitest'
import { removeEntity } from 'bitecs'
import { DanceWindow, Dormant, Nest, Transform } from '../components'
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

// 守卫：新实体读到同一 eid 上一任留下的组件值，曾致蹦迪窗口串到下一波、角色继承敌人的休眠整局不出手

it('新实体不带同一 eid 上一任的值：同 world 回收与新 world 重发都一样', () => {
  const dirty = (eid: number): void => {
    DanceWindow.until[eid] = 5000
    Dormant.v[eid] = 1
    Nest.of[eid] = 7
    enemyDef[eid] = {} as EnemyDef
  }
  const expectClean = (eid: number): void => {
    expect(DanceWindow.until[eid]).toBe(0)
    expect(Dormant.v[eid]).toBe(0)
    expect(Nest.of[eid]).toBe(-1)
    expect(enemyDef[eid]).toBeUndefined()
  }
  resetEntityStorage()
  const world = makeWorld()
  const first = newEntity(world)
  dirty(first)
  removeEntity(world, first)
  const recycled = newEntity(world)
  expect(recycled).toBe(first)
  expectClean(recycled)

  dirty(recycled)
  resetEntityStorage()
  const reissued = newEntity(makeWorld())
  expect(reissued).toBe(first)
  expectClean(reissued)
})
