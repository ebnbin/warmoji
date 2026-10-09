import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐎 骏马：后蹄把贴上来的踢飞，朝一个方向奔腾冲出一条路，被控住了也奔得出去；靠吸血续航，中了毒就吸不回来
const horseKick = {
  trigger: 'auto',
  cooldownMs: 950,
  aim: 'nearest',
  range: 2.1,
  damage: 24,
  knockback: 4,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 2, radius: 0.5, ms: 150 },
} satisfies AbilityDef

const horseKick2 = {
  ...horseKick,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'status', status: 'speed', ms: 3000, value: 1.3 }] }],
} satisfies AbilityDef

const horseKick3 = { ...horseKick2, repeat: { count: 2, delayMs: 200, ratio: 0.8 } } satisfies AbilityDef

const horseGallop = {
  trigger: 'manual',
  aim: 'stick',
  damage: 40,
  knockback: 6,
  breach: 1.5,
  fireSfx: 'charge',
  shape: { kind: 'sprint', distance: 6, ms: 450, radius: 0.8 },
  onHit: [{ kind: 'stun', durationMs: 600 }],
  reactions: [{ on: 'cast', to: 'self', effects: [{ kind: 'unstoppable', durationMs: 600 }] }],
} satisfies AbilityDef

export const abilities = { horseKick, horseKick2, horseKick3, horseGallop } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.06 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f40e',
  name: '骏马',
  desc: '一阵风似的骏马：后蹄把贴上来的踢飞，朝一个方向奔腾冲出一条路，被控住了也奔得出去；靠踢中吸血续航，中了毒就吸不回来',
  role: 'bruiser',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 1.4 },
  stats: { moveSpeed: 6.6, maxStamina: 130, staminaRegen: 65, exertion: 0.9 },
  skill: { name: '奔腾', icon: '1f3c7', desc: '解掉身上的控制，朝摇杆方向奔出 6 格，奔的时候霸体；沿路撞飞敌人、眩晕 0.6 秒，挡路的矮墙一并撞开', cdMs: 10_000, ability: 'horseGallop', aim: true },
  weapons: [],
  innate: [
    {
      name: '后踢',
      icon: '1f40e',
      base: 'horseKick',
      upgrades: [
        { ability: 'horseKick2', card: { icon: '1f4a8', name: '疾驰', desc: '踢死敌人后 3 秒内移速 ×1.3' } },
        { ability: 'horseKick3', card: { icon: '1f9b6', name: '连环踢', desc: '每次连踢两下，第二下八成伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
