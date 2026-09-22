import { MAPS } from '../data/maps'
import type { MapId } from '../types/maps'

// 键字符串是对外契约（e2e 断言 __warmoji.scene、BGM 按键挂载），不得改动

export const ARENA_SCENE_KEYS = [
  'arena',
  'arenaInfinite',
  'arenaRiver',
  'arenaVoid',
  'arenaRuins',
  'arenaDayNight',
  'arenaSpace',
  'arenaIce',
] as const
export type ArenaSceneKey = (typeof ARENA_SCENE_KEYS)[number]

export function arenaSceneFor(id: MapId): ArenaSceneKey {
  const kind = MAPS[id].kind
  if (kind === 'infinite') return 'arenaInfinite'
  if (kind === 'river') return 'arenaRiver'
  if (kind === 'void') return 'arenaVoid'
  if (kind === 'ruins') return 'arenaRuins'
  if (kind === 'daynight') return 'arenaDayNight'
  if (kind === 'space') return 'arenaSpace'
  if (kind === 'ice') return 'arenaIce'
  return 'arena'
}
