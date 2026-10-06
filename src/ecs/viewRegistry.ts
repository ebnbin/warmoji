import { MAPS } from '../data/maps'
import type { MapDef, MapId } from '../types/maps'
import { BoundedView, DayNightView, IceView, NebulaOldView, OldRiverView, OldRuinsView, SpaceView, TorusView } from './views'
import type { MapView } from './views'
import { CaveView } from '../maps/cave/view'
import { CircuitView } from '../maps/circuit/view'
import { DesertView } from '../maps/desert/view'
import { DreamlandView } from '../maps/dreamland/view'
import { FloeView } from '../maps/floe/view'
import { MeadowView } from '../maps/meadow/view'
import { NebulaView } from '../maps/nebula/view'
import { NexusView } from '../maps/nexus/view'
import { PetriView } from '../maps/petri/view'
import { RuinsView } from '../maps/ruins/view'
import { SakuraView } from '../maps/sakura/view'
import { MapleView } from '../maps/maple/view'
import { ShipView } from '../maps/ship/view'
import { VolcanoView } from '../maps/volcano/view'
import { DeepView } from '../maps/deep/view'
import { WonderlandView } from '../maps/wonderland/view'

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
  ship: () => new ShipView(),
  floe: () => new FloeView(),
  cave: () => new CaveView(),
  meadow: () => new MeadowView(),
  sakura: () => new SakuraView(),
  maple: () => new MapleView(),
  desert: () => new DesertView(),
  circuit: () => new CircuitView(),
  deep: () => new DeepView(),
  nexus: () => new NexusView(),
  petri: () => new PetriView(),
  dreamland: () => new DreamlandView(),
  wonderland: () => new WonderlandView(),
}
