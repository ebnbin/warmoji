import type { EnemyDef } from '../../../src/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import plagueRat from './enemies/plagueRat.ts'
import crow from './enemies/crow.ts'
import hedgehog from './enemies/hedgehog.ts'
import deathcap from './enemies/deathcap.ts'
import screamer from './enemies/screamer.ts'
import wallRhino from './enemies/wallRhino.ts'
import moai from './enemies/moai.ts'
import tombstone from './enemies/tombstone.ts'
import pumpkinKing from './enemies/pumpkinKing.ts'
import tyrant from './enemies/tyrant.ts'
import boneMan from './enemies/boneMan.ts'
import pumpkinling from './enemies/pumpkinling.ts'
import * as royalGuard from './characters/royalGuard.ts'
import * as silverback from './characters/silverback.ts'
import * as badger from './characters/badger.ts'
import * as squirrel from './characters/squirrel.ts'
import * as demolisher from './characters/demolisher.ts'
import * as warlock from './characters/warlock.ts'
import * as rescueDog from './characters/rescueDog.ts'
import * as stag from './characters/stag.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { plagueRat, crow, hedgehog, deathcap, screamer, wallRhino, moai, tombstone, pumpkinKing, tyrant, boneMan, pumpkinling } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { royalGuard, silverback, badger, squirrel, demolisher, warlock, rescueDog, stag } satisfies Record<string, CharacterFile>
