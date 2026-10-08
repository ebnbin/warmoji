import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🐛 萤火虫：放出绕身飞的萤火去撞敌人，撞一下就散；技能点亮满天星，全队的出手都带上光
const wormFlies = {
  trigger: 'auto',
  cooldownMs: 2500,
  aim: 'self',
  damage: 8,
  fireSfx: 'flutter',
  shape: {
    kind: 'summon',
    count: 3,
    minion: { look: { emoji: '1f7e1', size: 0.4 }, speed: 8, orbit: { radius: 0.8, spinRadPerSec: 3 } },
    lifeMs: 5000,
  },
} satisfies AbilityDef

const wormFlies2 = { ...wormFlies, shape: { ...wormFlies.shape, count: 4 } } satisfies AbilityDef

const wormFlies3 = {
  ...wormFlies2,
  onHit: [
    { kind: 'reveal', durationMs: 2000 },
    { kind: 'status', status: 'exposed', ms: 2000, value: 1.1 },
  ],
} satisfies AbilityDef

const wormStars = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xfff59d,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'imbue', element: 'light', ms: 8000 },
    { kind: 'status', status: 'speed', ms: 4000, value: 1.15 },
  ],
} satisfies AbilityDef

export const abilities = { wormFlies, wormFlies2, wormFlies3, wormStars } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f41b',
  name: '萤火虫',
  element: 'light',
  desc: '尾巴一亮一亮的萤火虫：隔一阵放出一群绕身飞的萤火，自己去撞敌人，撞一下就散；技能点亮满天星，全队的出手都带上光元素，专克暗元素的敌人',
  role: 'summoner',
  tags: ['damage', 'support', 'summon'],
  body: { drag: 5, mass: 0.6 },
  stats: { moveSpeed: 4.8, maxStamina: 110, staminaRegen: 60, exertion: 1 },
  skill: { name: '满天星', icon: '1f386', desc: '全队的出手附上光元素 8 秒（光克暗），移速 ×1.15 4 秒', cdMs: 15_000, ability: 'wormStars' },
  weapons: [],
  innate: [
    {
      name: '流萤',
      icon: '1f7e1',
      base: 'wormFlies',
      upgrades: [
        { ability: 'wormFlies2', card: { icon: '1f320', name: '萤群', desc: '一次放出 4 只萤火' } },
        { ability: 'wormFlies3', card: { icon: '1f4a1', name: '萤光', desc: '萤火撞中的敌人显形 2 秒，2 秒内受到的伤害 ×1.1' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
