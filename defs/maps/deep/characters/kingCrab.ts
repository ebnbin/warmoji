import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch } from '../../../kit.ts'

// 🦀 帝王蟹：本身是冰、冻不住；大钳带着寒气，夹满三下冻住，湿的一夹就冻；技能竖起甲壳挂上护盾，把身边的敌人都招到自己身上，脚下冒出一片寒气
const kingCrabClaw = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 1.9,
  damage: 15,
  fireSfx: 'clank',
  shape: { kind: 'segment', reach: 1.8, radius: 0.6, ms: 160 },
} satisfies AbilityDef

const kingCrabClaw2 = {
  ...kingCrabClaw,
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'frontGuard', arcDeg: 120, durationMs: 1200 }] }],
} satisfies AbilityDef

const kingCrabHaul = {
  ...kingCrabClaw2,
  color: 0x80deea,
  onHit: [{ kind: 'pull', speed: 12, gap: 0.8 }],
} satisfies AbilityDef

const kingCrabClaw3 = { ...kingCrabClaw2, cycle: [kingCrabClaw2, kingCrabHaul] } satisfies AbilityDef

// 寒气每秒才跳一下：跳得再快，站进来的敌人一眨眼就冻住
const kingCrabFortress = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'clank',
  color: 0x80deea,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 3000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.25, ms: 5000 }, { kind: 'ground', def: patch(2.2, 4000, 0x80deea, undefined, 0, 1000) }] }],
} satisfies AbilityDef

export const abilities = { kingCrabClaw, kingCrabClaw2, kingCrabClaw3, kingCrabFortress } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.2 } }, { add: { maxHp: 60, armor: 4 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f980',
  name: '帝王蟹',
  element: 'ice',
  desc: '冰海里长大的帝王蟹，本身是冰、冻不住，披着厚甲，走得慢、推不太动：大钳带着寒气，夹中的冷一层、走慢，3 秒内夹满三下冻住 1.5 秒，湿的一夹就冻住，冻住的留给队友一下敲碎；技能竖起甲壳挂上护盾，把身边的敌人都招到自己身上，脚下冒出一片寒气',
  role: 'tank',
  tags: ['defense', 'melee', 'control'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 3.9, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: { name: '铁甲阵', icon: '1f3f0', desc: '竖起甲壳：挂上生命 25% 的护盾 5 秒，4 格内的敌人嘲讽 3 秒；脚下 2.2 格冒出寒气 4 秒，里面的敌人每秒冷一层', cdMs: 12_000, ability: 'kingCrabFortress' },
  weapons: [],
  innate: [
    {
      name: '寒钳',
      icon: '1f980',
      base: 'kingCrabClaw',
      upgrades: [
        { ability: 'kingCrabClaw2', card: { icon: '1f6e1', name: '甲壳', desc: '每次出手后 1.2 秒内，正面 120 度以内来的命中全部挡下' } },
        { ability: 'kingCrabClaw3', card: { icon: '1fa9d', name: '钳拽', desc: '每第三下把夹住的敌人拽到身前' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
