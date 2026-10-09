import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🌟 小星星：在敌群里炸开一团星光，升级后炸瞎敌人、炸得更大；技能召来一场流星雨
const starlingBurst = {
  trigger: 'auto',
  cooldownMs: 1050,
  aim: 'nearest',
  range: 6,
  damage: 16,
  fireSfx: 'plip',
  color: 0xfff59d,
  shape: { kind: 'disc', radius: 2.2, at: 'target' },
} satisfies AbilityDef

const starlingBurst2 = { ...starlingBurst, onHit: [{ kind: 'disarm', durationMs: 500 }] } satisfies AbilityDef

const starlingBurst3 = { ...starlingBurst2, shape: { kind: 'disc', radius: 2.8, at: 'target' } } satisfies AbilityDef

const starlingRain = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 24,
  fireSfx: 'streak',
  shape: { kind: 'drop', targets: 7, look: { emoji: '2b50', size: 0.9 }, fromAbove: 4, dropMs: 500, staggerMs: 90 },
  onHit: [{ kind: 'blast', radius: 1, ratio: 0.5, knockback: 0, ring: ring(0xfff59d) }],
} satisfies AbilityDef

export const abilities = { starlingBurst, starlingBurst2, starlingBurst3, starlingRain } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2 } }, { add: { maxHp: 25 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f31f',
  name: '小星星',
  element: 'light',
  desc: '一闪一闪的小星星：在最近的敌人身上炸开一团星光，一炸一片，升级后还能炸瞎敌人、炸得更大；技能召来一场流星雨',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '流星雨', icon: '1f320', desc: '在最近的七个敌人头上各落一颗星：砸中的挨 24 点，它 1 格内的其他敌人挨一半；目标先倒下的那颗落空', cdMs: 13_000, ability: 'starlingRain' },
  weapons: [],
  innate: [
    {
      name: '星光爆',
      icon: '1f31f',
      base: 'starlingBurst',
      upgrades: [
        { ability: 'starlingBurst2', card: { icon: '2734', name: '星芒', desc: '炸到的敌人致盲 0.5 秒，普通出手与接触都打不出去' } },
        { ability: 'starlingBurst3', card: { icon: '1f386', name: '超新星', desc: '星光爆的半径从 2.2 格变成 2.8 格' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
