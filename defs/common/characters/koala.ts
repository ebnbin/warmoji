import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🐨 考拉：让敌人睡着，让队友抱住你
const koalaLeaf = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 14,
  shape: { kind: 'bolt', projectile: shot('1f343', 9), lifeMs: 2000 },
  onHit: [{ kind: 'sleep', durationMs: 3000, wakeMul: 2 }],
} satisfies AbilityDef

const drowsy = { radius: 1.5, durationMs: 2500, damage: 0, color: 0xa5d6a7, fillAlpha: 0.22, lineAlpha: 0.55, enterMs: 200 } as const

const koalaLeaf2 = {
  ...koalaLeaf,
  onHit: [{ kind: 'sleep', durationMs: 3000, wakeMul: 2 }, { kind: 'ground', def: { ...drowsy, tickMs: 600, effects: [{ kind: 'sleep', durationMs: 1200, wakeMul: 1.5 }] } }],
} satisfies AbilityDef

const koalaLeaf3 = {
  ...koalaLeaf,
  onHit: [
    { kind: 'sleep', durationMs: 3000, wakeMul: 2 },
    { kind: 'ground', def: { ...drowsy, durationMs: 3000, tickMs: 0, dwell: { ms: 1000, effects: [{ kind: 'sleep', durationMs: 2500, wakeMul: 2 }] }, onExpire: [{ kind: 'slow', factor: 0.5, durationMs: 1500 }] } },
  ],
} satisfies AbilityDef

const koalaHug = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'attach', ms: 4000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'unstoppable', durationMs: 4000 }, { kind: 'guard', mul: 0.6, durationMs: 4000 }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  koalaLeaf,
  koalaLeaf2,
  koalaLeaf3,
  koalaHug,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 50 }, mul: { cooldown: 0.9 } }, { add: { maxHp: 120 }, mul: { cooldown: 0.78 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f428',
  name: '考拉',
  desc: '桉叶让敌人睡着；抱紧时全队挂在它身上',
  role: 'tank',
  tags: ['defense', 'support', 'control', 'ranged'],
  body: { drag: 5.5, mass: 1.4 },
  stats: { moveSpeed: 3.64, maxStamina: 70, staminaRegen: 40, exertion: 0.9 },
  skill: { name: '抱紧', icon: '1f917', desc: '四秒内全体队友贴在考拉身上、不可选中但照常出手；考拉霸体并减伤四成', cdMs: 16_000, ability: 'koalaHug' },
  weapons: [],
  innate: [
    {
      name: '桉叶',
      icon: '1f343',
      base: 'koalaLeaf',
      upgrades: [
        { ability: 'koalaLeaf2', card: { icon: '1f4a4', name: '催眠雾', desc: '桉叶落处起一团雾，雾里的敌人一阵阵睡着' } },
        { ability: 'koalaLeaf3', card: { icon: '1f6cc', name: '好梦', desc: '雾里连续待满一秒的敌人沉睡两秒半，雾散时减速' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
