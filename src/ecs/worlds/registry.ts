import { MAPS } from '../../data/maps'
import type { MapDef, MapId } from '../../types/maps'
import { bounded, ice, nebulaOld, oldRiver, oldRuins, space, torus } from './hooks'
import type { WorldHooks } from './hooks'
import { withBuilt } from './built'
import { canyon } from '../../maps/canyon/world'
import { cave } from '../../maps/cave/world'
import { circuit } from '../../maps/circuit/world'
import { desert } from '../../maps/desert/world'
import { dreamland } from '../../maps/dreamland/world'
import { floe } from '../../maps/floe/world'
import { meadow } from '../../maps/meadow/world'
import { nexus } from '../../maps/nexus/world'
import { nebula } from '../../maps/nebula/world'
import { petri } from '../../maps/petri/world'
import { ruins } from '../../maps/ruins/world'
import { sakura } from '../../maps/sakura/world'
import { maple } from '../../maps/maple/world'
import { ship } from '../../maps/ship/world'
import { volcano } from '../../maps/volcano/world'
import { deep } from '../../maps/deep/world'

const BY_KIND: Record<MapDef['kind'], WorldHooks> = {
  bounded,
  daynight: bounded,
  oldRuins,
  ruins,
  ice,
  oldRiver,
  void: torus,
  space,
  nebulaOld,
  nebula,
  volcano,
  ship,
  floe,
  cave,
  meadow,
  sakura,
  maple,
  desert,
  circuit,
  deep,
  nexus,
  petri,
  dreamland,
  canyon,
}

const BUILT = new Map<WorldHooks, WorldHooks>()

/** 地图的规则，叠上能力造出的地形 */
export function worldFor(mapId: MapId): WorldHooks {
  const def = MAPS[mapId]
  const base = def.ice ? ice : def.walls ? oldRuins : BY_KIND[def.kind]!
  let hooks = BUILT.get(base)
  if (!hooks) {
    hooks = withBuilt(base)
    BUILT.set(base, hooks)
  }
  return hooks
}
