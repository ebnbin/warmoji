import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import type { WeaponSource } from '../../../src/types/weapons'

const shadowStrike = {
  trigger: 'auto',
  cooldownMs: 3600,
  aim: 'strongest',
  fireSfx: 'whoosh',
  range: 6,
  damage: 85,
  knockback: 6,
  held: { look: { emoji: '1f5e1', size: 0.7, rotationOffsetDeg: 135 }, restOffset: 0.42 },
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 400 },
} satisfies AbilityDef

const shadowVeil = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'whoosh',
  shape: { kind: 'all', of: 'allies', downed: true },
  onHit: [{ kind: 'hide', durationMs: 2200 }],
} satisfies AbilityDef

const shadowStrike2 = {
  ...shadowStrike,
  onHit: [{ kind: 'blast', radius: 1.0, ratio: 0.6, knockback: 3.6 }],
} satisfies AbilityDef

const shadowStrike3 = {
  ...shadowStrike2,
  shape: { ...shadowStrike.shape, execute: { hpRatio: 0.35, mul: 2 } },
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  shadowStrike,
  shadowStrike2,
  shadowStrike3,
  shadowVeil,
} satisfies Record<string, AbilityDef>

/** 这名角色的武器 */
export const weapons = {
  dagger: {
    name: '影袭',
    emoji: '1f5e1',
    base: 'shadowStrike',
    upgrades: [
      { ability: 'shadowStrike2', card: { icon: '1f300', name: '连环刃', desc: '斩击同时命中目标周围一圈，波及 60% 伤害' } },
      { ability: 'shadowStrike3', card: { icon: '2620', name: '处决', desc: '目标血量低于 35% 时，斩击伤害翻倍' } },
    ],
  },
} as const satisfies Record<string, WeaponSource>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { crit: 0.1 }, mul: { damage: 1.3 } }, { add: { crit: 0.2, maxHp: 20 }, mul: { damage: 1.6 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f977',
  name: '忍者',
  desc: '瞬移到范围内血最厚的敌人背后重斩一刀，再闪回原位；出手瞬间无敌',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.7 },
  stats: { moveSpeed: 8, maxStamina: 80, staminaRegen: 95, exertion: 1 },
  skill: { name: '影遁', icon: '1f32b', desc: '两秒多内全队不被敌人锁定，敌人只会乱走', cdMs: 14_000, ability: 'shadowVeil' },
  weapons: ['dagger'],
  innate: [],
} as const satisfies CharacterAuthoring
