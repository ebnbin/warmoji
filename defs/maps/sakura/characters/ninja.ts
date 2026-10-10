import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot, zoneLook } from '../../../kit.ts'

// 🥷 忍者：刀上淬毒，闪到敌人身后斩，一刀叠一层毒，残血的斩得更狠，斩死了立刻闪向下一个；技能摔下烟玉起一团毒烟，烟里变出两个带毒的分身一起出手
const slash = {
  aim: 'nearest',
  range: 6,
  damage: 24,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 250, execute: { hpRatio: 0.3, mul: 1.6 } },
} as const

const ninjaBlade = { trigger: 'auto', cooldownMs: 1600, ...slash } satisfies AbilityDef

const kunai = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6,
  damage: 8,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f5e1', 13, 0.42, 225), lifeMs: 800 },
  repeat: { count: 3, spreadDeg: 20 },
} satisfies AbilityDef

const ninjaBlade2 = { ...ninjaBlade, cycle: [kunai] } satisfies AbilityDef

const chase = { trigger: 'manual', class: 'attack', ...slash } satisfies AbilityDef

// 斩死的那一刻死者还在目标表里，等一拍再追斩，免得闪回去斩尸体
const ninjaBlade3 = {
  ...ninjaBlade2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'after', ms: 20, then: [{ kind: 'cast', ability: chase }, { kind: 'stealth', durationMs: 1500 }] }] }],
} satisfies AbilityDef

const ninjaClones = {
  trigger: 'manual',
  aim: 'self',
  damage: 3,
  fireSfx: 'warp',
  shape: { kind: 'zone', radius: 2.5, durationMs: 4000, tickMs: 1000, visual: zoneLook(0x9ccc65) },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'summon', of: { clone: { dmgRatio: 0.6 } }, count: 2, lifeMs: 6000, hpRatio: 0.4 }] }],
} satisfies AbilityDef

export const abilities = { ninjaBlade, ninjaBlade2, ninjaBlade3, ninjaClones } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f977',
  name: '忍者',
  element: 'poison',
  desc: '来无影去无踪的忍者，刀上淬了毒：闪到 6 格内最近的敌人身后斩一刀，每刀给它叠一层毒，对生命低于三成的斩得更狠；身子轻、躲得快，单体的出手常常落空，范围的躲不开；本身是毒，不会中毒；技能摔下烟玉，原地起一团毒烟，烟里变出两个分身一起出手',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.6 },
  stats: { moveSpeed: 7.4, maxStamina: 90, staminaRegen: 95, exertion: 0.75 },
  skill: {
    name: '分身术',
    icon: '1f465',
    desc: '摔下烟玉，原地起一团 2.5 格的毒烟，留 4 秒，烟里的敌人每秒挨一下、叠一层毒；烟里变出两个分身，6 秒内跟着一起出手，分身有你四成的生命、六成的伤害，刀上一样带毒',
    cdMs: 15_000,
    ability: 'ninjaClones',
  },
  weapons: [],
  innate: [
    {
      name: '毒刃',
      icon: '1f977',
      base: 'ninjaBlade',
      upgrades: [
        { ability: 'ninjaBlade2', card: { icon: '1f5e1', name: '苦无', desc: '毒刃与一轮三枚淬毒苦无轮流出手，苦无散开 20 度，每枚中了都叠一层毒' } },
        { ability: 'ninjaBlade3', card: { icon: '1f32b', name: '影遁', desc: '毒刃斩死敌人时，立刻闪向下一个敌人再斩一刀，并潜行 1.5 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
