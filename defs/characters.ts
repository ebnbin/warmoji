import type { AbilityId } from '../src/types/abilities'
import type { AbilityDef } from '../src/types/abilityDefs'
import type { CharacterAuthoring } from '../src/types/characters'
import type { StatMods } from '../src/types/stats'
import type { WeaponId, WeaponSource } from '../src/types/weapons'
import { mapValues } from '../src/util/record.ts'
import { CHARACTERS as meadow } from './maps/meadow/units.ts'
import { CHARACTERS as sakura } from './maps/sakura/units.ts'
import { CHARACTERS as desert } from './maps/desert/units.ts'
import { CHARACTERS as deep } from './maps/deep/units.ts'
import { CHARACTERS as ruins } from './maps/ruins/units.ts'
import { CHARACTERS as amethyst } from './maps/amethyst/units.ts'
import { CHARACTERS as volcano } from './maps/volcano/units.ts'
import { CHARACTERS as floe } from './maps/floe/units.ts'
import { CHARACTERS as theater } from './maps/theater/units.ts'
import { CHARACTERS as petri } from './maps/petri/units.ts'
import { CHARACTERS as exit } from './maps/exit/units.ts'
import { CHARACTERS as nebula } from './maps/nebula/units.ts'

/** 一名角色的文件：角色本身（默认导出）、它的能力、武器与 2 级起每一级的属性 */
export interface CharacterFile {
  readonly default: CharacterAuthoring
  readonly abilities: Readonly<Record<string, AbilityDef>>
  readonly weapons?: Readonly<Record<string, WeaponSource>>
  readonly levels: readonly StatMods[]
}

/** 角色登记表：各张图目录里的按地图的先后接起来；每名角色一个文件，文件名就是 id，id 不重由构建期检查 */
export const CHARACTER_FILES = {
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
} satisfies Record<string, CharacterFile>

/** 各张图对应的角色，按登记的先后：沙盒进哪张图就从哪张图的里面抽队伍 */
export const MAP_CHARACTERS = mapValues({ meadow, sakura, desert, deep, ruins, amethyst, volcano, floe, theater, petri, exit, nebula }, (own) => Object.keys(own))

export const CHARACTERS = mapValues(CHARACTER_FILES, (f) => f.default)

export const LEVEL_STATS = mapValues(CHARACTER_FILES, (f) => f.levels)

const FILES: readonly CharacterFile[] = Object.values(CHARACTER_FILES)

/** 各角色文件里的能力并成一张表，id 不重由构建期检查 */
export const ABILITIES = Object.fromEntries(FILES.flatMap((f) => Object.entries(f.abilities))) as Readonly<Record<AbilityId, AbilityDef>>

/** 各角色文件里的武器并成一张表，id 不重由构建期检查 */
export const WEAPONS = Object.fromEntries(FILES.flatMap((f) => Object.entries(f.weapons ?? {}))) as Readonly<Record<WeaponId, WeaponSource>>
