import type { EnemyDef } from '../../../src/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import fishSchool from './enemies/fishSchool.ts'
import pearlClam from './enemies/pearlClam.ts'
import porcupineFish from './enemies/porcupineFish.ts'
import conch from './enemies/conch.ts'
import shark from './enemies/shark.ts'
import seepBubble from './enemies/seepBubble.ts'
import abyssEye from './enemies/abyssEye.ts'
import doorCoral from './enemies/doorCoral.ts'
import plesiosaur from './enemies/plesiosaur.ts'
import abyssWhale from './enemies/abyssWhale.ts'
import * as kingCrab from './characters/kingCrab.ts'
import * as mantisShrimp from './characters/mantisShrimp.ts'
import * as squid from './characters/squid.ts'
import * as dolphin from './characters/dolphin.ts'
import * as medusa from './characters/medusa.ts'
import * as mechanic from './characters/mechanic.ts'
import * as mermaid from './characters/mermaid.ts'
import * as inkOctopus from './characters/inkOctopus.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { fishSchool, pearlClam, porcupineFish, conch, shark, seepBubble, abyssEye, doorCoral, plesiosaur, abyssWhale } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { kingCrab, mantisShrimp, squid, dolphin, medusa, mechanic, mermaid, inkOctopus } satisfies Record<string, CharacterFile>
