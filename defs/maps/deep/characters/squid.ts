import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { patch } from '../../../kit.ts'

// 🦑 乌贼：触腕猛地一刺，专挑残血的下手；技能喷出一团墨云，墨云外的敌人打不进来
const squidStab = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 2.6,
  damage: 26,
  fireSfx: 'whoosh',
  shape: { kind: 'segment', reach: 0, radius: 0.45, ms: 160, lungeDist: 2.5 },
} satisfies AbilityDef

const squidStab2 = { ...squidStab, onHit: [{ kind: 'disarm', durationMs: 1000 }] } satisfies AbilityDef

const squidStab3 = {
  ...squidStab2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'refresh', what: 'this' }, { kind: 'status', status: 'speed', ms: 1500, value: 1.3 }] }],
} satisfies AbilityDef

const squidInk = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'gurgle',
  shape: { kind: 'world' },
  onHit: [{ kind: 'ground', def: { ...patch(3, 5000, 0x37474f), fillAlpha: 0.45, mist: true } }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'stealth', durationMs: 2000 }] }],
} satisfies AbilityDef

export const abilities = { squidStab, squidStab2, squidStab3, squidInk } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f991',
  name: '乌贼',
  element: 'dark',
  desc: '神出鬼没的乌贼：触腕猛地扑刺 2.5 格，专挑残血的下手；技能喷出一大团墨云，墨云里的队员只会被同在墨云里的敌人打到，自己趁机潜行',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.2, mass: 0.6 },
  stats: { moveSpeed: 7.2, maxStamina: 85, staminaRegen: 90, exertion: 0.8 },
  skill: { name: '墨云', icon: '1f32b', desc: '脚下喷出 3 格的墨云 5 秒：墨云里的队员只会被同在墨云里的出手打到；自己潜行 2 秒', cdMs: 12_000, ability: 'squidInk' },
  weapons: [],
  innate: [
    {
      name: '触腕突刺',
      icon: '1f991',
      base: 'squidStab',
      upgrades: [
        { ability: 'squidStab2', card: { icon: '1f58b', name: '喷墨', desc: '刺中的敌人致盲 1 秒，普通出手与接触都打不出去' } },
        { ability: 'squidStab3', card: { icon: '1f52a', name: '掠食', desc: '刺死敌人立刻可以再刺，并在 1.5 秒内移速 ×1.3' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
