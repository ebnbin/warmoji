import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { patch } from '../../../kit.ts'

// 🦎 火蜥蜴：闪到敌人身后舔一口火舌，伤口烧上一阵，专挑残血的下狠手；技能钻进熔岩里潜行，一路燃起火圈
const salamanderLash = {
  trigger: 'auto',
  cooldownMs: 1500,
  aim: 'nearest',
  range: 5,
  damage: 24,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 260, execute: { hpRatio: 0.3, mul: 1.5 } },
  onHit: [{ kind: 'poison', damage: 0, ratio: 0.1, tickMs: 500, durationMs: 3000 }],
} satisfies AbilityDef

const salamanderLash2 = { ...salamanderLash, onHit: [...salamanderLash.onHit, { kind: 'ground', def: patch(1, 2000, 0xff7043, undefined, 4, 400) }] } satisfies AbilityDef

const salamanderLash3 = {
  ...salamanderLash2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'healRatio', ratio: 0.08 }, { kind: 'refresh', what: 'this' }] }],
} satisfies AbilityDef

const salamanderDive = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'ignite',
  shape: { kind: 'world' },
  onHit: [{ kind: 'ground', def: patch(1.5, 1500, 0xff7043, undefined, 6, 500) }],
  repeat: { count: 6, delayMs: 500 },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'stealth', durationMs: 3000 }, { kind: 'status', status: 'speed', ms: 3000, value: 1.5 }] }],
} satisfies AbilityDef

export const abilities = { salamanderLash, salamanderLash2, salamanderLash3, salamanderDive } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f98e',
  name: '火蜥蜴',
  element: 'fire',
  desc: '在熔岩里打滚的火蜥蜴，不怕岩浆：闪到敌人身后舔一口火舌，伤口要烧上一阵，对残血的下手更狠；技能钻进熔岩里潜行，跑得飞快，一路燃起火圈',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  traits: ['fireproof'],
  body: { drag: 4, mass: 0.6 },
  stats: { moveSpeed: 7.2, maxStamina: 90, staminaRegen: 90, exertion: 0.8 },
  skill: {
    name: '熔岩潜行',
    icon: '1f30b',
    desc: '潜行 3 秒（出手就现形），移速 ×1.5；3 秒里每半秒在脚下燃起一圈 1.5 格的火，一路跟着自己，每圈烧 1.5 秒、每半秒烫一下',
    cdMs: 11_000,
    ability: 'salamanderDive',
  },
  weapons: [],
  innate: [
    {
      name: '火舌',
      icon: '1f445',
      base: 'salamanderLash',
      upgrades: [
        { ability: 'salamanderLash2', card: { icon: '2702', name: '断尾', desc: '每次舔中敌人，在它脚下留一截燃烧的断尾：1 格，烧 2 秒，每 0.4 秒烫一下' } },
        { ability: 'salamanderLash3', card: { icon: '267b', name: '再生', desc: '火舌打死敌人时回复自己 8% 的生命，并立刻可以再扑' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
