import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

// 🐼 太极熊猫：能量打连环掌，太极卸力反制
const pandaPalm = {
  trigger: 'auto',
  cooldownMs: 380,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 1.9,
  damage: 16,
  knockback: 2,
  cost: 10,
  shape: { kind: 'segment', reach: 1.7, radius: 0.5, ms: 140, lungeDist: 0.4 },
} satisfies AbilityDef

const pandaPalm2 = { ...pandaPalm, onHit: [{ kind: 'shove', distance: 1.2, ms: 160 }] } satisfies AbilityDef

const pandaPalm3 = { ...pandaPalm, onHit: [{ kind: 'shove', distance: 1.2, ms: 160 }, { kind: 'interrupt' }] } satisfies AbilityDef

const pandaTaiji = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'parry', durationMs: 1600, then: [{ kind: 'stun', durationMs: 1200 }, { kind: 'damage', amount: 30 }] }, { kind: 'gain', amount: 50 }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  pandaPalm,
  pandaPalm2,
  pandaPalm3,
  pandaTaiji,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 50 }, mul: { damage: 1.15 } }, { add: { maxHp: 120 }, mul: { damage: 1.3 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43c',
  name: '太极熊猫',
  desc: '能量打出连环掌；太极卸下一切来招并反制',
  role: 'bruiser',
  tags: ['defense', 'control', 'melee'],
  body: { drag: 5, mass: 1.5 },
  stats: { moveSpeed: 4.8, maxStamina: 120, staminaRegen: 50, exertion: 1.1 },
  skill: { name: '太极', icon: '262f', desc: '一秒半内挡下所有命中，每挡一下就眩晕出手者并还击，还回五十能量', cdMs: 11_000, ability: 'pandaTaiji' },
  weapons: [],
  innate: [
    {
      name: '连环掌',
      icon: '1f590',
      base: 'pandaPalm',
      upgrades: [
        { ability: 'pandaPalm2', card: { icon: '1f4a8', name: '推手', desc: '掌击把敌人推开' } },
        { ability: 'pandaPalm3', card: { icon: '1f6d1', name: '化劲', desc: '掌击打断敌人的蓄力与连发' } },
      ],
    },
  ],
  resource: { kind: 'energy', max: 100, start: 100, regen: 18 },
} as const satisfies CharacterAuthoring
