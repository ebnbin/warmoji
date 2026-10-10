import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring, shot } from '../../../kit.ts'

// 🕵️ 侦探：放大镜照到哪里，藏着的敌人就现形到哪里，线索攒够了当场结案，一记重的砸下去，把它身边的人震开；技能给血最厚的敌人下悬赏，它一倒下全队技能立刻转好
const lens = (onHit: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 550,
    aim: 'nearest',
    range: 8,
    damage: 14,
    fireSfx: 'shoot',
    shape: { kind: 'bolt', projectile: shot('1f50d', 11, 0.45), lifeMs: 900 },
    onHit,
  }) satisfies AbilityDef

const REVEAL = { kind: 'reveal', durationMs: 2000 } as const

const CASE_CLOSED = [{ kind: 'blast', radius: 2, ratio: 1.2, knockback: 2.5, ring: ring(0xfff59d) }, { kind: 'status', status: 'exposed', ms: 4000, value: 1.3 }] as const

const sleuthLens = lens([REVEAL])

const sleuthLens2 = lens([REVEAL, { kind: 'stack', max: 3, durationMs: 4000, then: CASE_CLOSED }])

const sleuthLens3 = lens([REVEAL, { kind: 'stack', max: 3, durationMs: 4000, then: [...CASE_CLOSED, { kind: 'deathMark', ms: 3000, then: [{ kind: 'refresh', what: 'skill', ms: 3000 }] }] }])

const sleuthWarrant = {
  trigger: 'manual',
  aim: 'strongest',
  range: 9,
  fireSfx: 'upgrade',
  color: 0xfff59d,
  shape: { kind: 'disc', radius: 0.5, at: 'target' },
  onHit: [
    { kind: 'deathMark', ms: 6000, then: [{ kind: 'refresh', what: 'skill', who: 'team' }] },
    { kind: 'to', who: { side: 'foes', radius: 5 }, then: [{ kind: 'damage', amount: 20 }, { kind: 'reveal', durationMs: 6000 }, { kind: 'status', status: 'exposed', ms: 6000, value: 1.2 }] },
  ],
} satisfies AbilityDef

export const abilities = { sleuthLens, sleuthLens2, sleuthLens3, sleuthWarrant } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2 } }, { add: { crit: 0.08 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f575',
  name: '侦探',
  desc: '眼尖的侦探：放大镜照到哪里，藏着的敌人就现形 2 秒，线索攒够了当场结案，一记重的砸下去，把它身边的人震开；眼尖身轻，单发的一成五打不中他，范围与持续伤害躲不开；技能给 9 格内血最厚的敌人下悬赏，揭穿它身边 5 格的一片，悬赏期间它倒下，全队主动技能立刻转好',
  role: 'ranged',
  tags: ['damage', 'support', 'ranged'],
  body: { drag: 4.5, mass: 0.9 },
  stats: { moveSpeed: 5.8, maxStamina: 100, staminaRegen: 70, exertion: 0.9, dodge: 0.15 },
  skill: {
    name: '悬赏令',
    icon: '1f4dc',
    desc: '给 9 格内血最厚的敌人下悬赏 6 秒：它和它 5 格内的敌人各挨一下，6 秒内显形、受到的伤害 ×1.2；悬赏期间它倒下，全队主动技能立刻转好',
    cdMs: 16_000,
    ability: 'sleuthWarrant',
  },
  weapons: [],
  innate: [
    {
      name: '推理',
      icon: '1f50d',
      base: 'sleuthLens',
      upgrades: [
        { ability: 'sleuthLens2', card: { icon: '1f9e9', name: '线索', desc: '同一个敌人挨满 3 发就结案：它和身边 2 格内的敌人各挨一下 1.2 倍的重击，身边的被震开，它 4 秒内受到的伤害 ×1.3' } },
        { ability: 'sleuthLens3', card: { icon: '1f6a8', name: '通缉', desc: '结案的敌人 3 秒内倒下，悬赏令的冷却减 3 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
