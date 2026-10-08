import type { EnemyDef } from '../../../src/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import spaceInvader from './enemies/spaceInvader.ts'
import starRam from './enemies/starRam.ts'
import shootingStar from './enemies/shootingStar.ts'
import exploder from './enemies/exploder.ts'
import warped from './enemies/warped.ts'
import darkMatter from './enemies/darkMatter.ts'
import satellite from './enemies/satellite.ts'
import weightless from './enemies/weightless.ts'
import mothership from './enemies/mothership.ts'
import singularity from './enemies/singularity.ts'
import * as leo from './characters/leo.ts'
import * as astronaut from './characters/astronaut.ts'
import * as greyAlien from './characters/greyAlien.ts'
import * as starPilot from './characters/starPilot.ts'
import * as starling from './characters/starling.ts'
import * as laika from './characters/laika.ts'
import * as starAngel from './characters/starAngel.ts'
import * as ringstar from './characters/ringstar.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { spaceInvader, starRam, shootingStar, exploder, warped, darkMatter, satellite, weightless, mothership, singularity } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { leo, astronaut, greyAlien, starPilot, starling, laika, starAngel, ringstar } satisfies Record<string, CharacterFile>
