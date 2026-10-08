import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🥸 怪盗：闪到敌人身后出刀，顺手摸走金币；技能偷走最近的敌人的一招
const phantomThiefBlade = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 4.5,
  damage: 26,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.5, strikeMs: 220 },
  onHit: [{ kind: 'chance', p: 0.2, then: [{ kind: 'coins', count: 1 }] }],
} satisfies AbilityDef

const phantomThiefBlade2 = {
  ...phantomThiefBlade,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'stealth', durationMs: 1500 }, { kind: 'refresh', what: 'this' }] }],
} satisfies AbilityDef

const phantomThiefBlade3 = {
  ...phantomThiefBlade2,
  onHit: [...phantomThiefBlade.onHit, { kind: 'status', status: 'exposed', ms: 3000, value: 1.25 }],
} satisfies AbilityDef

const phantomThiefHeist = {
  trigger: 'manual',
  aim: 'nearest',
  range: 7,
  fireSfx: 'warp',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: { side: 'foes', radius: 7, sort: 'nearest', count: 1 }, then: [{ kind: 'steal', ms: 8000, cooldownMs: 1500 }] }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'stealth', durationMs: 1500 }] }],
} satisfies AbilityDef

export const abilities = { phantomThiefBlade, phantomThiefBlade2, phantomThiefBlade3, phantomThiefHeist } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f978',
  name: '怪盗',
  element: 'dark',
  desc: '神出鬼没的怪盗：闪到敌人身后出刀再闪回来，每一刀有两成几率顺手摸走一枚金币；技能偷走最近的敌人的一招，随后混进人群不见',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.6 },
  stats: { moveSpeed: 7.2, maxStamina: 90, staminaRegen: 90, exertion: 0.8 },
  skill: { name: '偷天换日', icon: '1f3a9', desc: '偷走 7 格内最近的敌人的一招，8 秒内拿来自己用，随后潜行 1.5 秒', cdMs: 12_000, ability: 'phantomThiefHeist' },
  weapons: [],
  innate: [
    {
      name: '怪盗之刃',
      icon: '1f978',
      base: 'phantomThiefBlade',
      upgrades: [
        { ability: 'phantomThiefBlade2', card: { icon: '1f576', name: '易容', desc: '打死敌人后潜行 1.5 秒，并立刻可以再扑' } },
        { ability: 'phantomThiefBlade3', card: { icon: '1f48c', name: '预告函', desc: '打中的敌人 3 秒内受到的伤害 ×1.25' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
