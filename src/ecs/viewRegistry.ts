import { MAPS } from '../data/maps'
import type { MapDef, MapId } from '../types/maps'
import { BoundedView, DayNightView, IceView, NebulaOldView, OldRiverView, OldRuinsView, SpaceView, TorusView } from './views'
import type { MapView } from './views'
import { AmethystView } from '../maps/amethyst/view'
import { DesertView } from '../maps/desert/view'
import { FloeView } from '../maps/floe/view'
import { MeadowView } from '../maps/meadow/view'
import { NebulaView } from '../maps/nebula/view'
import { PetriView } from '../maps/petri/view'
import { WarpView } from '../maps/warp/view'
import { RuinsView } from '../maps/ruins/view'
import { SakuraView } from '../maps/sakura/view'
import { VolcanoView } from '../maps/volcano/view'
import { DeepView } from '../maps/deep/view'
import { TheaterView } from '../maps/theater/view'

export function viewFor(mapId: MapId): MapView {
  return MAKE[MAPS[mapId].kind]()
}

const MAKE: Record<MapDef['kind'], () => MapView> = {
  bounded: () => new BoundedView(),
  daynight: () => new DayNightView(),
  oldRuins: () => new OldRuinsView(),
  ruins: () => new RuinsView(),
  ice: () => new IceView(),
  oldRiver: () => new OldRiverView(),
  void: () => new TorusView(),
  space: () => new SpaceView(),
  nebulaOld: () => new NebulaOldView(),
  nebula: () => new NebulaView(),
  volcano: () => new VolcanoView(),
  floe: () => new FloeView(),
  amethyst: () => new AmethystView(),
  meadow: () => new MeadowView(),
  sakura: () => new SakuraView(),
  desert: () => new DesertView(),
  deep: () => new DeepView(),
  petri: () => new PetriView(),
  warp: () => new WarpView(),
  theater: () => new TheaterView(),
}
