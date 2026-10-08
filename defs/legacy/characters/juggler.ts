import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const tomatoThrow = {
  trigger: 'auto',
  cooldownMs: 450,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 22,
  knockback: 3.5,
  shape: {
    kind: 'bolt',
    projectile: { look: { emoji: '1f345', size: 0.55, rotationOffsetDeg: 0 }, radius: 0.18, speed: 12, flight: { kind: 'arc', peakM: 1.4 } },
    lifeMs: 2000,
  },
} satisfies AbilityDef

const jugglerDance = {
  trigger: 'manual',
  aim: 'self',
  shape: { kind: 'all', of: 'foes' },
  onHit: [{ kind: 'stun', durationMs: 2500 }],
} satisfies AbilityDef

const tomatoThrow2 = {
  ...tomatoThrow,
  repeat: { count: 3, spreadDeg: 18 },
} satisfies AbilityDef

const tomatoThrow3 = {
  ...tomatoThrow2,
  onHit: [
    { kind: 'blast', radius: 0.9, ratio: 0.6, knockback: 0, ring: { color: 0xef5350, fillAlpha: 0.25, lineWidth: 3, lineAlpha: 0.8, durMs: 220 } },
  ],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  tomatoThrow,
  tomatoThrow2,
  tomatoThrow3,
  jugglerDance,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 15 }, mul: { damage: 1.2 } }, { add: { maxHp: 35 }, mul: { damage: 1.45, cooldown: 0.9 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f939',
  name: '杂耍演员',
  desc: '向最近的敌人连续抛掷番茄',
  role: 'ranged',
  tags: ['damage', 'control', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 6, maxStamina: 110, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '全场蹦迪', icon: '1f57a', desc: '全场敌人跟着蹦迪两秒半，期间失去行动', cdMs: 16_000, ability: 'jugglerDance' },
  weapons: [],
  innate: [
    {
      name: '番茄连投',
      icon: '1f345',
      base: 'tomatoThrow',
      upgrades: [
        { ability: 'tomatoThrow2', card: { icon: '1f345', name: '三重抛掷', desc: '每次投掷同时抛出 3 枚番茄，扇形散开' } },
        { ability: 'tomatoThrow3', card: { icon: '1f4a5', name: '爆浆番茄', desc: '番茄命中后爆裂，对周围敌人造成 60% 溅射伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
