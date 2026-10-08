import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
import { patch, ring, shot, zoneLook } from '../../../kit.ts'

const snowballs = {
  trigger: 'auto',
  cooldownMs: 3200,
  firstDelayMs: 1200,
  aim: 'nearest',
  range: 8,
  damage: 22,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: { ...shot('26aa', 7, 0.9), flight: { kind: 'arc', peakM: 2.4 } }, lifeMs: 1600 },
  repeat: { count: 3, delayMs: 350, reaim: 'random' },
  onHit: [{ kind: 'blast', radius: 1.5, ratio: 0.6, knockback: 1.5, ring: ring(0xe1f5fe) }],
} satisfies AbilityDef

const slam = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 9000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 3.5,
  damage: 30,
  fireSfx: 'shatter',
  color: 0x81d4fa,
  windup: { ms: 800, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 3.5, at: 'self' },
  onHit: [{ kind: 'status', status: 'frozen', ms: 1200 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'ground', def: { ...patch(3, 5000, 0xb3e5fc), traction: 0.25 } }] }],
} satisfies AbilityDef

const roar = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 6000,
  aim: 'nearest',
  range: 6,
  fireSfx: 'rumble',
  color: 0x90a4ae,
  windup: { ms: 500, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'disc', radius: 6, at: 'self' },
  onHit: [{ kind: 'fear', durationMs: 1200 }],
} satisfies AbilityDef

const toss = {
  trigger: 'auto',
  cooldownMs: 6000,
  firstDelayMs: 2500,
  aim: 'nearest',
  range: 2.2,
  fireSfx: 'whoosh',
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 1.8, radius: 0.6, ms: 200 },
  onHit: [{ kind: 'throw', to: 'behind', distance: 5, ms: 700, height: 1.6, onLand: [{ kind: 'damage', amount: 15 }] }],
} satisfies AbilityDef

// 有时限的跟随场只放得出一次，暴雪只能靠连发的短场跟着走
const blizzard = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 1000,
  aim: 'self',
  damage: 6,
  fireSfx: 'gust',
  when: { kind: 'foesNear', who: 'self', radius: 5, atLeast: 1 },
  shape: { kind: 'zone', radius: 5, durationMs: 550, tickMs: 450, visual: { ...zoneLook(0xe3f2fd), enterMs: 0 } },
  repeat: { count: 8, delayMs: 500 },
  onHit: [{ kind: 'slow', factor: 0.6, durationMs: 600 }],
} satisfies AbilityDef

const YETI = {
  kind: 'yeti',
  role: 'boss',
  emoji: '1fac8',
  name: '大脚雪怪',
  element: 'ice',
  desc: '浮冰上横行的大脚雪怪，不怕冰水：一口气扔出三个大雪球，砸中人就炸开一片；抓起贴身的人往身后摔；跺碎冰面冻住身边一圈人，留下一片光冰；一声咆哮吓跑身边的人；血少于六成卷起跟着自己走的暴雪，少于四分之一霸体 3 秒、越跑越快',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 6800,
  stats: { armor: 6, exertion: 0 },
  speed: 1.15,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary', 'coldproof'],
  drive: { kind: 'chase' },
  abilities: [snowballs, slam, roar, toss],
  phases: [
    { below: 0.6, name: '暴雪', abilities: [snowballs, slam, roar, toss, blizzard] },
    { below: 0.25, name: '冰河', stats: { mul: { moveSpeed: 1.3 } }, effects: [{ kind: 'unstoppable', durationMs: 3000 }] },
  ],
} satisfies EnemyDef

export default YETI
