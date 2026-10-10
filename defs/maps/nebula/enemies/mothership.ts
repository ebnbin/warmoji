import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'
import SPACE_INVADER from './spaceInvader.ts'

const tractor = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 3000,
  aim: 'nearest',
  range: 7,
  color: 0x80deea,
  fireSfx: 'hoist',
  windup: { ms: 600, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'segment', reach: 7, radius: 0.6, ms: 300, beam: true },
  onHit: [{ kind: 'pull', speed: 10, gap: 0.5 }, { kind: 'stun', durationMs: 800 }],
} satisfies AbilityDef

const volley = {
  trigger: 'auto',
  cooldownMs: 2600,
  firstDelayMs: 1200,
  aim: 'nearest',
  range: 9,
  damage: 11,
  fireSfx: 'zap',
  shape: { kind: 'bolt', projectile: shot('1f7e8', 7, 0.4), lifeMs: 1800 },
  repeat: { count: 6, spreadDeg: 90 },
} satisfies AbilityDef

const airdrop = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 6000,
  aim: 'self',
  fireSfx: 'land',
  shape: { kind: 'world' },
  onHit: [{ kind: 'summon', of: { unit: SPACE_INVADER, spread: 2 }, count: 3 }],
} satisfies AbilityDef

const bombard = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 5000,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 10,
  damage: 14,
  fireSfx: 'zap',
  shape: { kind: 'drop', targets: 5, look: { emoji: '26a1', size: 0.9 }, fromAbove: 4, dropMs: 700, staggerMs: 150 },
} satisfies AbilityDef

const MOTHERSHIP = {
  kind: 'mothership',
  role: 'boss',
  emoji: '1f6f8',
  name: '母舰',
  element: 'thunder',
  desc: '入侵者的母舰，本身是雷：电光一扇六发地齐射，打中的人出手被打断，电流再跳到身边的另一名队员，挤在一起的跑不掉；牵引光束先闪 0.6 秒，把人拉到舰前眩晕 0.8 秒，闪的时候挨一下雷、冻住或眩晕就断；隔一阵空投三只入侵者；装甲厚，护甲 8，拳脚刀枪打上去掉得少，燃烧这类不吃护甲的最管用；血掉到四成全面入侵，再往最近的五个人头上落雷，出手也更快',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 5000,
  stats: { armor: 8, exertion: 0 },
  speed: 1.2,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [tractor, volley, airdrop],
  phases: [{ below: 0.4, name: '全面入侵', abilities: [tractor, volley, airdrop, bombard], stats: { mul: { cooldown: 0.75 } } }],
} satisfies EnemyDef

export default MOTHERSHIP
