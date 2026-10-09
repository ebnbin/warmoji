import type { EnemyDef } from '../../../legacy/types/enemies'
import type { CharacterFile } from '../../characters.ts'
import comedyMask from './enemies/comedyMask.ts'
import tragedyMask from './enemies/tragedyMask.ts'
import madClown from './enemies/madClown.ts'
import spadeGuard from './enemies/spadeGuard.ts'
import usher from './enemies/usher.ts'
import flirt from './enemies/flirt.ts'
import matryoshka from './enemies/matryoshka.ts'
import cheshire from './enemies/cheshire.ts'
import puppeteer from './enemies/puppeteer.ts'
import joker from './enemies/joker.ts'
import matryoshkaMid from './enemies/matryoshkaMid.ts'
import matryoshkaMini from './enemies/matryoshkaMini.ts'
import * as prince from './characters/prince.ts'
import * as discoKing from './characters/discoKing.ts'
import * as phantomThief from './characters/phantomThief.ts'
import * as trickster from './characters/trickster.ts'
import * as rocker from './characters/rocker.ts'
import * as painter from './characters/painter.ts'
import * as partyHost from './characters/partyHost.ts'
import * as pinocchio from './characters/pinocchio.ts'

/** 这张图目录里的新敌人：每个一个文件，文件名就是种类 */
export const ENEMIES = { comedyMask, tragedyMask, madClown, spadeGuard, usher, flirt, matryoshka, cheshire, puppeteer, joker, matryoshkaMid, matryoshkaMini } satisfies Record<string, EnemyDef>

/** 这张图解锁的新角色：每名一个文件，文件名就是 id */
export const CHARACTERS = { prince, discoKing, phantomThief, trickster, rocker, painter, partyHost, pinocchio } satisfies Record<string, CharacterFile>
