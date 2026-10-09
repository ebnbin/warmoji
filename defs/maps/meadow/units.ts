import type { EnemyDef } from '../../../src/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import wolf from './enemies/wolf.ts'
import tusker from './enemies/tusker.ts'
import grassSnake from './enemies/grassSnake.ts'
import snail from './enemies/snail.ts'
import bull from './enemies/bull.ts'
import goat from './enemies/goat.ts'
import skunk from './enemies/skunk.ts'
import stormCloud from './enemies/stormCloud.ts'
import bear from './enemies/bear.ts'
import spiderQueen from './enemies/spiderQueen.ts'
import spiderling from './enemies/spiderling.ts'
import spiderEgg from './enemies/spiderEgg.ts'
import spiderWeb from './enemies/spiderWeb.ts'
import * as cow from './characters/cow.ts'
import * as horse from './characters/horse.ts'
import * as hare from './characters/hare.ts'
import * as hawk from './characters/hawk.ts'
import * as rainbow from './characters/rainbow.ts'
import * as farmer from './characters/farmer.ts'
import * as pixie from './characters/pixie.ts'
import * as ladybug from './characters/ladybug.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { wolf, tusker, grassSnake, snail, bull, goat, skunk, stormCloud, bear, spiderQueen, spiderling, spiderEgg, spiderWeb } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { cow, horse, hare, hawk, rainbow, farmer, pixie, ladybug } satisfies Record<string, CharacterFile>
