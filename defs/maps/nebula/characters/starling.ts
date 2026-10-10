import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🌟 小星星：在敌群里炸开一团星火，炸到的烧起来，挤在一起的互相燎着，升级后炸瞎敌人、炸得更大；技能召来一场砸石头的流星雨
const starlingBurst = {
  trigger: 'auto',
  cooldownMs: 1050,
  aim: 'nearest',
  range: 6,
  damage: 13,
  fireSfx: 'plip',
  color: 0xffb74d,
  shape: { kind: 'disc', radius: 2.2, at: 'target' },
} satisfies AbilityDef

const starlingBurst2 = { ...starlingBurst, onHit: [{ kind: 'disarm', durationMs: 500 }] } satisfies AbilityDef

const starlingBurst3 = { ...starlingBurst2, shape: { kind: 'disc', radius: 2.8, at: 'target' } } satisfies AbilityDef

const starlingRain = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  element: 'physical',
  damage: 26,
  knockback: 2,
  fireSfx: 'streak',
  shape: { kind: 'drop', targets: 7, look: { emoji: '1faa8', size: 0.9 }, fromAbove: 4, dropMs: 500, staggerMs: 90 },
  onHit: [{ kind: 'blast', radius: 1, ratio: 0.5, knockback: 1, ring: ring(0xbcaaa4) }],
} satisfies AbilityDef

export const abilities = { starlingBurst, starlingBurst2, starlingBurst3, starlingRain } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2 } }, { add: { maxHp: 25 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f31f',
  name: '小星星',
  element: 'fire',
  desc: '一闪一闪的小星星，本身是火，点不着：在最近的敌人身上炸开一团星火，一炸一片，炸到的都烧起来，挤在一起的会互相燎着，升级后还能炸瞎敌人、炸得更大；技能召来一场流星雨，砸下来的是石头，实打实的物理，冻住的当场砸碎',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '流星雨', icon: '1f320', desc: '在最近的七个敌人头上各落一块陨石：砸中的挨 26 点物理伤害并被砸开，它 1 格内的其他敌人挨一半；目标先倒下的那块落空', cdMs: 13_000, ability: 'starlingRain' },
  weapons: [],
  innate: [
    {
      name: '星火爆',
      icon: '1f31f',
      base: 'starlingBurst',
      upgrades: [
        { ability: 'starlingBurst2', card: { icon: '2734', name: '星芒', desc: '炸到的敌人致盲 0.5 秒，普通出手与接触都打不出去' } },
        { ability: 'starlingBurst3', card: { icon: '1f386', name: '超新星', desc: '星火爆的半径从 2.2 格变成 2.8 格' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
