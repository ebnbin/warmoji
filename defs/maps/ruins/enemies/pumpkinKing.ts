import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { ring } from '../../../kit.ts'
import PUMPKINLING from './pumpkinling.ts'

const vineWhip = {
  trigger: 'auto',
  cooldownMs: 2200,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 3.2,
  damage: 20,
  fireSfx: 'whoosh',
  color: 0x7cb342,
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 3, radius: 0.5, ms: 200 },
  onHit: [{ kind: 'root', durationMs: 800 }],
} satisfies AbilityDef

const pumpkinBomb = {
  trigger: 'auto',
  cooldownMs: 3200,
  firstDelayMs: 2000,
  aim: 'nearest',
  range: 8,
  damage: 18,
  knockback: 2,
  fireSfx: 'shoot',
  shape: { kind: 'drop', targets: 1, look: { emoji: '1f383', size: 0.9 }, fromAbove: 3.5, dropMs: 700, staggerMs: 0 },
  onHit: [{ kind: 'blast', radius: 1.6, ratio: 1, knockback: 2, ring: ring(0xff8f00) }],
} satisfies AbilityDef

const brood = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 10_000,
  firstDelayMs: 4000,
  aim: 'self',
  fireSfx: 'recruit',
  shape: { kind: 'world' },
  onHit: [{ kind: 'summon', of: { unit: PUMPKINLING, spread: 2 }, count: 3 }],
} satisfies AbilityDef

const PUMPKIN_KING = {
  kind: 'pumpkinKing',
  role: 'boss',
  emoji: '1f383',
  name: '南瓜王',
  element: 'wood',
  desc: '盘踞残垣的南瓜王：藤鞭一抽把人钉在原地，远远抛来南瓜，落到人身上炸开一片，隔一阵召出三个会自爆的南瓜仔；血掉到一半点亮万圣夜，浑身着火变成火元素，出手更快',
  size: 3.2,
  radius: 1.05,
  span: [0, 6],
  hp: 3600,
  stats: { armor: 5, exertion: 0 },
  speed: 1.15,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [vineWhip, pumpkinBomb, brood],
  phases: [{ below: 0.5, name: '万圣夜', element: 'fire', stats: { mul: { cooldown: 0.8 } }, effects: [{ kind: 'unstoppable', durationMs: 2000 }] }],
} satisfies EnemyDef

export default PUMPKIN_KING
