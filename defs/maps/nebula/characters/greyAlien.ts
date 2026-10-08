import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 👽 外星人：闪到敌人身后扎探针，专挑残血的下手，扎死了潜行再扑；技能把最近的敌人绑进只有彼此的异界
const greyAlienProbe = {
  trigger: 'auto',
  cooldownMs: 1350,
  aim: 'nearest',
  range: 5,
  damage: 26,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 250, execute: { hpRatio: 0.3, mul: 1.6 } },
} satisfies AbilityDef

const greyAlienProbe2 = { ...greyAlienProbe, onHit: [{ kind: 'root', durationMs: 600 }] } satisfies AbilityDef

const greyAlienProbe3 = {
  ...greyAlienProbe2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'stealth', durationMs: 1000 }, { kind: 'refresh', what: 'this' }] }],
} satisfies AbilityDef

const greyAlienAbduct = {
  trigger: 'manual',
  aim: 'nearest',
  range: 6,
  fireSfx: 'warp',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: { side: 'foes', radius: 6, sort: 'nearest', count: 1 }, then: [{ kind: 'realm', ms: 4000 }] }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'buff', damageMul: 1.5, durationMs: 4000 }] }],
} satisfies AbilityDef

export const abilities = { greyAlienProbe, greyAlienProbe2, greyAlienProbe3, greyAlienAbduct } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f47d',
  name: '外星人',
  element: 'dark',
  desc: '灰皮肤的外星来客：闪到敌人身后扎一针探针再闪回来，对残血的下手更狠，扎死了就隐身再扑；技能把最近的敌人绑进只有彼此的异界单挑',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.2, mass: 0.6 },
  stats: { moveSpeed: 7.2, maxStamina: 90, staminaRegen: 90, exertion: 0.8 },
  skill: { name: '绑架', icon: '1f6f8', desc: '把 6 格内最近的敌人拉进只有彼此的异界 4 秒，界外谁也插不了手；这 4 秒里自己的伤害 ×1.5', cdMs: 14_000, ability: 'greyAlienAbduct' },
  weapons: [],
  innate: [
    {
      name: '探针',
      icon: '1f52c',
      base: 'greyAlienProbe',
      upgrades: [
        { ability: 'greyAlienProbe2', card: { icon: '1f489', name: '麻醉', desc: '扎中的敌人定身 0.6 秒' } },
        { ability: 'greyAlienProbe3', card: { icon: '1f9e0', name: '心灵感应', desc: '扎死敌人后潜行 1 秒，并且立刻可以再扑' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
