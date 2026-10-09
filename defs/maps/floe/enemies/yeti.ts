import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, ring, shot, zoneLook } from '../../../kit.ts'

// 雪球本身不伤人，伤害全在炸开的一片里：砸中的人只冷一层
const snowballs = {
  trigger: 'auto',
  cooldownMs: 3200,
  firstDelayMs: 1200,
  aim: 'nearest',
  range: 8,
  damage: 0,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: { ...shot('26aa', 7, 0.9), flight: { kind: 'arc', peakM: 2.4 } }, lifeMs: 1600 },
  repeat: { count: 3, delayMs: 350, reaim: 'random' },
  onHit: [{ kind: 'blast', radius: 1.5, amount: 22, knockback: 1.5, ring: ring(0xe1f5fe) }],
} satisfies AbilityDef

const slam = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 9000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 3.5,
  damage: 24,
  fireSfx: 'shatter',
  color: 0x81d4fa,
  windup: { ms: 800, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 3.5, at: 'self' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'ground', def: { ...patch(3, 5000, 0xb3e5fc, undefined, 0, 1000), traction: 0.25 } }] }],
} satisfies AbilityDef

// 冻进冰里的人打不了也挨不了打
const encase = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 5000,
  aim: 'nearest',
  range: 9,
  fireSfx: 'zap',
  color: 0xb3e5fc,
  windup: { ms: 700, lockAt: 'end', telegraph: 'blink' },
  shape: { kind: 'disc', radius: 2.6, at: 'target' },
  onHit: [{ kind: 'stasis', durationMs: 2000 }],
} satisfies AbilityDef

const toss = {
  trigger: 'auto',
  cooldownMs: 6000,
  firstDelayMs: 2500,
  aim: 'nearest',
  range: 2.2,
  element: 'physical',
  fireSfx: 'whoosh',
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 1.8, radius: 0.6, ms: 200 },
  onHit: [{ kind: 'throw', to: 'behind', distance: 5, ms: 700, height: 1.6, onLand: [{ kind: 'damage', amount: 15 }] }],
} satisfies AbilityDef

// 有时限的跟随场只放得出一次，暴雪只能靠连发的短场跟着走：每个短场只跳一下
const blizzard = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 1000,
  aim: 'self',
  damage: 6,
  fireSfx: 'gust',
  // 冰茧形态换了招式，阶段就不能再换招式，暴雪改看血线
  when: { kind: 'all', of: [{ kind: 'hpBelow', who: 'self', ratio: 0.6 }, { kind: 'foesNear', who: 'self', radius: 5, atLeast: 1 }] },
  shape: { kind: 'zone', radius: 5, durationMs: 1050, tickMs: 1000, visual: { ...zoneLook(0xe3f2fd), enterMs: 0 } },
  repeat: { count: 6, delayMs: 1000 },
} satisfies AbilityDef

const YETI = {
  kind: 'yeti',
  role: 'boss',
  emoji: '1fac8',
  name: '大脚雪怪',
  element: 'ice',
  desc: '浮冰上横行的大脚雪怪，推不动；本身是冰，冻不住、不怕冰水，护甲厚，每一下直接打上去都被挡掉近三成，毒这类持续伤害不吃护甲。一口气扔出三个大雪球，砸中人就炸开一片，炸到的冷一层，冷满三层就冻住；抓起贴身的人往身后摔，摔在地上那一下是物理，冻住的摔碎、伤害翻倍；蓄力 0.8 秒跺碎冰面，身边 3.5 格的人冷一层，留下一片 5 秒的光冰，站在上面每秒冷一层、脚下打滑；把 9 格内最近那人身边 2.6 格的人冻进冰里 2 秒，冻住的打不了也挨不了打；血少于六成卷起跟着自己走的暴雪，6 秒里每秒冷一层；少于四分之一霸体 3 秒、越跑越快；第一次倒下时缩成冰茧，回两成生命，6 秒内打不碎就满血复生，可中着毒的冰茧一滴血也回不来',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 6800,
  stats: { armor: 6, exertion: 0 },
  speed: 1.15,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [snowballs, slam, encase, toss, blizzard],
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'healRatio', ratio: 0.2 }, { kind: 'form', to: 0, ms: 6000, onEnd: [{ kind: 'healRatio', ratio: 1 }] }] }],
  forms: [{ emoji: '1f9ca', name: '冰茧', span: [0, 3], stats: { mul: { scale: 0.7, moveSpeed: 0 } }, drive: { kind: 'stay' }, abilities: [], damage: 0 }],
  phases: [
    { below: 0.6, name: '暴雪' },
    { below: 0.25, name: '冰河', stats: { mul: { moveSpeed: 1.3 } }, effects: [{ kind: 'unstoppable', durationMs: 3000 }] },
  ],
} satisfies EnemyDef

export default YETI
