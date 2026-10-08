import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

// 💂 卫兵：把敌人按在墙上
const guardShield = { look: { emoji: '1f6e1', size: 0.7, rotationOffsetDeg: 0 }, restOffset: 0.45 } as const

const guardStun = [{ kind: 'stun', durationMs: 1400 }, { kind: 'damage', amount: 0, ratio: 0.8 }] as const

const guardBash = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 1.9,
  damage: 24,
  held: guardShield,
  shape: { kind: 'segment', reach: 1.2, radius: 0.6, ms: 180, lungeDist: 0.4 },
  onHit: [{ kind: 'shove', distance: 2.4, ms: 260, onWall: guardStun }],
} satisfies AbilityDef

const guardBash2 = { ...guardBash, onHit: [{ kind: 'shove', distance: 2.4, ms: 260, onWall: guardStun }, { kind: 'grounded', durationMs: 2500 }] } satisfies AbilityDef

const guardBash3 = {
  ...guardBash,
  onHit: [
    { kind: 'shove', distance: 2.4, ms: 260, onWall: [...guardStun, { kind: 'barrier', shape: 'ring', length: 1.3, durationMs: 2000, bodies: 'all', shots: false, color: 0x8d6e63 }] },
    { kind: 'grounded', durationMs: 2500 },
  ],
} satisfies AbilityDef

const guardWall = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'boom',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'wall', length: 6, offset: 2.5, durationMs: 5000, bodies: 'foes', shots: true, color: 0x8d6e63 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  guardBash,
  guardBash2,
  guardBash3,
  guardWall,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 70 }, mul: { damage: 1.12 } }, { add: { maxHp: 160 }, mul: { damage: 1.28 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f482',
  name: '卫兵',
  desc: '盾击把敌人推到墙上砸晕；城墙挡人挡弹',
  role: 'tank',
  tags: ['defense', 'control', 'melee'],
  body: { drag: 5, mass: 1.7 },
  stats: { moveSpeed: 4.2, maxStamina: 140, staminaRegen: 50, exertion: 1.3 },
  skill: { name: '城墙', icon: '1f9f1', desc: '在指定方向两格半处立起一道六格长的城墙五秒，挡住敌人和敌方弹体', cdMs: 14_000, ability: 'guardWall', aim: true },
  weapons: [],
  innate: [
    {
      name: '盾击',
      icon: '1f6e1',
      base: 'guardBash',
      upgrades: [
        { ability: 'guardBash2', card: { icon: '26d3', name: '禁冲', desc: '被盾击的敌人两秒半内不能冲刺、跳跃、闪现' } },
        { ability: 'guardBash3', card: { icon: '1f3f0', name: '围城', desc: '被推到墙上的敌人四周再围起一圈墙，谁也进出不得' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
