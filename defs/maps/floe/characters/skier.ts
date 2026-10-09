import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// ⛷️ 滑雪者：闪到敌人身后一杖戳下去，专挑残血的和冻住的，戳死了马上再扑；一个大回转把一路的敌人铲开
const skierPole = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 4.5,
  damage: 26,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 200, execute: { hpRatio: 0.3, mul: 1.5 } },
} satisfies AbilityDef

const skierPole2 = { ...skierPole, onHit: [{ kind: 'status', status: 'exposed', ms: 3000, value: 1.2 }] } satisfies AbilityDef

const skierPole3 = {
  ...skierPole2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'refresh', what: 'this' }, { kind: 'status', status: 'speed', ms: 1500, value: 1.3 }] }],
} satisfies AbilityDef

const skierSlalom = {
  trigger: 'manual',
  aim: 'stick',
  damage: 30,
  knockback: 4,
  fireSfx: 'streak',
  color: 0xb3e5fc,
  shape: { kind: 'sprint', distance: 8, ms: 550, radius: 0.9 },
} satisfies AbilityDef

export const abilities = { skierPole, skierPole2, skierPole3, skierSlalom } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '26f7',
  name: '滑雪者',
  desc: '踩着雪板来去如风，出手都是物理：闪到 4.5 格内最近的敌人身后一杖戳下去，对残血的格外狠，戳在冻住的身上冰也碎了、伤害翻倍；技能一个大回转，把一路的敌人铲开，铲出冰缘就掉进海里',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.7 },
  stats: { moveSpeed: 7.2, maxStamina: 90, staminaRegen: 90, exertion: 0.8 },
  skill: { name: '大回转', icon: '1f3bf', desc: '朝摇杆方向滑出 8 格，沿路的敌人吃 30 点伤害并被铲开，冻住的铲碎、伤害翻倍', cdMs: 10_000, ability: 'skierSlalom', aim: true },
  weapons: [],
  innate: [
    {
      name: '雪杖',
      icon: '26f7',
      base: 'skierPole',
      upgrades: [
        { ability: 'skierPole2', card: { icon: '1f3af', name: '破绽', desc: '戳中的敌人露出破绽，3 秒内受到的伤害 ×1.2' } },
        { ability: 'skierPole3', card: { icon: '1f501', name: '回转', desc: '戳死敌人立刻可以再扑，并在 1.5 秒内移速 ×1.3' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
