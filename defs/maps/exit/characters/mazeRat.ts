import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, ring } from '../../../kit.ts'

// 🐁 迷宫鼠：抄近路闪到敌人身后咬一口，口口带毒、一层层叠上去，专咬残血的，咬死了立刻再扑；技能在迷宫里开一条捷径，钻进去前原地留一团毒云
const mazeRatBite = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 5,
  damage: 20,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.5, strikeMs: 200, execute: { hpRatio: 0.3, mul: 1.6 } },
} satisfies AbilityDef

const mazeRatBite2 = {
  ...mazeRatBite,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'refresh', what: 'this' }, { kind: 'status', status: 'speed', ms: 1500, value: 1.3 }] }],
} satisfies AbilityDef

const mazeRatBite3 = { ...mazeRatBite2, onHit: [{ kind: 'blast', radius: 1.5, ratio: 0.5, knockback: 0, ring: ring(0x9ccc65) }] } satisfies AbilityDef

const mazeRatShortcut = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'warp',
  shape: { kind: 'world' },
  onHit: [
    { kind: 'portal', distance: 7, radius: 0.9, durationMs: 6000, cdMs: 1500, color: 0x7e57c2 },
    { kind: 'to', who: { side: 'self' }, then: [{ kind: 'ground', def: patch(2, 5000, 0x9ccc65, undefined, 5, 500) }] },
  ],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'stealth', durationMs: 1500 }] }],
} satisfies AbilityDef

export const abilities = { mazeRatBite, mazeRatBite2, mazeRatBite3, mazeRatShortcut } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f401',
  name: '迷宫鼠',
  element: 'poison',
  desc: '在迷宫的阴沟里长大的老鼠，认得每一条近路：一眨眼闪到敌人身后咬一口再闪回来，口口带毒，一层层叠上去，中了毒的什么回复都不管用，专挑残血的下嘴；身子小、躲得快，单发的不好打中，范围的躲不开；技能开一条捷径，原地留下一团毒云，自己先溜进暗处',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.5 },
  stats: { moveSpeed: 7.4, maxStamina: 85, staminaRegen: 95, exertion: 0.75 },
  skill: {
    name: '捷径',
    icon: '1f6aa',
    desc: '脚下与摇杆方向 7 格处各开一扇门 6 秒，谁踏进一扇就从另一扇出来（敌我都算，同一个身体 1.5 秒内不再传）；脚下留一团 2 格的毒云 5 秒，每半秒烫一下、中一层毒；自己潜行 1.5 秒',
    cdMs: 11_000,
    ability: 'mazeRatShortcut',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '抄近路',
      icon: '1f401',
      base: 'mazeRatBite',
      upgrades: [
        { ability: 'mazeRatBite2', card: { icon: '1f5fa', name: '熟门熟路', desc: '咬死敌人立刻可以再扑，1.5 秒内移速 ×1.3' } },
        { ability: 'mazeRatBite3', card: { icon: '1f9a0', name: '鼠疫', desc: '咬下去毒溅开：被咬的身边 1.5 格的敌人各挨这一口五成的伤害，也中一层毒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
