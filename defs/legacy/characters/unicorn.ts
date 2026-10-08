import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const hornThrust = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  fireSfx: 'whoosh',
  damage: 26,
  knockback: 9,
  shape: { kind: 'segment', reach: 2.2, radius: 0.6, ms: 220, lungeDist: 1.0 },
} satisfies AbilityDef

const rainbowRush = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  damage: 28,
  knockback: 10,
  color: 0xff8ad8,
  shape: { kind: 'sprint', distance: 3.5, ms: 240, radius: 0.8 },
} satisfies AbilityDef

const hornThrust2 = {
  ...hornThrust,
  repeat: { count: 2, delayMs: 170, reaim: 'nearest' },
} satisfies AbilityDef

const hornThrust3 = {
  ...hornThrust2,
  onHit: [
    { kind: 'blast', radius: 1.1, ratio: 0.6, knockback: 11.25, ring: { color: 0xff8ad8, fillAlpha: 0.3, lineWidth: 4, lineAlpha: 0.9, durMs: 260 } },
  ],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  hornThrust,
  hornThrust2,
  hornThrust3,
  rainbowRush,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 25 }, mul: { damage: 1.25 } }, { add: { maxHp: 50 }, mul: { damage: 1.55 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f984',
  name: '独角驹',
  desc: '独角向前突刺，穿透沿途敌人',
  role: 'bruiser',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 1 },
  stats: { moveSpeed: 7.56, maxStamina: 130, staminaRegen: 55, exertion: 0.9 },
  skill: { name: '彩虹冲锋', icon: '1f308', desc: '朝指定方向冲刺三格半，沿途敌人受伤并被撞开', cdMs: 5000, ability: 'rainbowRush', aim: true },
  weapons: [],
  innate: [
    {
      name: '独角突刺',
      icon: '2694',
      base: 'hornThrust',
      upgrades: [
        { ability: 'hornThrust2', card: { icon: '26a1', name: '二连突刺', desc: '每次出手连刺两段，第二段重新索敌' } },
        { ability: 'hornThrust3', card: { icon: '1f308', name: '虹光震波', desc: '突刺终点爆发冲击波：60% 范围伤害并强力击退' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
