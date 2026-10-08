import type { EnemyDef, EnemyKind } from '../src/types/enemies'
import zombie from './common/enemies/zombie.ts'
import ghost from './common/enemies/ghost.ts'
import invader from './common/enemies/invader.ts'
import boar from './common/enemies/boar.ts'
import snake from './common/enemies/snake.ts'
import mushroom from './common/enemies/mushroom.ts'
import rat from './common/enemies/rat.ts'
import slime from './common/enemies/slime.ts'
import blob from './common/enemies/blob.ts'
import blobling from './common/enemies/blobling.ts'
import hive from './common/enemies/hive.ts'
import larva from './common/enemies/larva.ts'
import creeper from './common/enemies/creeper.ts'
import elf from './common/enemies/elf.ts'
import turtle from './common/enemies/turtle.ts'
import locust from './common/enemies/locust.ts'
import gargoyle from './common/enemies/gargoyle.ts'
import puffer from './common/enemies/puffer.ts'
import ufo from './common/enemies/ufo.ts'
import alien from './common/enemies/alien.ts'
import comet from './common/enemies/comet.ts'
import treant from './common/enemies/treant.ts'
import scorpion from './common/enemies/scorpion.ts'
import croc from './common/enemies/croc.ts'
import mecha from './common/enemies/mecha.ts'
import rhino from './common/enemies/rhino.ts'
import eclipse from './common/enemies/eclipse.ts'
import blackhole from './common/enemies/blackhole.ts'
import chameleon from './common/enemies/chameleon.ts'
import skeleton from './common/enemies/skeleton.ts'
import knight from './common/enemies/knight.ts'
import crab from './common/enemies/crab.ts'
import raccoon from './common/enemies/raccoon.ts'
import siren from './common/enemies/siren.ts'
import sapling from './common/enemies/sapling.ts'
import tree from './common/enemies/tree.ts'
import pylon from './common/enemies/pylon.ts'
import swan from './common/enemies/swan.ts'

type EnemyTable = { readonly [K in EnemyKind]: EnemyDef & { readonly kind: K } }

/** 敌人登记表：有哪些、按什么顺序；每个敌人一个文件，文件名就是种类 */
export const ENEMIES: EnemyTable = {
  zombie,
  ghost,
  invader,
  boar,
  snake,
  mushroom,
  rat,
  slime,
  blob,
  blobling,
  hive,
  larva,
  creeper,
  elf,
  turtle,
  locust,
  gargoyle,
  puffer,
  ufo,
  alien,
  comet,
  treant,
  scorpion,
  croc,
  mecha,
  rhino,
  eclipse,
  blackhole,
  chameleon,
  skeleton,
  knight,
  crab,
  raccoon,
  siren,
  sapling,
  tree,
  pylon,
  swan,
}
