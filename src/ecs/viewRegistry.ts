import { MAPS } from '../data/maps'
import type { MapDef, MapId } from '../types/maps'
import type { MapView } from './views'
import { AmethystView } from '../maps/amethyst/view'
import { DesertView } from '../maps/desert/view'
import { FloeView } from '../maps/floe/view'
import { MeadowView } from '../maps/meadow/view'
import { NebulaView } from '../maps/nebula/view'
import { PetriView } from '../maps/petri/view'
import { ExitView } from '../maps/exit/view'
import { RuinsView } from '../maps/ruins/view'
import { SakuraView } from '../maps/sakura/view'
import { VolcanoView } from '../maps/volcano/view'
import { DeepView } from '../maps/deep/view'
import { TheaterView } from '../maps/theater/view'

export function viewFor(mapId: MapId): MapView {
  return MAKE[MAPS[mapId].kind]()
}

const MAKE: Record<MapDef['kind'], () => MapView> = {
  ruins: () => new RuinsView(),
  nebula: () => new NebulaView(),
  volcano: () => new VolcanoView(),
  floe: () => new FloeView(),
  amethyst: () => new AmethystView(),
  meadow: () => new MeadowView(),
  sakura: () => new SakuraView(),
  desert: () => new DesertView(),
  deep: () => new DeepView(),
  petri: () => new PetriView(),
  exit: () => new ExitView(),
  theater: () => new TheaterView(),
}
