import type { CharacterFile } from '../characters.ts'
import * as juggler from './characters/juggler.ts'
import * as unicorn from './characters/unicorn.ts'
import * as troll from './characters/troll.ts'
import * as cowboy from './characters/cowboy.ts'
import * as mage from './characters/mage.ts'
import * as kangaroo from './characters/kangaroo.ts'
import * as robot from './characters/robot.ts'
import * as snowman from './characters/snowman.ts'
import * as fairy from './characters/fairy.ts'
import * as assassin from './characters/assassin.ts'
import * as beaver from './characters/beaver.ts'
import * as queenBee from './characters/queenBee.ts'
import * as medic from './characters/medic.ts'
import * as jellyfish from './characters/jellyfish.ts'
import * as frog from './characters/frog.ts'
import * as fox from './characters/fox.ts'
import * as fencer from './characters/fencer.ts'
import * as sloth from './characters/sloth.ts'
import * as blackCat from './characters/blackCat.ts'
import * as gorilla from './characters/gorilla.ts'
import * as detective from './characters/detective.ts'
import * as eagle from './characters/eagle.ts'
import * as bear from './characters/bear.ts'
import * as vampire from './characters/vampire.ts'
import * as genie from './characters/genie.ts'
import * as parrot from './characters/parrot.ts'
import * as panda from './characters/panda.ts'
import * as chipmunk from './characters/chipmunk.ts'
import * as guard from './characters/guard.ts'
import * as peacock from './characters/peacock.ts'
import * as koala from './characters/koala.ts'
import * as octopus from './characters/octopus.ts'
import * as penguin from './characters/penguin.ts'
import * as caterpillar from './characters/caterpillar.ts'
import * as dragon from './characters/dragon.ts'
import * as clown from './characters/clown.ts'

/** 旧角色的登记表：保留着给旧关卡与图鉴用，新的选角不列它们；每名角色一个文件，文件名就是 id */
export const LEGACY_CHARACTER_FILES = {
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
