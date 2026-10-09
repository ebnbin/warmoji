import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🥷 忍者：闪到敌人身后斩，残血的斩得更狠，斩死了立刻闪向下一个；技能变出两个分身一起出手
const slash = {
  aim: 'nearest',
  range: 6,
  damage: 30,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 250, execute: { hpRatio: 0.3, mul: 1.6 } },
} as const

const ninjaBlade = { trigger: 'auto', cooldownMs: 1600, ...slash } satisfies AbilityDef

const kunai = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6,
  damage: 10,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f5e1', 13, 0.42, 225), lifeMs: 800 },
  repeat: { count: 3, spreadDeg: 20 },
} satisfies AbilityDef

const ninjaBlade2 = { ...ninjaBlade, cycle: [kunai] } satisfies AbilityDef

const chase = { trigger: 'manual', class: 'attack', ...slash } satisfies AbilityDef

// 斩死的那一刻死者还在目标表里，等一拍再追斩，免得闪回去斩尸体
const ninjaBlade3 = {
  ...ninjaBlade2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'fuse', ms: 20, then: [{ kind: 'cast', ability: chase }, { kind: 'stealth', durationMs: 1500 }] }] }],
} satisfies AbilityDef

const ninjaClones = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'warp',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'summon', of: { clone: { dmgRatio: 0.6 } }, count: 2, lifeMs: 6000, hpRatio: 0.4 }] }],
} satisfies AbilityDef

export const abilities = { ninjaBlade, ninjaBlade2, ninjaBlade3, ninjaClones } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f977',
  name: '忍者',
  element: 'dark',
  desc: '来无影去无踪的忍者：闪到 6 格内最近的敌人身后斩一刀，对生命低于三成的斩得更狠；技能变出两个分身一起出手',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.6 },
  stats: { moveSpeed: 7.4, maxStamina: 90, staminaRegen: 95, exertion: 0.75 },
  skill: { name: '分身术', icon: '1f465', desc: '变出两个分身，6 秒内跟着一起出手；分身有你四成的生命、六成的伤害', cdMs: 15_000, ability: 'ninjaClones' },
  weapons: [],
  innate: [
    {
      name: '影刃',
      icon: '1f977',
      base: 'ninjaBlade',
      upgrades: [
        { ability: 'ninjaBlade2', card: { icon: '1f5e1', name: '苦无', desc: '影刃与一轮三枚苦无轮流出手，苦无散开 20 度' } },
        { ability: 'ninjaBlade3', card: { icon: '1f32b', name: '影遁', desc: '影刃斩死敌人时，立刻闪向下一个敌人再斩一刀，并潜行 1.5 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
