import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, shot, zoneLook } from '../../../kit.ts'

const dive = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 7,
  damage: 30,
  knockback: 3,
  color: 0xff7043,
  fireSfx: 'jump',
  when: { kind: 'not', cond: { kind: 'within', who: 'target', radius: 3.5 } },
  windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'leap', distance: 6, ms: 650, height: 2.5, radius: 2.2 },
  onHit: [{ kind: 'ground', def: patch(2, 3000, 0xff7043, undefined, 5, 500) }],
} satisfies AbilityDef

const plumes = {
  trigger: 'auto',
  cooldownMs: 3600,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 9,
  damage: 12,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: { ...shot('1fab6', 6, 0.55, 45), flight: { kind: 'homing', degPerSec: 120 } }, lifeMs: 2600 },
  repeat: { count: 5, spreadDeg: 60 },
} satisfies AbilityDef

const wings = {
  trigger: 'auto',
  cooldownMs: 2600,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 3.4,
  damage: 20,
  knockback: 2,
  color: 0xff7043,
  fireSfx: 'whoosh',
  windup: { ms: 450, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3.4, arcDeg: 200, ms: 240 },
} satisfies AbilityDef

const blaze = {
  trigger: 'auto',
  cooldownMs: 0,
  firstDelayMs: 0,
  aim: 'self',
  damage: 4,
  fireSfx: 'ignite',
  shape: { kind: 'zone', radius: 3.5, durationMs: 0, tickMs: 500, follow: true, visual: zoneLook(0xff7043) },
} satisfies AbilityDef

const PHOENIX = {
  kind: 'phoenix',
  role: 'boss',
  emoji: '1f426_200d_1f525',
  name: '不死鸟',
  element: 'fire',
  desc: '浴火的不死鸟，不怕岩浆：火翼一扇扫开大半圈，撒出一把会拐弯追人的火羽，人离得远了就腾空俯冲过去，砸中人时落点烧起一片火；第一次被打倒会浴火重生，回四成血、无敌两秒；血掉到一半后出手更快，身周常燃一圈火场，靠近的人每半秒挨烫',
  size: 3.3,
  radius: 1.05,
  span: [0, 6],
  hp: 6400,
  stats: { exertion: 0 },
  speed: 1.4,
  damage: 18,
  xp: 60,
  coins: 60,
  traits: ['fireproof', 'anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [dive, plumes, wings],
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'healRatio', ratio: 0.4 }, { kind: 'invuln', ms: 2000 }] }],
  phases: [{ below: 0.5, name: '烈焰', abilities: [dive, plumes, wings, blaze], stats: { mul: { cooldown: 0.8 } } }],
} satisfies EnemyDef

export default PHOENIX
