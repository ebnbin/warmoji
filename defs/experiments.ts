import type { ExperimentDef } from '../legacy/types/runs'
import { FIGHTS as meadow } from './maps/meadow/fights.ts'
import { FIGHTS as sakura } from './maps/sakura/fights.ts'
import { FIGHTS as desert } from './maps/desert/fights.ts'
import { FIGHTS as deep } from './maps/deep/fights.ts'
import { FIGHTS as ruins } from './maps/ruins/fights.ts'
import { FIGHTS as amethyst } from './maps/amethyst/fights.ts'
import { FIGHTS as volcano } from './maps/volcano/fights.ts'
import { FIGHTS as floe } from './maps/floe/fights.ts'
import { FIGHTS as theater } from './maps/theater/fights.ts'
import { FIGHTS as petri } from './maps/petri/fights.ts'
import { FIGHTS as exit } from './maps/exit/fights.ts'
import { FIGHTS as nebula } from './maps/nebula/fights.ts'

/** 关卡登记表：各张图目录里的关卡按地图的先后接起来 */
export const EXPERIMENTS = {
  ...meadow,
  ...sakura,
  ...desert,
  ...deep,
  ...ruins,
  ...amethyst,
  ...volcano,
  ...floe,
  ...theater,
  ...petri,
  ...exit,
  ...nebula,
} satisfies Record<string, ExperimentDef>
