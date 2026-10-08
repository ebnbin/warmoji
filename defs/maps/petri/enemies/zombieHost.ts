import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
import { patch } from '../../../kit.ts'
import ROACH from './roach.ts'

const bite = {
  trigger: 'auto',
  cooldownMs: 2000,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 2.4,
  damage: 24,
  fireSfx: 'chip',
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 2, radius: 0.7, ms: 150 },
  onHit: [{ kind: 'poison', damage: 4, tickMs: 500, durationMs: 3000 }],
} satisfies AbilityDef

// 扇形的命中效果落在喷的人脚下，黏液得喷完再接这一下以目标为心的才落到人脚下
const splat = {
  trigger: 'manual',
  aim: 'nearest',
  range: 4,
  shape: { kind: 'disc', radius: 2, at: 'target' },
  onHit: [{ kind: 'ground', def: patch(2, 4000, 0x9e9d24, [{ kind: 'slow', factor: 0.5, durationMs: 600 }]) }],
} satisfies AbilityDef

const spew = {
  trigger: 'auto',
  cooldownMs: 5500,
  firstDelayMs: 2500,
  aim: 'nearest',
  range: 3.5,
  damage: 20,
  fireSfx: 'gurgle',
  windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3.5, arcDeg: 100, ms: 220 },
  combo: [splat],
} satisfies AbilityDef

const horde = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 10000,
  firstDelayMs: 4000,
  aim: 'self',
  fireSfx: 'rumble',
  shape: { kind: 'world' },
  onHit: [{ kind: 'summon', of: { unit: ROACH, spread: 1.8 }, count: 4 }],
} satisfies AbilityDef

const ZOMBIE_HOST = {
  kind: 'zombieHost',
  role: 'boss',
  emoji: '1f9df',
  name: '宿主',
  element: 'dark',
  desc: '被菌感染的宿主：凑近了咬一口让人中毒，憋一下朝身前喷吐、在最近那人的脚下留一滩 2 格的黏液，4 秒内踩上去的人走得慢一半；隔一阵唤来四只蟑螂；血掉到一半尸变，走得更快、出手更勤；第一次倒下时还会再爬起来，回三成生命、2 秒内什么控制都不吃',
  size: 3.2,
  radius: 1.05,
  span: [0, 6],
  hp: 5100,
  stats: { armor: 4, exertion: 0 },
  speed: 1,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [bite, spew, horde],
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'healRatio', ratio: 0.3 }, { kind: 'unstoppable', durationMs: 2000 }] }],
  phases: [{ below: 0.5, name: '尸变', stats: { mul: { moveSpeed: 1.4, cooldown: 0.8 } } }],
} satisfies EnemyDef

export default ZOMBIE_HOST
