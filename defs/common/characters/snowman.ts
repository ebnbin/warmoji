import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const frostAura = {
  trigger: 'auto',
  cooldownMs: 0,
  aim: 'self',
  color: 0x81d4fa,
  shape: {
    kind: 'zone',
    radius: 3,
    durationMs: 0,
    tickMs: 500,
    follow: true,
    visual: { color: 0x81d4fa, fillAlpha: 0.08, lineAlpha: 0.35, lineWidth: 2, enterMs: 0 },
  },
  onHit: [{ kind: 'slow', factor: 0.5, durationMs: 600 }],
} satisfies AbilityDef

const snowmanFreeze = {
  trigger: 'manual',
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'timeStop', durationMs: 8000 }],
} satisfies AbilityDef

const frostAura2 = { ...frostAura, damage: 3 } satisfies AbilityDef

const frostAura3 = {
  ...frostAura2,
  shape: { ...frostAura.shape, pulse: { intervalMs: 5000, onHit: [{ kind: 'slow', factor: 0, durationMs: 700 }] } },
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  frostAura,
  frostAura2,
  frostAura3,
  snowmanFreeze,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 50 }, mul: { damage: 1.15 } }, { add: { maxHp: 120 }, mul: { damage: 1.3 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '26c4',
  name: '雪人',
  desc: '以自己为中心散发寒气，持续减速范围内的敌人',
  role: 'controller',
  tags: ['control', 'area'],
  body: { drag: 5, mass: 1.5 },
  stats: { moveSpeed: 3.5, maxStamina: 90, staminaRegen: 50, exertion: 1.1, armor: 3 },
  skill: { name: '时停', icon: '23f3', desc: '时间停止八秒，静止时全场近乎凝固', cdMs: 25_000, ability: 'snowmanFreeze' },
  weapons: [],
  innate: [
    {
      name: '寒气光环',
      icon: '2744',
      base: 'frostAura',
      upgrades: [
        { ability: 'frostAura2', card: { icon: '1fa79', name: '冻伤', desc: '寒气光环每秒对范围内敌人造成 6 点伤害' } },
        { ability: 'frostAura3', card: { icon: '1f328', name: '凛冬降临', desc: '每 5 秒光环脉冲一次，冻结范围内敌人 0.7 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
