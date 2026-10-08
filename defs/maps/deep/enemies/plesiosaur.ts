import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const neckBite = {
  trigger: 'auto',
  cooldownMs: 1800,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 3.4,
  damage: 22,
  knockback: 2,
  fireSfx: 'gulp',
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 3.2, radius: 0.6, ms: 200, lungeDist: 1.2 },
} satisfies AbilityDef

const waterBolt = {
  trigger: 'auto',
  cooldownMs: 2600,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 8,
  damage: 14,
  fireSfx: 'splash',
  shape: { kind: 'bolt', projectile: shot('1f535', 7, 0.5), lifeMs: 1600 },
  repeat: { count: 3, spreadDeg: 30 },
} satisfies AbilityDef

const ambushLeap = {
  trigger: 'manual',
  class: 'skill',
  aim: 'nearest',
  range: 7,
  damage: 28,
  knockback: 2,
  fireSfx: 'splash',
  color: 0x4fc3f7,
  windup: { ms: 800, lockAt: 'end', telegraph: 'blink' },
  shape: { kind: 'leap', distance: 5, ms: 550, height: 1.5, radius: 2 },
  onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }],
} satisfies AbilityDef

const ambush = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 6000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 7,
  fireSfx: 'bubble',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'untargetable', durationMs: 800 }] }],
  combo: [ambushLeap],
} satisfies AbilityDef

const iceBreath = {
  trigger: 'auto',
  cooldownMs: 4500,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 3.5,
  damage: 18,
  fireSfx: 'gust',
  color: 0x80deea,
  windup: { ms: 500, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3.5, arcDeg: 120, ms: 250 },
  onHit: [
    { kind: 'slow', factor: 0.5, durationMs: 2000 },
    { kind: 'stack', max: 2, durationMs: 5000, then: [{ kind: 'status', status: 'frozen', ms: 1000 }] },
  ],
} satisfies AbilityDef

const PLESIOSAUR = {
  kind: 'plesiosaur',
  role: 'boss',
  emoji: '1f995',
  name: '蛇颈龙',
  element: 'water',
  desc: '峡谷深处的蛇颈龙：长脖子一伸能咬到 3 格外的人，一口吐出三发散开的水弹；隔一阵潜下去 0.8 秒谁也打不着，再扑出 5 格砸地，把 2 格内的人掀飞；血掉到一半转成冰属性，出手更勤，多一口冰息：前方 3.5 格减速一半，5 秒内吃两口就冻住 1 秒',
  size: 3.3,
  radius: 1.08,
  span: [0, 6],
  hp: 3300,
  stats: { armor: 5, exertion: 0 },
  speed: 1.2,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [neckBite, waterBolt, ambush],
  phases: [{ below: 0.5, name: '寒流', element: 'ice', abilities: [neckBite, waterBolt, ambush, iceBreath], stats: { mul: { cooldown: 0.85 } } }],
} satisfies EnemyDef

export default PLESIOSAUR
