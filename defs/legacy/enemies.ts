import type { EnemyDef } from '../../src/types/enemies'
import zombie from './enemies/zombie.ts'
import ghost from './enemies/ghost.ts'
import invader from './enemies/invader.ts'
import boar from './enemies/boar.ts'
import snake from './enemies/snake.ts'
import mushroom from './enemies/mushroom.ts'
import rat from './enemies/rat.ts'
import slime from './enemies/slime.ts'
import blob from './enemies/blob.ts'
import blobling from './enemies/blobling.ts'
import hive from './enemies/hive.ts'
import larva from './enemies/larva.ts'
import creeper from './enemies/creeper.ts'
import elf from './enemies/elf.ts'
import turtle from './enemies/turtle.ts'
import locust from './enemies/locust.ts'
import gargoyle from './enemies/gargoyle.ts'
import puffer from './enemies/puffer.ts'
import ufo from './enemies/ufo.ts'
import alien from './enemies/alien.ts'
import comet from './enemies/comet.ts'
import treant from './enemies/treant.ts'
import scorpion from './enemies/scorpion.ts'
import croc from './enemies/croc.ts'
import mecha from './enemies/mecha.ts'
import rhino from './enemies/rhino.ts'
import eclipse from './enemies/eclipse.ts'
import blackhole from './enemies/blackhole.ts'
import chameleon from './enemies/chameleon.ts'
import skeleton from './enemies/skeleton.ts'
import knight from './enemies/knight.ts'
import crab from './enemies/crab.ts'
import raccoon from './enemies/raccoon.ts'
import siren from './enemies/siren.ts'
import sapling from './enemies/sapling.ts'
import tree from './enemies/tree.ts'
import pylon from './enemies/pylon.ts'
import swan from './enemies/swan.ts'

/** 旧敌人的登记表：保留着给旧关卡与图鉴用，新设计不引用它们；每个敌人一个文件，文件名就是种类 */
export const LEGACY_ENEMIES = {
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
} satisfies Record<string, EnemyDef>
