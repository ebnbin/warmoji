import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐛 萤火虫：本身是雷，放出绕身飞的电萤去撞敌人，撞一下就散，打断挨撞的出手、电流再跳给身边另一个；技能点亮满天星，全队跑得更快，萤火连成一道闪电在敌人之间跳
const wormFlies = {
  trigger: 'auto',
  cooldownMs: 2500,
  aim: 'self',
  damage: 7,
  fireSfx: 'flutter',
  shape: {
    kind: 'summon',
    count: 3,
    minion: { look: { emoji: '1f7e1', size: 0.4 }, speed: 8, orbit: { radius: 0.8, spinRadPerSec: 3 } },
    lifeMs: 5000,
  },
} satisfies AbilityDef

const wormFlies2 = { ...wormFlies, shape: { ...wormFlies.shape, count: 4 } } satisfies AbilityDef

const wormFlies3 = { ...wormFlies2, shape: { ...wormFlies2.shape, count: 5 }, onHit: [{ kind: 'reveal', durationMs: 2000 }] } satisfies AbilityDef

const wormBolt = {
  trigger: 'manual',
  aim: 'nearest',
  range: 6,
  damage: 14,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'chain', hops: 5, hopRange: 3, decay: 0.85 },
} satisfies AbilityDef

const wormStars = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xfff59d,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'status', status: 'speed', ms: 4000, value: 1.15 },
    { kind: 'cast', ability: wormBolt },
  ],
} satisfies AbilityDef

export const abilities = { wormFlies, wormFlies2, wormFlies3, wormStars } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f41b',
  name: '萤火虫',
  element: 'thunder',
  desc: '尾巴一亮一亮的萤火虫，本身是雷，不受传导：隔一阵放出一群绕身飞的电萤，自己去撞敌人，撞一下就散——挨撞的正在蓄的力被打断，电流再跳给 2.5 格内另一个敌人，湿的敌人挤在一起就连成一片；身子轻，贴上来的敌人先撞上绕身的电萤；技能点亮满天星，全队跑得更快，萤火连成一道闪电在敌人之间跳',
  role: 'summoner',
  tags: ['damage', 'support', 'summon'],
  body: { drag: 5, mass: 0.6 },
  stats: { moveSpeed: 4.8, maxStamina: 110, staminaRegen: 60, exertion: 1 },
  skill: { name: '满天星', icon: '1f386', desc: '全队移速 ×1.15 4 秒；萤火连成一道闪电，从 6 格内最近的敌人起，在相隔 3 格以内的敌人之间连打 6 个，头一个 14 点、被打断出手、电流再跳给身边另一个，往后每个少一成五', cdMs: 15_000, ability: 'wormStars' },
  weapons: [],
  innate: [
    {
      name: '电萤',
      icon: '1f7e1',
      base: 'wormFlies',
      upgrades: [
        { ability: 'wormFlies2', card: { icon: '1f320', name: '萤群', desc: '一次放出 4 只电萤' } },
        { ability: 'wormFlies3', card: { icon: '1f4a1', name: '萤光', desc: '一次放出 5 只电萤，撞中的敌人显形 2 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
