import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'
import SPORE from './spore.ts'

// 毒孢一直是毒，阶段换了元素也照样落毒云
const sporeRain = {
  trigger: 'auto',
  cooldownMs: 4500,
  firstDelayMs: 2000,
  aim: 'nearest',
  range: 9,
  damage: 14,
  element: 'poison',
  fireSfx: 'flutter',
  shape: { kind: 'drop', targets: 5, look: { emoji: '2623', size: 1 }, fromAbove: 4, dropMs: 700, staggerMs: 150 },
  onHit: [{ kind: 'ground', def: patch(1.4, 4000, 0x9ccc65, undefined, 3, 500) }],
} satisfies AbilityDef

const lash = {
  trigger: 'auto',
  cooldownMs: 2200,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 3.4,
  damage: 20,
  knockback: 1.5,
  fireSfx: 'whoosh',
  windup: { ms: 450, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 3.2, radius: 0.6, ms: 180 },
  onHit: [{ kind: 'root', durationMs: 800 }],
} satisfies AbilityDef

const fission = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 10000,
  firstDelayMs: 5000,
  aim: 'self',
  fireSfx: 'gulp',
  shape: { kind: 'world' },
  onHit: [{ kind: 'summon', of: { unit: SPORE, spread: 2 }, count: 6 }],
} satisfies AbilityDef

const SUPERBUG = {
  kind: 'superbug',
  role: 'boss',
  emoji: '1f9a0',
  name: '超级细菌',
  element: 'poison',
  desc: '培养皿里最毒的超级细菌，本身是毒，毒不倒它：往离它最近的至多五个人头上落毒孢，砸中的挨一下、加一层毒，落点留一团 1.4 格的毒云 4 秒，待在云里每半秒挨一下、一层层中毒，什么回复都不管用；抽一鞭毛把人钉住 0.8 秒，鞭毛带着它此刻的元素；隔一阵分裂出六个孢子；血掉到六成发起高热，变成火元素、霸体 2 秒、出手更勤，这时毒倒对它管用了，鞭毛却烧了起来：抽中的烧着，抽在毒云里的人身上，毒云当场爆燃，云里的人都挨一下重的；掉到三成再变异，打得更狠',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 7600,
  stats: { armor: 5, exertion: 0 },
  speed: 1.1,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [sporeRain, lash, fission],
  phases: [
    { below: 0.6, name: '高热', element: 'fire', stats: { mul: { cooldown: 0.85 } }, effects: [{ kind: 'unstoppable', durationMs: 2000 }] },
    { below: 0.3, name: '变异', stats: { mul: { cooldown: 0.85, damage: 1.3 } } },
  ],
} satisfies EnemyDef

export default SUPERBUG
