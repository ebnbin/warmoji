import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🕵 侦探：同一目标攒够三条证据才结案
const caseClosed = [{ kind: 'stun', durationMs: 1200 }, { kind: 'reveal', durationMs: 5000 }, { kind: 'damage', amount: 0, ratio: 2.5 }] as const

const detectiveLens = {
  trigger: 'auto',
  cooldownMs: 850,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 12,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('1f50d', 11), lifeMs: 1800 },
  onHit: [{ kind: 'stack', max: 3, durationMs: 4000, then: caseClosed }],
} satisfies AbilityDef

const detectiveLens2 = {
  ...detectiveLens,
  onHit: [{ kind: 'stack', max: 3, durationMs: 4000, then: [...caseClosed, { kind: 'deathMark', ms: 3000, then: [{ kind: 'refresh', what: 'skill', ms: 3000 }] }] }],
} satisfies AbilityDef

const detectiveLens3 = {
  ...detectiveLens,
  onHit: [
    {
      kind: 'stack',
      max: 3,
      durationMs: 4000,
      then: [...caseClosed, { kind: 'deathMark', ms: 3000, then: [{ kind: 'refresh', what: 'skill', ms: 3000 }] }, { kind: 'to', who: { side: 'foes', radius: 2.2 }, then: [{ kind: 'stun', durationMs: 800 }] }],
    },
  ],
} satisfies AbilityDef

const detectiveWarrant = {
  trigger: 'manual',
  aim: 'strongest',
  range: 9,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 0.6, at: 'target' },
  onHit: [{ kind: 'deathMark', ms: 6000, then: [{ kind: 'refresh', what: 'skill', who: 'team' }] }, { kind: 'reveal', durationMs: 6000 }, { kind: 'status', status: 'exposed', ms: 6000, value: 1.3 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  detectiveLens,
  detectiveLens2,
  detectiveLens3,
  detectiveWarrant,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 20 }, mul: { damage: 1.25 } }, { add: { maxHp: 40 }, mul: { damage: 1.5 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f575',
  name: '侦探',
  desc: '对同一目标攒够三条证据当场结案；悬赏的目标一死，全队技能转好',
  role: 'ranged',
  tags: ['damage', 'support', 'ranged'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5.2, maxStamina: 120, staminaRegen: 50, exertion: 0.9 },
  skill: { name: '悬赏令', icon: '1f4dc', desc: '给九格内血最厚的敌人下悬赏六秒：揭示它、它受伤增加三成；期间它死了，全队主动技能立刻转好', cdMs: 18_000, ability: 'detectiveWarrant' },
  weapons: [],
  innate: [
    {
      name: '放大镜',
      icon: '1f50d',
      base: 'detectiveLens',
      upgrades: [
        { ability: 'detectiveLens2', card: { icon: '1f4cb', name: '通缉', desc: '结案的目标三秒内死去，悬赏令冷却减三秒' } },
        { ability: 'detectiveLens3', card: { icon: '1f6a8', name: '结案波及', desc: '结案时周围两格的敌人一起被眩晕' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
