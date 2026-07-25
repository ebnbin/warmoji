import { describe, expect, it } from 'vitest'
import { ARENA_SCENE_KEYS, arenaSceneFor } from './keys'

describe('arcade 场景路由', () => {
  it('arenaSceneFor：按形态路由竞技场场景', () => {
    expect(arenaSceneFor('forest')).toBe('arena')
    expect(arenaSceneFor('desert')).toBe('arenaInfinite')
    expect(arenaSceneFor('river')).toBe('arenaRiver')
    expect(arenaSceneFor('void')).toBe('arenaVoid')
    expect(arenaSceneFor('ruins')).toBe('arenaRuins')
    expect(arenaSceneFor('daynight')).toBe('arenaDayNight')
    expect(arenaSceneFor('space')).toBe('arenaSpace')
  })

  it('每种世界形态都有对应场景键', () => {
    expect(new Set(ARENA_SCENE_KEYS).size).toBe(ARENA_SCENE_KEYS.length)
  })
})
