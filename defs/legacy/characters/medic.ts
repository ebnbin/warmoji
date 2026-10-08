import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const fieldMedkit = {
  trigger: 'auto',
  cooldownMs: 2400,
  aim: 'self',
  fireSfx: 'upgrade',
  shape: { kind: 'disc', radius: 4, at: 'self', of: 'hurt' },
  onHit: [{ kind: 'heal', amount: 14, scope: 'lowest' }],
} satisfies AbilityDef

const syringeDart = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 8,
  knockback: 2,
  shape: {
    kind: 'bolt',
    projectile: { look: { emoji: '1f489', size: 0.48, rotationOffsetDeg: 135 }, radius: 0.15, speed: 12 },
    lifeMs: 2000,
  },
} satisfies AbilityDef

const medicRally = {
  trigger: 'manual',
  aim: 'self',
  color: 0xa5d6a7,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies', downed: true },
  onHit: [{ kind: 'revive' }, { kind: 'healRatio', ratio: 0.35 }, { kind: 'invuln', ms: 1200 }],
} satisfies AbilityDef

const fieldMedkit2 = { ...fieldMedkit, onHit: [{ kind: 'heal', amount: 14, scope: 'all', ratio: 0.6 }] } satisfies AbilityDef

const fieldMedkit3 = {
  ...fieldMedkit2,
  onHit: [{ kind: 'reviveCut', ms: 2000 }, { kind: 'heal', amount: 14, scope: 'all', ratio: 0.6 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  fieldMedkit,
  fieldMedkit2,
  fieldMedkit3,
  syringeDart,
  medicRally,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 40 }, mul: { damage: 1.2, healing: 1.2 } }, { add: { maxHp: 90 }, mul: { damage: 1.45, healing: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_2695_fe0f',
  name: '军医',
  desc: '周期治疗附近血量最低的队友，顺手甩两支飞针',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5.2, maxStamina: 110, staminaRegen: 75, exertion: 1 },
  skill: { name: '急救包', icon: '2695', desc: '倒地队友立刻复活，存活者回血三成半，全队无敌一秒多', cdMs: 25_000, ability: 'medicRally' },
  weapons: [],
  innate: [
    {
      name: '战地医疗',
      icon: '1f48a',
      base: 'fieldMedkit',
      upgrades: [
        { ability: 'fieldMedkit2', card: { icon: '1f97c', name: '群体处方', desc: '治疗改为范围内全体队友回复 60% 治疗量' } },
        { ability: 'fieldMedkit3', card: { icon: '26a1', name: '电击起搏', desc: '每次治疗时，为复活倒计时最长的阵亡队友减少 2 秒，不论远近' } },
      ],
    },
    { name: '飞针', icon: '1f489', base: 'syringeDart', upgrades: [] },
  ],
} as const satisfies CharacterAuthoring
