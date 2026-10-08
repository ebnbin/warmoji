import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'

const bite = {
  trigger: 'auto',
  cooldownMs: 1800,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 2.8,
  damage: 26,
  fireSfx: 'thud',
  windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 2.6, radius: 0.7, ms: 180 },
} satisfies AbilityDef

const tailSwipe = {
  trigger: 'auto',
  cooldownMs: 4500,
  firstDelayMs: 2500,
  aim: 'nearest',
  range: 3.4,
  damage: 20,
  knockback: 4,
  fireSfx: 'whoosh',
  windup: { ms: 450, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3.6, arcDeg: 200, ms: 260 },
} satisfies AbilityDef

const charge = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 9,
  damage: 30,
  knockback: 6,
  breach: 12,
  fireSfx: 'charge',
  windup: { ms: 800, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'sprint', distance: 8, ms: 900, radius: 1.5 },
} satisfies AbilityDef

const roar = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12_000,
  firstDelayMs: 6000,
  aim: 'nearest',
  range: 5,
  fireSfx: 'rumble',
  color: 0x8d6e63,
  windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [{ kind: 'fear', durationMs: 1500 }],
} satisfies AbilityDef

const TYRANT = {
  kind: 'tyrant',
  role: 'boss',
  emoji: '1f996',
  name: '暴龙',
  element: 'earth',
  desc: '残垣的霸主：一口咬下去疼得要命，尾巴一甩扫开身前一大片，低头冲撞时连墙带人一起撞穿，一声咆哮吓得 5 格内的人四散逃开；血少了彻底狂暴，跑得更快、出手更勤',
  size: 3.5,
  radius: 1.12,
  span: [0, 6],
  hp: 5600,
  stats: { armor: 6, exertion: 0 },
  speed: 1.25,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [bite, tailSwipe, charge, roar],
  phases: [{ below: 0.4, name: '狂暴', stats: { mul: { moveSpeed: 1.3, cooldown: 0.75 } }, effects: [{ kind: 'unstoppable', durationMs: 3000 }] }],
} satisfies EnemyDef

export default TYRANT
