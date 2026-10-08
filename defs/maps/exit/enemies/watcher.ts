import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'
import SMILEY from './smiley.ts'

const scan = {
  trigger: 'auto',
  cooldownMs: 4200,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 9,
  damage: 26,
  fireSfx: 'zap',
  color: 0xff5252,
  windup: { ms: 800, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'segment', reach: 9, radius: 0.3, ms: 200, beam: true },
  onHit: [{ kind: 'status', status: 'exposed', ms: 4000, value: 1.25 }],
} satisfies AbilityDef

const shock = {
  trigger: 'auto',
  cooldownMs: 2600,
  firstDelayMs: 2500,
  aim: 'nearest',
  range: 8,
  damage: 16,
  fireSfx: 'zap',
  shape: { kind: 'bolt', projectile: shot('1f7e1', 8, 0.45), lifeMs: 1400 },
  repeat: { count: 3, spreadDeg: 30 },
  onHit: [{ kind: 'stun', durationMs: 300 }],
} satisfies AbilityDef

const alarm = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 6000,
  aim: 'self',
  fireSfx: 'sonar',
  shape: { kind: 'world' },
  onHit: [{ kind: 'summon', of: { unit: SMILEY, spread: 2.5 }, count: 3 }],
} satisfies AbilityDef

const WATCHER = {
  kind: 'watcher',
  role: 'boss',
  emoji: '1f4f9',
  name: '监控之眼',
  element: 'thunder',
  desc: '盯着整座迷宫的监控探头，隔着 5 格远远跟着：闪烁一阵后扫出一道 9 格长的光束，扫中的 4 秒内受到的伤害 ×1.25；一次射出三发散开的电弹，打中的麻 0.3 秒；隔一阵拉响警报叫来三个笑脸兵；血掉到四成警报大作，霸体 2 秒，出手更快',
  size: 3.2,
  radius: 1.05,
  span: [0, 6],
  hp: 5400,
  stats: { armor: 4, exertion: 0 },
  speed: 1.1,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'standoff', standoffDist: 5 },
  abilities: [scan, shock, alarm],
  phases: [{ below: 0.4, name: '警报', stats: { mul: { cooldown: 0.75 } }, effects: [{ kind: 'unstoppable', durationMs: 2000 }] }],
} satisfies EnemyDef

export default WATCHER
