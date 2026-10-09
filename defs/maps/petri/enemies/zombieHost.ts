import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'
import ROACH from './roach.ts'

const bite = {
  trigger: 'auto',
  cooldownMs: 2000,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 2.4,
  damage: 26,
  knockback: 2,
  element: 'physical',
  fireSfx: 'chip',
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 2, radius: 0.7, ms: 150 },
} satisfies AbilityDef

// 扇形的命中效果落在喷的人脚下，那一滩得喷完再接这一下以目标为心的才落到人脚下；两下都带身体此刻的元素
const puddle = (color: number) =>
  ({
    trigger: 'manual',
    aim: 'nearest',
    range: 4,
    shape: { kind: 'disc', radius: 2, at: 'target' },
    onHit: [{ kind: 'ground', def: patch(2, 4000, color, undefined, 0, 1000) }],
  }) satisfies AbilityDef

const spew = (color: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 5500,
    firstDelayMs: 2500,
    aim: 'nearest',
    range: 3.5,
    damage: 15,
    fireSfx: 'gurgle',
    windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
    shape: { kind: 'sector', radius: 3.5, arcDeg: 100, ms: 220 },
    combo: [puddle(color)],
  }) satisfies AbilityDef

const sewage = spew(0x9e9d24)
const slush = spew(0xb3e5fc)

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
  element: 'water',
  desc: '被菌感染的宿主，本身是水，一直湿着：凑近了咬一口，把人咬退；憋一下朝身前喷一大口污水，喷中的挨一下、浑身湿透，再在最近那人的脚下留一滩 2 格的污水，4 秒内踩在上面的一直湿着；隔一阵唤来四只蟑螂；血掉到一半尸变，身体变成冰，走得更快、出手更勤，喷出来的成了冰水：喷中的加一层寒冷、湿着的当场冻住，脚下那滩待在上面每秒加一层寒冷；冻住的再挨一口或让蟑螂碰一下就碎冰、吃双倍；第一次倒下时还会再爬起来，回三成生命、2 秒内什么控制都不吃，中着毒就回不了血',
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
  abilities: [bite, sewage, horde],
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'healRatio', ratio: 0.3 }, { kind: 'unstoppable', durationMs: 2000 }] }],
  phases: [{ below: 0.5, name: '尸变', element: 'ice', abilities: [bite, slush, horde], stats: { mul: { moveSpeed: 1.4, cooldown: 0.8 } } }],
} satisfies EnemyDef

export default ZOMBIE_HOST
