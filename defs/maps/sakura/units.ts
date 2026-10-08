import type { EnemyDef } from '../../../src/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import wisp from './enemies/wisp.ts'
import templeMonkey from './enemies/templeMonkey.ts'
import templeGoose from './enemies/templeGoose.ts'
import umbrella from './enemies/umbrella.ts'
import crayfish from './enemies/crayfish.ts'
import lantern from './enemies/lantern.ts'
import cursedDoll from './enemies/cursedDoll.ts'
import tengu from './enemies/tengu.ts'
import oni from './enemies/oni.ts'
import riverDragon from './enemies/riverDragon.ts'
import * as templeTurtle from './characters/templeTurtle.ts'
import * as bambooPanda from './characters/bambooPanda.ts'
import * as ninja from './characters/ninja.ts'
import * as otter from './characters/otter.ts'
import * as rainFrog from './characters/rainFrog.ts'
import * as damBeaver from './characters/damBeaver.ts'
import * as monk from './characters/monk.ts'
import * as foxSpirit from './characters/foxSpirit.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { wisp, templeMonkey, templeGoose, umbrella, crayfish, lantern, cursedDoll, tengu, oni, riverDragon } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { templeTurtle, bambooPanda, ninja, otter, rainFrog, damBeaver, monk, foxSpirit } satisfies Record<string, CharacterFile>
