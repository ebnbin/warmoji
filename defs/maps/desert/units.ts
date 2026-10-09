import type { EnemyDef } from '../../../legacy/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import armyAnt from './enemies/armyAnt.ts'
import scarab from './enemies/scarab.ts'
import sandLocust from './enemies/sandLocust.ts'
import cheetah from './enemies/cheetah.ts'
import cactus from './enemies/cactus.ts'
import dustDevil from './enemies/dustDevil.ts'
import heatWraith from './enemies/heatWraith.ts'
import sandScorpion from './enemies/sandScorpion.ts'
import sandworm from './enemies/sandworm.ts'
import blazingSun from './enemies/blazingSun.ts'
import * as bactrian from './characters/bactrian.ts'
import * as boxRoo from './characters/boxRoo.ts'
import * as shades from './characters/shades.ts'
import * as gunslinger from './characters/gunslinger.ts'
import * as dromedary from './characters/dromedary.ts'
import * as djinn from './characters/djinn.ts'
import * as elephant from './characters/elephant.ts'
import * as llama from './characters/llama.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { armyAnt, scarab, sandLocust, cheetah, cactus, dustDevil, heatWraith, sandScorpion, sandworm, blazingSun } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { bactrian, boxRoo, shades, gunslinger, dromedary, djinn, elephant, llama } satisfies Record<string, CharacterFile>
