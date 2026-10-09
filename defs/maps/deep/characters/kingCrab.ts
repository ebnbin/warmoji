import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🦀 帝王蟹：大钳一夹把敌人钉在原地，每第三下把它拽到身前；技能竖起甲壳，把身边的敌人都招到自己身上
const kingCrabClaw = {
  trigger: 'auto',
  cooldownMs: 1150,
  aim: 'nearest',
  range: 1.9,
  damage: 17,
  fireSfx: 'clank',
  shape: { kind: 'segment', reach: 1.8, radius: 0.6, ms: 160 },
  onHit: [{ kind: 'root', durationMs: 800 }],
} satisfies AbilityDef

const kingCrabClaw2 = {
  ...kingCrabClaw,
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'frontGuard', arcDeg: 120, durationMs: 1200 }] }],
} satisfies AbilityDef

const kingCrabHaul = {
  ...kingCrabClaw2,
  color: 0xa1887f,
  onHit: [{ kind: 'pull', speed: 12, gap: 0.8 }, { kind: 'root', durationMs: 1200 }],
} satisfies AbilityDef

const kingCrabClaw3 = { ...kingCrabClaw2, cycle: [kingCrabClaw2, kingCrabHaul] } satisfies AbilityDef

const kingCrabFortress = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'clank',
  color: 0xa1887f,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 3000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.3, ms: 5000 }] }],
} satisfies AbilityDef

export const abilities = { kingCrabClaw, kingCrabClaw2, kingCrabClaw3, kingCrabFortress } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.2 } }, { add: { maxHp: 60, armor: 4 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f980',
  name: '帝王蟹',
  element: 'earth',
  desc: '披着厚甲的帝王蟹，走得慢、推不太动：大钳一夹把敌人钉在原地 0.8 秒；技能竖起甲壳挂上护盾，把身边的敌人都招到自己身上',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 3.9, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: { name: '铁甲阵', icon: '1f3f0', desc: '竖起甲壳：挂上生命 30% 的护盾 5 秒，4 格内的敌人嘲讽 3 秒', cdMs: 12_000, ability: 'kingCrabFortress' },
  weapons: [],
  innate: [
    {
      name: '巨钳',
      icon: '1f980',
      base: 'kingCrabClaw',
      upgrades: [
        { ability: 'kingCrabClaw2', card: { icon: '1f6e1', name: '甲壳', desc: '每次出手后 1.2 秒内，正面 120 度以内来的命中全部挡下' } },
        { ability: 'kingCrabClaw3', card: { icon: '1fa9d', name: '钳拽', desc: '每第三下把夹住的敌人拽到身前，定身改成 1.2 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
