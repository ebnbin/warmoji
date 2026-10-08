import type { EnemyDef } from '../../../src/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import caveBat from './enemies/caveBat.ts'
import geodeling from './enemies/geodeling.ts'
import lurker from './enemies/lurker.ts'
import hollow from './enemies/hollow.ts'
import peeker from './enemies/peeker.ts'
import caveTroll from './enemies/caveTroll.ts'
import coffin from './enemies/coffin.ts'
import darkMoon from './enemies/darkMoon.ts'
import vampireCount from './enemies/vampireCount.ts'
import fullMoon from './enemies/fullMoon.ts'
import shard from './enemies/shard.ts'
import * as miner from './characters/miner.ts'
import * as crystalWyrm from './characters/crystalWyrm.ts'
import * as shadowCat from './characters/shadowCat.ts'
import * as owl from './characters/owl.ts'
import * as crystalElf from './characters/crystalElf.ts'
import * as glowworm from './characters/glowworm.ts'
import * as moonRabbit from './characters/moonRabbit.ts'
import * as blindBard from './characters/blindBard.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { caveBat, geodeling, lurker, hollow, peeker, caveTroll, coffin, darkMoon, vampireCount, fullMoon, shard } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { miner, crystalWyrm, shadowCat, owl, crystalElf, glowworm, moonRabbit, blindBard } satisfies Record<string, CharacterFile>
