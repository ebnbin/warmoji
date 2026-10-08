import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🧞 灯神：火从神灯里出来，灯在哪火就从哪来
const genieFlame = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  fireSfx: 'shoot',
  range: 7,
  damage: 16,
  knockback: 2,
  anchor: { look: { emoji: '1fa94', size: 0.7 }, mode: 'orbit', distance: 1.8 },
  shape: { kind: 'bolt', projectile: shot('1f525', 10), lifeMs: 1800 },
} satisfies AbilityDef

const genieFlame2 = { ...genieFlame, anchor: { look: { emoji: '1fa94', size: 0.7 }, mode: 'trail', distance: 0 } } satisfies AbilityDef

const genieFlame3 = { ...genieFlame, anchor: { look: { emoji: '1fa94', size: 0.7 }, mode: 'ally', distance: 1 } } satisfies AbilityDef

const genieWish = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xb388ff,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'spellShield', count: 3, durationMs: 8000 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  genieFlame,
  genieFlame2,
  genieFlame3,
  genieWish,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 15 }, mul: { damage: 1.25 } }, { add: { maxHp: 35 }, mul: { damage: 1.5 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9de',
  name: '灯神',
  desc: '火焰从神灯里喷出，灯在哪火就从哪来',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.2, maxStamina: 90, staminaRegen: 80, exertion: 0.7 },
  skill: { name: '三个愿望', icon: '2728', desc: '全队获得三层法术护盾八秒，每层挡下一次命中', cdMs: 18_000, ability: 'genieWish' },
  weapons: [],
  innate: [
    {
      name: '灯火',
      icon: '1fa94',
      base: 'genieFlame',
      upgrades: [
        { ability: 'genieFlame2', card: { icon: '1f463', name: '灯影', desc: '神灯改为落在灯神一秒半前走过的地方，火从那里喷出' } },
        { ability: 'genieFlame3', card: { icon: '1f91d', name: '灯随人护', desc: '神灯改为贴着血量最低的队友，火从队友身边喷出' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
