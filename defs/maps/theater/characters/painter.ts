import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍🎨 布景画师：立起会泼颜料的画，颜料把敌人染成水元素；技能画出两个以假乱真的自己
const paintShot = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 6,
  damage: 8,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f3a8', 9, 0.4), lifeMs: 1100 },
  onHit: [{ kind: 'attune', element: 'water', ms: 3000 }],
} satisfies AbilityDef

const easel = (ability: AbilityDef, maxAlive: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 4400,
    aim: 'self',
    fireSfx: 'recruit',
    shape: { kind: 'emplace', count: 1, maxAlive, lifeMs: 12000, look: { emoji: '1f5bc', size: 0.9 }, ability },
  }) satisfies AbilityDef

const painterEasel = easel(paintShot, 2)
const painterEasel2 = easel(paintShot, 3)
const painterEasel3 = easel({ ...paintShot, onHit: [...paintShot.onHit, { kind: 'slow', factor: 0.8, durationMs: 1000 }] }, 3)

const painterDouble = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'warp',
  shape: { kind: 'world' },
  onHit: [{ kind: 'summon', of: { clone: { dmgRatio: 0.6 } }, count: 2, lifeMs: 8000, hpRatio: 0.4 }],
} satisfies AbilityDef

export const abilities = { painterEasel, painterEasel2, painterEasel3, painterDouble } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f3a8',
  name: '布景画师',
  element: 'water',
  desc: '给舞台画布景的画师：走到哪就立起会泼颜料的画，颜料把敌人染成水元素，好让队友的冰与雷打得更狠；技能画出两个以假乱真的自己',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: { name: '以假乱真', icon: '1fa9e', desc: '画出 2 个自己的分身 8 秒：分身也会立画，伤害是自己的六成，生命是自己的四成', cdMs: 15_000, ability: 'painterDouble' },
  weapons: [],
  innate: [
    {
      name: '画个帮手',
      icon: '1f5bc',
      base: 'painterEasel',
      upgrades: [
        { ability: 'painterEasel2', card: { icon: '1f58c', name: '多画几幅', desc: '最多同时立三幅画' } },
        { ability: 'painterEasel3', card: { icon: '1f30a', name: '水彩', desc: '颜料打中的敌人 1 秒内走得慢两成' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
