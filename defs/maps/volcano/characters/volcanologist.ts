import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { ring } from '../../../kit.ts'

// 🧑‍🔬 火山学家：把采样弹抛到敌人头上，落地炸开一圈；技能召来一场雷暴，劈中的都麻一下
const volcanologistSample = {
  trigger: 'auto',
  cooldownMs: 1250,
  aim: 'nearest',
  range: 7,
  damage: 17,
  fireSfx: 'shoot',
  shape: { kind: 'drop', targets: 1, look: { emoji: '1f9ea', size: 0.6 }, fromAbove: 3, dropMs: 500, staggerMs: 0 },
  onHit: [{ kind: 'blast', radius: 1.6, ratio: 1, knockback: 1, ring: ring(0xffd54f) }],
} satisfies AbilityDef

const volcanologistSample2 = {
  ...volcanologistSample,
  onHit: [...volcanologistSample.onHit, { kind: 'to', who: { side: 'foes', radius: 1.6 }, then: [{ kind: 'stun', durationMs: 300 }] }],
} satisfies AbilityDef

const volcanologistSample3 = { ...volcanologistSample2, repeat: { count: 2, delayMs: 250, ratio: 0.7, reaim: 'nearest' } } satisfies AbilityDef

const volcanologistStorm = {
  trigger: 'manual',
  aim: 'nearest',
  range: 9,
  damage: 26,
  fireSfx: 'zap',
  shape: { kind: 'drop', targets: 5, look: { emoji: '26a1', size: 1 }, fromAbove: 4, dropMs: 450, staggerMs: 120 },
  onHit: [{ kind: 'stun', durationMs: 500 }],
} satisfies AbilityDef

export const abilities = { volcanologistSample, volcanologistSample2, volcanologistSample3, volcanologistStorm } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f52c',
  name: '火山学家',
  element: 'thunder',
  desc: '扛着仪器上山的火山学家：把采样弹抛到最近的敌人头上，砸中它再炸开一圈，波及身边的；技能召来一场雷暴，劈在最近的五个敌人头上',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.4, maxStamina: 100, staminaRegen: 65, exertion: 1 },
  skill: { name: '雷暴观测', icon: '1f4e1', desc: '在最近的五个敌人头上各劈一道闪电，劈中的麻 0.5 秒', cdMs: 13_000, ability: 'volcanologistStorm' },
  weapons: [],
  innate: [
    {
      name: '采样弹',
      icon: '1f9ea',
      base: 'volcanologistSample',
      upgrades: [
        { ability: 'volcanologistSample2', card: { icon: '1f4a5', name: '震荡', desc: '炸开时 1.6 格内的敌人都麻 0.3 秒' } },
        { ability: 'volcanologistSample3', card: { icon: '1f501', name: '连环', desc: '隔 0.25 秒往最近的敌人头上再抛一发，七成伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
