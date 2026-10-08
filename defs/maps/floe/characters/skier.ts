import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// ⛷️ 滑雪者：闪到敌人身后一杖戳下去，专挑残血的，戳死了马上再扑；一个大回转冻住一路的敌人
const skierPole = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 4.5,
  damage: 26,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 200, execute: { hpRatio: 0.3, mul: 1.5 } },
} satisfies AbilityDef

const skierPole2 = { ...skierPole, onHit: [{ kind: 'slow', factor: 0.6, durationMs: 1500 }] } satisfies AbilityDef

const skierPole3 = {
  ...skierPole2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'refresh', what: 'this' }, { kind: 'status', status: 'speed', ms: 1500, value: 1.3 }] }],
} satisfies AbilityDef

const skierSlalom = {
  trigger: 'manual',
  aim: 'stick',
  damage: 30,
  fireSfx: 'streak',
  color: 0xb3e5fc,
  shape: { kind: 'sprint', distance: 8, ms: 550, radius: 0.9 },
  onHit: [{ kind: 'status', status: 'frozen', ms: 1000 }],
} satisfies AbilityDef

export const abilities = { skierPole, skierPole2, skierPole3, skierSlalom } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '26f7',
  name: '滑雪者',
  element: 'ice',
  desc: '踩着雪板来去如风：闪到 4.5 格内最近的敌人身后一杖戳下去，对残血的格外狠；技能一个大回转，冻住一路的敌人',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.7 },
  stats: { moveSpeed: 7.2, maxStamina: 90, staminaRegen: 90, exertion: 0.8 },
  skill: { name: '大回转', icon: '1f3bf', desc: '朝摇杆方向滑出 8 格，沿路的敌人吃 30 点伤害并冻结 1 秒', cdMs: 10_000, ability: 'skierSlalom', aim: true },
  weapons: [],
  innate: [
    {
      name: '雪杖',
      icon: '26f7',
      base: 'skierPole',
      upgrades: [
        { ability: 'skierPole2', card: { icon: '1f6d1', name: '急停', desc: '戳中的敌人减速 40%，持续 1.5 秒' } },
        { ability: 'skierPole3', card: { icon: '1f501', name: '回转', desc: '戳死敌人立刻可以再扑，并在 1.5 秒内移速 ×1.3' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
