import type { EnemyDef } from '../../../legacy/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import sneezer from './enemies/sneezer.ts'
import nauseous from './enemies/nauseous.ts'
import roach from './enemies/roach.ts'
import mosquito from './enemies/mosquito.ts'
import acidVial from './enemies/acidVial.ts'
import mold from './enemies/mold.ts'
import vomiter from './enemies/vomiter.ts'
import mutant from './enemies/mutant.ts'
import spore from './enemies/spore.ts'
import zombieHost from './enemies/zombieHost.ts'
import superbug from './enemies/superbug.ts'
import * as sponge from './characters/sponge.ts'
import * as hamster from './characters/hamster.ts'
import * as labMouse from './characters/labMouse.ts'
import * as inspector from './characters/inspector.ts'
import * as soap from './characters/soap.ts'
import * as gradStudent from './characters/gradStudent.ts'
import * as nurse from './characters/nurse.ts'
import * as maskMan from './characters/maskMan.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { sneezer, nauseous, roach, mosquito, acidVial, mold, vomiter, mutant, spore, zombieHost, superbug } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { sponge, hamster, labMouse, inspector, soap, gradStudent, nurse, maskMan } satisfies Record<string, CharacterFile>
