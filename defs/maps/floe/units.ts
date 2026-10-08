import type { EnemyDef } from '../../../src/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import badSnowman from './enemies/badSnowman.ts'
import frostSwan from './enemies/frostSwan.ts'
import snowCloud from './enemies/snowCloud.ts'
import mistSpirit from './enemies/mistSpirit.ts'
import curlingStone from './enemies/curlingStone.ts'
import iceBlock from './enemies/iceBlock.ts'
import gustSpirit from './enemies/gustSpirit.ts'
import crackGrin from './enemies/crackGrin.ts'
import orca from './enemies/orca.ts'
import yeti from './enemies/yeti.ts'
import * as polarBear from './characters/polarBear.ts'
import * as seal from './characters/seal.ts'
import * as skier from './characters/skier.ts'
import * as emperorPenguin from './characters/emperorPenguin.ts'
import * as santa from './characters/santa.ts'
import * as mrsClaus from './characters/mrsClaus.ts'
import * as mammoth from './characters/mammoth.ts'
import * as frostWhisper from './characters/frostWhisper.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { badSnowman, frostSwan, snowCloud, mistSpirit, curlingStone, iceBlock, gustSpirit, crackGrin, orca, yeti } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { polarBear, seal, skier, emperorPenguin, santa, mrsClaus, mammoth, frostWhisper } satisfies Record<string, CharacterFile>
