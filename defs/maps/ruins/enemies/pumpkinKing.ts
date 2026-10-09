import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, ring } from '../../../kit.ts'
import PUMPKINLING from './pumpkinling.ts'

const vineWhip = {
  trigger: 'auto',
  cooldownMs: 2200,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 3.2,
  element: 'physical',
  damage: 20,
  fireSfx: 'whoosh',
  color: 0x7cb342,
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 3, radius: 0.5, ms: 200 },
  onHit: [{ kind: 'root', durationMs: 800 }],
} satisfies AbilityDef

// 灯灭以后身体换成毒，抛来的南瓜照样是火
const pumpkinBomb = {
  trigger: 'auto',
  cooldownMs: 3200,
  firstDelayMs: 2000,
  aim: 'nearest',
  range: 8,
  element: 'fire',
  damage: 15,
  knockback: 1,
  fireSfx: 'shoot',
  shape: { kind: 'drop', targets: 1, look: { emoji: '1f383', size: 0.9 }, fromAbove: 3.5, dropMs: 700, staggerMs: 0 },
  onHit: [{ kind: 'blast', radius: 1.6, ratio: 1, knockback: 1, ring: ring(0xff8f00) }],
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

const rotSpit = {
  trigger: 'auto',
  cooldownMs: 4500,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 8,
  element: 'poison',
  damage: 8,
  fireSfx: 'gurgle',
  shape: { kind: 'drop', targets: 1, look: { emoji: '1f9a0', size: 0.7 }, fromAbove: 3, dropMs: 600, staggerMs: 0 },
  onHit: [{ kind: 'ground', def: patch(2, 6000, 0x9ccc65, undefined, 2, 500) }],
} satisfies AbilityDef

const PUMPKIN_KING = {
  kind: 'pumpkinKing',
  role: 'boss',
  emoji: '1f383',
  name: '南瓜王',
  element: 'fire',
  desc: '盘踞残垣的南瓜王，肚里点着灯，本身是火、点不着：藤鞭一抽把人钉在原地，这一下是物理；远远抛来着火的南瓜，落到人身上炸开一片把人点着，烧着的挨着队友就烧过去；隔一阵召出三个会自爆的南瓜仔。血掉到一半灯芯烧尽、瓤烂透了，变成毒元素，这才点得着，出手也更快：朝人吐烂瓤，落地化成 2 格的毒云 6 秒，云里每半秒掉血、叠一层毒；火南瓜和南瓜仔落进毒云就连云炸开，云里的人各挨那一下的一倍半——南瓜落下前走出毒云',
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
  phases: [
    {
      below: 0.5,
      name: '烂瓤',
      element: 'poison',
      abilities: [vineWhip, pumpkinBomb, brood, rotSpit],
      stats: { mul: { cooldown: 0.8 } },
      effects: [{ kind: 'unstoppable', durationMs: 2000 }],
    },
  ],
} satisfies EnemyDef

export default PUMPKIN_KING
