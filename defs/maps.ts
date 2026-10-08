import type { MapDef } from '../src/types/maps'
import meadow from './maps/meadow/map.ts'
import sakura from './maps/sakura/map.ts'
import desert from './maps/desert/map.ts'
import deep from './maps/deep/map.ts'
import ruins from './maps/ruins/map.ts'
import amethyst from './maps/amethyst/map.ts'
import volcano from './maps/volcano/map.ts'
import floe from './maps/floe/map.ts'
import theater from './maps/theater/map.ts'
import petri from './maps/petri/map.ts'
import exit from './maps/exit/map.ts'
import nebula from './maps/nebula/map.ts'

/** 地图登记表：有哪些、按什么顺序；每张图一个目录，目录名就是 id */
export const MAPS = {
  meadow,
  sakura,
  desert,
  deep,
  ruins,
  amethyst,
  volcano,
  floe,
  theater,
  petri,
  exit,
  nebula,
} satisfies Record<string, MapDef>
