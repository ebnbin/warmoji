import type { EnemyDef, EnemyKind } from '../src/types/enemies'
import { LEGACY_ENEMIES } from './legacy/enemies.ts'
import { ENEMIES as meadow } from './maps/meadow/units.ts'
import { ENEMIES as sakura } from './maps/sakura/units.ts'
import { ENEMIES as desert } from './maps/desert/units.ts'
import { ENEMIES as deep } from './maps/deep/units.ts'
import { ENEMIES as ruins } from './maps/ruins/units.ts'
import { ENEMIES as amethyst } from './maps/amethyst/units.ts'
import { ENEMIES as volcano } from './maps/volcano/units.ts'
import { ENEMIES as floe } from './maps/floe/units.ts'
import { ENEMIES as theater } from './maps/theater/units.ts'
import { ENEMIES as petri } from './maps/petri/units.ts'
import { ENEMIES as exit } from './maps/exit/units.ts'
import { ENEMIES as nebula } from './maps/nebula/units.ts'

/** 新敌人：各张图目录里的按地图的先后接起来；和旧敌人的种类不重由构建期检查 */
export const NEW_ENEMIES = {
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
} satisfies Record<string, EnemyDef>

type EnemyTable = { readonly [K in EnemyKind]: EnemyDef & { readonly kind: K } }

/** 敌人登记表：旧敌人在前、新敌人在后；每个敌人一个文件，文件名就是种类 */
export const ENEMIES: EnemyTable = { ...LEGACY_ENEMIES, ...NEW_ENEMIES }
