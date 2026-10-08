import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

// 🐲 小龙：喷火攒热量，过热就得歇；化成巨龙
const dragonBreath = {
  trigger: 'auto',
  cooldownMs: 300,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 2.8,
  damage: 9,
  knockback: 1,
  gain: 11,
  color: 0xff7043,
  delivery: 'melee',
  shape: { kind: 'segment', reach: 2.8, radius: 0.5, ms: 180, beam: true },
} satisfies AbilityDef

const burn = { kind: 'ground', def: { radius: 1.1, durationMs: 2000, tickMs: 400, damage: 5, color: 0xff7043, fillAlpha: 0.22, lineAlpha: 0.5, enterMs: 150 } } as const

const dragonBreath2 = { ...dragonBreath, boost: { at: 70, spend: 0, damageMul: 1.6, onHit: [burn] } } satisfies AbilityDef

const dragonBreath3 = { ...dragonBreath2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'gain', amount: -40 }] }] } satisfies AbilityDef

const dragonForm = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'boom',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'form', to: 0, ms: 8000 }, { kind: 'gain', amount: -100 }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  dragonBreath,
  dragonBreath2,
  dragonBreath3,
  dragonForm,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 35 }, mul: { damage: 1.2 } }, { add: { maxHp: 70 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f432',
  name: '小龙',
  desc: '喷火攒热量，过热就得歇两秒半；化龙时体型大增、换上龙焰与甩尾',
  role: 'bruiser',
  tags: ['damage', 'melee', 'area'],
  body: { drag: 5, mass: 1.2 },
  stats: { moveSpeed: 5, maxStamina: 110, staminaRegen: 55, exertion: 1 },
  skill: { name: '化龙', icon: '1f409', desc: '化成巨龙八秒：体型变大、热量清空，换上烧地的龙焰与三百六十度甩尾', cdMs: 22_000, ability: 'dragonForm' },
  weapons: [],
  innate: [
    {
      name: '龙息',
      icon: '1f525',
      base: 'dragonBreath',
      upgrades: [
        { ability: 'dragonBreath2', card: { icon: '1f321', name: '危险区', desc: '热量高于七成时龙息更猛并在地上留火' } },
        { ability: 'dragonBreath3', card: { icon: '1f4a8', name: '泄热', desc: '龙息打死敌人散掉四成热量' } },
      ],
    },
  ],
  resource: { kind: 'heat', max: 100, decay: 25, decayDelayMs: 900, full: { lockMs: 2500, reset: true } },
  forms: [
    {
      emoji: '1f409',
      name: '巨龙',
      stats: { mul: { scale: 1.6, moveSpeed: 0.9 } },
      abilities: [
        {
          trigger: 'auto',
          cooldownMs: 500,
          aim: 'nearest',
          fireSfx: 'whoosh',
          range: 4,
          damage: 22,
          knockback: 4,
          color: 0xff3d00,
          delivery: 'melee',
          shape: { kind: 'segment', reach: 4, radius: 1, ms: 200, beam: true },
          onHit: [{ kind: 'ground', def: { radius: 1.2, durationMs: 2000, tickMs: 400, damage: 5, color: 0xff7043, fillAlpha: 0.22, lineAlpha: 0.5, enterMs: 150 } }],
        },
        {
          trigger: 'auto',
          cooldownMs: 1600,
          aim: 'nearest',
          fireSfx: 'whoosh',
          range: 2.4,
          damage: 30,
          knockback: 10,
          shape: { kind: 'sector', radius: 2.6, arcDeg: 360, ms: 300 },
        },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
