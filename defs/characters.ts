import type { AbilityId } from '../src/types/abilities'
import type { AbilityDef } from '../src/types/abilityDefs'
import type { CharacterAuthoring } from '../src/types/characters'
import type { StatMods } from '../src/types/stats'
import type { WeaponId, WeaponSource } from '../src/types/weapons'
import { mapValues } from '../src/util/record.ts'
import * as juggler from './common/characters/juggler.ts'
import * as unicorn from './common/characters/unicorn.ts'
import * as troll from './common/characters/troll.ts'
import * as cowboy from './common/characters/cowboy.ts'
import * as mage from './common/characters/mage.ts'
import * as kangaroo from './common/characters/kangaroo.ts'
import * as robot from './common/characters/robot.ts'
import * as snowman from './common/characters/snowman.ts'
import * as fairy from './common/characters/fairy.ts'
import * as assassin from './common/characters/assassin.ts'
import * as beaver from './common/characters/beaver.ts'
import * as queenBee from './common/characters/queenBee.ts'
import * as medic from './common/characters/medic.ts'
import * as jellyfish from './common/characters/jellyfish.ts'
import * as frog from './common/characters/frog.ts'
import * as fox from './common/characters/fox.ts'
import * as fencer from './common/characters/fencer.ts'
import * as sloth from './common/characters/sloth.ts'
import * as blackCat from './common/characters/blackCat.ts'
import * as gorilla from './common/characters/gorilla.ts'
import * as detective from './common/characters/detective.ts'
import * as eagle from './common/characters/eagle.ts'
import * as bear from './common/characters/bear.ts'
import * as vampire from './common/characters/vampire.ts'
import * as genie from './common/characters/genie.ts'
import * as parrot from './common/characters/parrot.ts'
import * as panda from './common/characters/panda.ts'
import * as chipmunk from './common/characters/chipmunk.ts'
import * as guard from './common/characters/guard.ts'
import * as peacock from './common/characters/peacock.ts'
import * as koala from './common/characters/koala.ts'
import * as octopus from './common/characters/octopus.ts'
import * as penguin from './common/characters/penguin.ts'
import * as caterpillar from './common/characters/caterpillar.ts'
import * as dragon from './common/characters/dragon.ts'
import * as clown from './common/characters/clown.ts'

/** 一名角色的文件：角色本身（默认导出）、它的能力、武器与 2 级起每一级的属性 */
export interface CharacterFile {
  readonly default: CharacterAuthoring
  readonly abilities: Readonly<Record<string, AbilityDef>>
  readonly weapons?: Readonly<Record<string, WeaponSource>>
  readonly levels: readonly StatMods[]
}

/** 角色登记表：有哪些、按什么顺序；每名角色一个文件，文件名就是 id */
export const CHARACTER_FILES = {
  juggler,
  unicorn,
  troll,
  cowboy,
  mage,
  kangaroo,
  robot,
  snowman,
  fairy,
  assassin,
  beaver,
  queenBee,
  medic,
  jellyfish,
  frog,
  fox,
  fencer,
  sloth,
  blackCat,
  gorilla,
  detective,
  eagle,
  bear,
  vampire,
  genie,
  parrot,
  panda,
  chipmunk,
  guard,
  peacock,
  koala,
  octopus,
  penguin,
  caterpillar,
  dragon,
  clown,
} satisfies Record<string, CharacterFile>

export const CHARACTERS = mapValues(CHARACTER_FILES, (f) => f.default)

export const LEVEL_STATS = mapValues(CHARACTER_FILES, (f) => f.levels)

const FILES: readonly CharacterFile[] = Object.values(CHARACTER_FILES)

/** 各角色文件里的能力并成一张表，id 不重由构建期检查 */
export const ABILITIES = Object.fromEntries(FILES.flatMap((f) => Object.entries(f.abilities))) as Readonly<Record<AbilityId, AbilityDef>>

/** 各角色文件里的武器并成一张表，id 不重由构建期检查 */
export const WEAPONS = Object.fromEntries(FILES.flatMap((f) => Object.entries(f.weapons ?? {}))) as Readonly<Record<WeaponId, WeaponSource>>
