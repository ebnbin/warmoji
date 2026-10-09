import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { zoneLook } from '../../../kit.ts'

// 🐫 双峰驼：驼峰撞开挡路的，边打边从驼峰里匀出水来回血，第三下立起沙墙；技能扬起沙尘护住自己
const bactrianButt = {
  trigger: 'auto',
  cooldownMs: 1150,
  aim: 'nearest',
  range: 2,
  damage: 17,
  knockback: 3,
  fireSfx: 'thud',
  shape: { kind: 'sector', radius: 1.9, arcDeg: 110, ms: 180 },
} satisfies AbilityDef

const humpWater = { kind: 'mend', amount: 3, tickMs: 500, durationMs: 2000 } as const

const bactrianButt2 = { ...bactrianButt, reactions: [{ on: 'fire', to: 'self', effects: [humpWater] }] } satisfies AbilityDef

const sandWall = { kind: 'barrier', shape: 'wall', length: 2.5, offset: 1.2, durationMs: 3000, bodies: 'foes', shots: true, color: 0xd7b98e } as const

const bactrianButt3 = {
  ...bactrianButt2,
  cycle: [bactrianButt2, { ...bactrianButt, reactions: [{ on: 'fire', to: 'self', effects: [humpWater, sandWall] }] }],
} satisfies AbilityDef

const bactrianDust = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'gust',
  shape: { kind: 'zone', radius: 3, durationMs: 5000, tickMs: 500, visual: zoneLook(0xd7b98e) },
  onHit: [{ kind: 'disarm', durationMs: 600 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'guard', mul: 0.6, durationMs: 5000 }] }],
} satisfies AbilityDef

export const abilities = { bactrianButt, bactrianButt2, bactrianButt3, bactrianDust } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.2 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f42b',
  name: '双峰驼',
  element: 'earth',
  desc: '在沙海里走得最稳的双峰驼：驼峰撞开挡路的敌人，边打边从驼峰里匀出水来回血，每第三下在身前立起一道沙墙；技能扬起一片沙尘，沙尘里的敌人打不出手，自己也少挨打',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.7 },
  stats: { moveSpeed: 4, maxStamina: 150, staminaRegen: 45, exertion: 0.7 },
  skill: { name: '沙尘护体', icon: '1f32b', desc: '在脚下扬起 3 格的沙尘 5 秒：沙尘里的敌人睁不开眼、打不出手；自己 5 秒内受到的伤害 ×0.6', cdMs: 14_000, ability: 'bactrianDust' },
  weapons: [],
  innate: [
    {
      name: '驼峰撞',
      icon: '1f42b',
      base: 'bactrianButt',
      upgrades: [
        { ability: 'bactrianButt2', card: { icon: '1fad7', name: '驼峰储水', desc: '每撞一下，2 秒里每半秒回 3 点血' } },
        { ability: 'bactrianButt3', card: { icon: '1f9f1', name: '沙墙', desc: '每第三下在身前 1.2 格立起一道 2.5 格长的沙墙 3 秒，挡住敌人和敌人射来的弹' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
