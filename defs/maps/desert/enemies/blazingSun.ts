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
  damage: 22,
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
  damage: 18,
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

const darkBeam = { ...sunBeam, cooldownMs: 4000, firstDelayMs: 1200, color: 0x7e57c2 } satisfies AbilityDef

const eclipse = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 10000,
  firstDelayMs: 2500,
  aim: 'self',
  fireSfx: 'snuff',
  color: 0x311b92,
  fxRadius: 2,
  windup: { ms: 800, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'all', of: 'foes' },
  onHit: [{ kind: 'disarm', durationMs: 1500 }],
} satisfies AbilityDef

const supernova = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 1500,
  aim: 'self',
  damage: 40,
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
  desc: '悬在沙海上空的烈日：远远射出三道散开的日光，往人头上落下耀斑、落处烧起一片火，隔一阵蓄力放出热浪抽干全队的体力；血掉到一半转入日蚀：不再落耀斑、放热浪，改射暗光束，还会让全场眼前一黑 1.5 秒；血不到两成坍成超新星：贴上来，隔一阵蓄力 1.5 秒炸开身周 6 格',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 4800,
  stats: { armor: 3, exertion: 0 },
  speed: 1,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'standoff', standoffDist: 4.5 },
  abilities: [sunBeam, flare, heatWave],
  phases: [
    { below: 0.5, name: '日蚀', abilities: [darkBeam, eclipse] },
    { below: 0.2, name: '超新星', drive: { kind: 'chase' }, abilities: [darkBeam, eclipse, supernova] },
  ],
} satisfies EnemyDef

export default BLAZING_SUN
