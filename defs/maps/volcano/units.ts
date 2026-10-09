import type { EnemyDef } from '../../../legacy/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import imp from './enemies/imp.ts'
import bison from './enemies/bison.ts'
import chili from './enemies/chili.ts'
import meltling from './enemies/meltling.ts'
import steamer from './enemies/steamer.ts'
import fireMeteor from './enemies/fireMeteor.ts'
import lavaGiant from './enemies/lavaGiant.ts'
import quaker from './enemies/quaker.ts'
import demonLord from './enemies/demonLord.ts'
import phoenix from './enemies/phoenix.ts'
import * as smelter from './characters/smelter.ts'
import * as snowMonkey from './characters/snowMonkey.ts'
import * as salamander from './characters/salamander.ts'
import * as snowboarder from './characters/snowboarder.ts'
import * as volcanologist from './characters/volcanologist.ts'
import * as frostman from './characters/frostman.ts'
import * as firefighter from './characters/firefighter.ts'
import * as sauna from './characters/sauna.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { imp, bison, chili, meltling, steamer, fireMeteor, lavaGiant, quaker, demonLord, phoenix } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { smelter, snowMonkey, salamander, snowboarder, volcanologist, frostman, firefighter, sauna } satisfies Record<string, CharacterFile>
