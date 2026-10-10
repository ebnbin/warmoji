import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, shot } from '../../../kit.ts'
import SMILEY from './smiley.ts'

const scan = {
  trigger: 'auto',
  cooldownMs: 4200,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 9,
  element: 'physical',
  damage: 30,
  fireSfx: 'zap',
  color: 0xff5252,
  windup: { ms: 800, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'segment', reach: 9, radius: 0.3, ms: 200, beam: true },
} satisfies AbilityDef

const shock = {
  trigger: 'auto',
  cooldownMs: 2600,
  firstDelayMs: 2500,
  aim: 'nearest',
  range: 8,
  damage: 12,
  fireSfx: 'zap',
  shape: { kind: 'bolt', projectile: shot('1f7e1', 8, 0.45), lifeMs: 1400 },
  repeat: { count: 3, spreadDeg: 30 },
} satisfies AbilityDef

const alarm = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 6000,
  aim: 'self',
  element: 'water',
  fireSfx: 'sonar',
  shape: { kind: 'world' },
  onHit: [
    { kind: 'summon', of: { unit: SMILEY, spread: 2.5 }, count: 3 },
    { kind: 'to', who: { side: 'foes', radius: 12 }, then: [{ kind: 'each', then: [{ kind: 'ground', def: patch(1.8, 4000, 0x42a5f5, undefined, 0, 600) }] }] },
  ],
} satisfies AbilityDef

const WATCHER = {
  kind: 'watcher',
  role: 'boss',
  emoji: '1f4f9',
  name: '监控之眼',
  element: 'thunder',
  desc: '盯着整座迷宫的监控探头，隔着 5 格远远跟着：闪烁 0.8 秒后扫出一道 9 格长的光束，扫中的挨一记重的，闪烁时一打断就扫不出来；一次射出三发散开的电弹，打断出手，电流再跳给旁边一个，湿的连成一片一起挨；隔一阵拉响警报，叫来三个笑脸兵，喷淋头往 12 格内每个队员脚下洒一片 1.8 格的水洼，4 秒内站在里面的浑身湿透，落下 0.6 秒内跨出去就不湿；血掉到四成警报大作，霸体 2 秒，出手更快',
  size: 3.2,
  radius: 1.05,
  span: [0, 6],
  hp: 5400,
  stats: { armor: 4, exertion: 0 },
  speed: 1.1,
  damage: 14,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'standoff', standoffDist: 5 },
  abilities: [scan, shock, alarm],
  phases: [{ below: 0.4, name: '警报', stats: { mul: { cooldown: 0.75 } }, effects: [{ kind: 'unstoppable', durationMs: 2000 }] }],
} satisfies EnemyDef

export default WATCHER
