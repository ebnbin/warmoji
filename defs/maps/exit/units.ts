import type { EnemyDef } from '../../../src/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import smiley from './enemies/smiley.ts'
import commuter from './enemies/commuter.ts'
import stander from './enemies/stander.ts'
import zipper from './enemies/zipper.ts'
import poster from './enemies/poster.ts'
import upsideDown from './enemies/upsideDown.ts'
import mouthless from './enemies/mouthless.ts'
import floatingSuit from './enemies/floatingSuit.ts'
import watcher from './enemies/watcher.ts'
import reactor from './enemies/reactor.ts'
import * as securityBot from './characters/securityBot.ts'
import * as officer from './characters/officer.ts'
import * as mazeRat from './characters/mazeRat.ts'
import * as sleuth from './characters/sleuth.ts'
import * as geek from './characters/geek.ts'
import * as hacker from './characters/hacker.ts'
import * as dispatcher from './characters/dispatcher.ts'
import * as mastermind from './characters/mastermind.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { smiley, commuter, stander, zipper, poster, upsideDown, mouthless, floatingSuit, watcher, reactor } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { securityBot, officer, mazeRat, sleuth, geek, hacker, dispatcher, mastermind } satisfies Record<string, CharacterFile>
