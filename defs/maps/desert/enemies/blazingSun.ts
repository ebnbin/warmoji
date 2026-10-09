import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const sunBeam = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 4500,
  firstDelayMs: 2000,
  aim: 'nearest',
  range: 8,
  damage: 18,
  fireSfx: 'zap',
  color: 0xffd54f,
  windup: { ms: 600, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'segment', reach: 8, radius: 0.5, ms: 250, beam: true },
  repeat: { count: 3, spreadDeg: 40 },
} satisfies AbilityDef

const flare = {
  trigger: 'auto',
  cooldownMs: 3600,
  firstDelayMs: 1200,
  aim: 'nearest',
  range: 9,
  damage: 15,
  fireSfx: 'ignite',
  shape: { kind: 'drop', targets: 4, look: { emoji: '1f525', size: 1 }, fromAbove: 4, dropMs: 700, staggerMs: 150 },
  onHit: [{ kind: 'ground', def: patch(1.3, 3000, 0xff7043, undefined, 4, 500) }],
} satisfies AbilityDef

const heatWave = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 8000,
  aim: 'self',
  fireSfx: 'gust',
  color: 0xff8a65,
  fxRadius: 2,
  windup: { ms: 1000, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'all', of: 'foes' },
  onHit: [{ kind: 'exhaust' }],
} satisfies AbilityDef

const stormBeam = { ...sunBeam, cooldownMs: 4000, firstDelayMs: 1200, element: 'thunder', damage: 15, color: 0xfff176 } satisfies AbilityDef

const magnetStorm = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 10000,
  firstDelayMs: 2500,
  aim: 'self',
  element: 'thunder',
  damage: 12,
  fireSfx: 'zap',
  color: 0xfff176,
  fxRadius: 2,
  windup: { ms: 800, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'all', of: 'foes' },
} satisfies AbilityDef

const supernova = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 1500,
  aim: 'self',
  element: 'fire',
  damage: 34,
  knockback: 6,
  fireSfx: 'boom',
  color: 0xffab40,
  windup: { ms: 1500, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 6, at: 'self' },
} satisfies AbilityDef

const BLAZING_SUN = {
  kind: 'blazingSun',
  role: 'boss',
  emoji: '1f31e',
  name: '烈日',
  element: 'fire',
  desc: '悬在沙海上空的烈日，本身是火、点不着：远远射出三道散开的日光，打中就点着，挨着站的会一起烧起来；往人头上落下耀斑、落处烧起一片火；隔一阵蓄力放出热浪抽干全队的体力；血掉到一半转入磁暴：本身变成雷，点得着了，改射三道电光，打中的出手被打断、电流再跳给身边另一个人，隔一阵蓄力 0.8 秒让全场各挨一道雷；血不到两成坍成超新星：贴上来，隔一阵蓄力 1.5 秒炸开身周 6 格，炸中的都被点着、被掀开',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 4800,
  stats: { armor: 3, exertion: 0 },
  speed: 1,
  damage: 17,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'standoff', standoffDist: 4.5 },
  abilities: [sunBeam, flare, heatWave],
  phases: [
    { below: 0.5, name: '磁暴', element: 'thunder', abilities: [stormBeam, magnetStorm] },
    { below: 0.2, name: '超新星', drive: { kind: 'chase' }, abilities: [stormBeam, magnetStorm, supernova] },
  ],
} satisfies EnemyDef

export default BLAZING_SUN
