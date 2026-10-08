import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

// 🦍 怒猩：怒气越攒越凶，满了重锤；濒死不倒
const gorillaSlam = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 2.2,
  damage: 28,
  knockback: 5,
  shape: { kind: 'sector', radius: 2.1, arcDeg: 140, ms: 240 },
  boost: { at: 100, spend: 100, damageMul: 2, onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }] },
} satisfies AbilityDef

const gorillaSlam2 = {
  ...gorillaSlam,
  boost: { at: 100, spend: 100, damageMul: 2, onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }, { kind: 'shove', distance: 2, ms: 220, onWall: [{ kind: 'stun', durationMs: 1000 }] }] },
} satisfies AbilityDef

const gorillaSlam3 = { ...gorillaSlam2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'gain', amount: 35 }] }] } satisfies AbilityDef

const gorillaRage = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'over',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'undying', durationMs: 5000 }, { kind: 'gain', amount: 100 }, { kind: 'buff', speedMul: 1.25, durationMs: 5000 }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  gorillaSlam,
  gorillaSlam2,
  gorillaSlam3,
  gorillaRage,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 60 }, mul: { damage: 1.12 } }, { add: { maxHp: 150 }, mul: { damage: 1.3 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f98d',
  name: '怒猩',
  desc: '打人攒怒气，满了一锤把敌人砸上天；开怒时怎么打都不倒',
  role: 'bruiser',
  tags: ['damage', 'defense', 'melee'],
  body: { drag: 5, mass: 1.7 },
  stats: { moveSpeed: 4.4, maxStamina: 130, staminaRegen: 50, exertion: 1.3 },
  skill: { name: '不灭之怒', icon: '1f4a2', desc: '五秒内生命不低于 1，怒气立刻攒满，移速提升', cdMs: 20_000, ability: 'gorillaRage' },
  weapons: [],
  innate: [
    {
      name: '捶地',
      icon: '1f44a',
      base: 'gorillaSlam',
      upgrades: [
        { ability: 'gorillaSlam2', card: { icon: '1f4a5', name: '碎地', desc: '满怒的一锤还把敌人震飞出去，撞墙的眩晕' } },
        { ability: 'gorillaSlam3', card: { icon: '1f525', name: '怒火不熄', desc: '捶地打死敌人回 35 怒气' } },
      ],
    },
  ],
  resource: { kind: 'fury', max: 100, onHit: 12, decay: 15, decayDelayMs: 2500 },
} as const satisfies CharacterAuthoring
