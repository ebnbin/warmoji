import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, shot } from '../../../kit.ts'

const club = {
  trigger: 'auto',
  cooldownMs: 1800,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 2.8,
  damage: 22,
  knockback: 3,
  element: 'physical',
  fireSfx: 'whoosh',
  windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 2.8, arcDeg: 150, ms: 220 },
} satisfies AbilityDef

const blazingClub = { ...club, damage: 18, element: 'fire', fireSfx: 'ignite', color: 0xff7043 } satisfies AbilityDef

const slam = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 5000,
  firstDelayMs: 3000,
  aim: 'nearest',
  range: 5.5,
  damage: 24,
  fireSfx: 'jump',
  color: 0xff7043,
  windup: { ms: 700, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'leap', distance: 4, ms: 600, height: 1.8, radius: 2 },
  onHit: [{ kind: 'ground', def: patch(2, 3000, 0xff7043, undefined, 4, 500) }],
} satisfies AbilityDef

const rock = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 6500,
  firstDelayMs: 4500,
  aim: 'nearest',
  range: 8,
  damage: 18,
  element: 'physical',
  fireSfx: 'thud',
  windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'bolt', projectile: { ...shot('1faa8', 7, 0.8), flight: { kind: 'arc', peakM: 2.4 }, split: { count: 3, spreadDeg: 90, ratio: 0.5 } }, lifeMs: 1300 },
} satisfies AbilityDef

const ONI = {
  kind: 'oni',
  role: 'boss',
  emoji: '1f479',
  name: '赤鬼',
  element: 'fire',
  desc: '从石组后头闯出来的赤鬼，一身鬼火，贴着它的都会着：抡起狼牙棒扫开身前一大片，抓起石头扔过来，石头落地碎成三块四下乱飞，这两下都是实打实的物理，冻住的挨一下就碎；跳起来砸地带着火，砸中的人烧起来，落处烧起一片火，烧 3 秒，着了火的会烧到贴着的队友，挤在一起最吃亏；泡在溪里湿着的人点不着，可它个子大，蹚得过去。本身是火，点不着、不怕岩浆；护甲厚，刀砍棒敲打不痛，毒能渗进去。血掉到四成就鬼怒：3 秒内什么都拦不住，从此打得更狠、追得更快，狼牙棒也冒了火，扫中的都烧起来',
  size: 3.3,
  radius: 1.1,
  span: [0, 6],
  hp: 2700,
  stats: { armor: 6, exertion: 0 },
  speed: 1.1,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [club, slam, rock],
  phases: [{ below: 0.4, name: '鬼怒', abilities: [blazingClub, slam, rock], stats: { mul: { damage: 1.3, moveSpeed: 1.25 } }, effects: [{ kind: 'unstoppable', durationMs: 3000 }] }],
} satisfies EnemyDef

export default ONI
