import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
import { shot, zoneLook } from '../../../kit.ts'

const well = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 9000,
  firstDelayMs: 3000,
  aim: 'nearest',
  range: 6,
  fireSfx: 'gulp',
  shape: { kind: 'zone', radius: 6, durationMs: 3000, pull: 2.5, visual: zoneLook(0x4527a0) },
} satisfies AbilityDef

const horizon = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 5000,
  aim: 'nearest',
  range: 4,
  damage: 40,
  color: 0x311b92,
  fireSfx: 'boom',
  windup: { ms: 1200, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 4, at: 'self' },
} satisfies AbilityDef

const darkShot = {
  trigger: 'auto',
  cooldownMs: 3000,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 9,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f7e3', 4.5, 0.5), lifeMs: 3000 },
  repeat: { count: 8, spreadDeg: 360 },
} satisfies AbilityDef

const spaghettify = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 10000,
  firstDelayMs: 7000,
  aim: 'nearest',
  range: 6,
  fireSfx: 'creak',
  shape: { kind: 'world' },
  onHit: [
    {
      kind: 'to',
      who: { side: 'foes', radius: 6, sort: 'nearest', count: 1 },
      then: [{ kind: 'tether', ms: 3000, range: 7, onHold: [{ kind: 'stun', durationMs: 1000 }, { kind: 'damage', amount: 30 }], color: 0x7e57c2 }],
    },
  ],
} satisfies AbilityDef

const repulse = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 5,
  damage: 30,
  knockback: 6,
  color: 0xfff59d,
  fireSfx: 'boom',
  windup: { ms: 700, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 5, at: 'self' },
} satisfies AbilityDef

const lightShot = {
  trigger: 'auto',
  cooldownMs: 2600,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 9,
  damage: 16,
  fireSfx: 'zap',
  shape: { kind: 'bolt', projectile: shot('1f506', 5.5, 0.5), lifeMs: 2600 },
  repeat: { count: 8, spreadDeg: 360 },
} satisfies AbilityDef

const SINGULARITY = {
  kind: 'singularity',
  role: 'boss',
  emoji: '1f573',
  name: '奇点',
  element: 'dark',
  desc: '黑洞凝成的奇点：张开 6 格的引力井把人往身边吸，蓄力 1.2 秒后重创 4 格内的人，暗物质弹朝八方射，还会用引力拴住最近的人，3 秒内没挣到 7 格外就被拉成面条，眩晕 1 秒并挨一大下；血掉到一半翻成白洞，元素转为光，改用斥力爆发把人炸开、朝八方射光弹，蓄力重创照旧，出手也更快',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 8400,
  stats: { armor: 4, exertion: 0 },
  speed: 1.1,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [well, horizon, darkShot, spaghettify],
  phases: [{ below: 0.5, name: '白洞', element: 'light', abilities: [repulse, lightShot, horizon], stats: { mul: { cooldown: 0.8 } } }],
} satisfies EnemyDef

export default SINGULARITY
