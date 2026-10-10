import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧞 灯神：放出绕身打转的沙灵，见到敌人就扑上去把它撞开，带上电后撞中的被打断、电流跳给旁边一个；技能一连许下三个愿望：降雷打断全场、回血、全队带电
const sandSpirit = { look: { emoji: '1f300', size: 0.55 }, speed: 7, orbit: { radius: 0.8, spinRadPerSec: 3 } } as const

const djinnSpirits = {
  trigger: 'auto',
  cooldownMs: 1600,
  aim: 'self',
  element: 'physical',
  damage: 12,
  knockback: 2,
  fireSfx: 'warp',
  shape: { kind: 'summon', count: 2, minion: sandSpirit, lifeMs: 4500 },
} satisfies AbilityDef

const djinnSpirits2 = { ...djinnSpirits, shape: { ...djinnSpirits.shape, count: 3 } } satisfies AbilityDef

const djinnSpirits3 = { ...djinnSpirits2, element: 'thunder', damage: 10, knockback: 0 } satisfies AbilityDef

const thirdWish = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xffd54f,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'imbue', element: 'thunder', ms: 5000 },
    { kind: 'status', status: 'speed', ms: 5000, value: 1.2 },
  ],
} satisfies AbilityDef

const secondWish = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'revive',
  color: 0x80cbc4,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'healRatio', ratio: 0.3 }],
  recast: { windowMs: 5000, ability: thirdWish },
} satisfies AbilityDef

// 主动技能写成 cycle 会在放完第一式后卡住，所以三个愿望用连段一段接一段地许
const djinnWishes = {
  trigger: 'manual',
  aim: 'self',
  damage: 20,
  fireSfx: 'zap',
  color: 0xffd54f,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'foes' },
  recast: { windowMs: 5000, ability: secondWish },
} satisfies AbilityDef

export const abilities = { djinnSpirits, djinnSpirits2, djinnSpirits3, djinnWishes } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9de',
  name: '灯神',
  element: 'thunder',
  desc: '神灯里飘出来的灯神，本身是雷、不受传导：放出绕身打转的沙灵，见到敌人就扑上去把它撞开、自己散掉；技能一连许下三个愿望：降雷打断全场的出手、全队回血、全队带电疾行',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.4, maxStamina: 100, staminaRegen: 70, exertion: 0.6 },
  skill: {
    name: '三个愿望',
    icon: '1f320',
    desc: '按一下许一个愿，5 秒内再按许下一个：一愿全场敌人各挨一道 20 点的雷，正在蓄的力、没打完的连发全被打断，电流再跳给身边另一个敌人吃一半；二愿全队回三成生命，中了毒的回不了；三愿全队 5 秒内出手都带雷、移速 ×1.2。三个许完或过了时限才开始冷却',
    cdMs: 18_000,
    ability: 'djinnWishes',
  },
  weapons: [],
  innate: [
    {
      name: '神灯精灵',
      icon: '1fa94',
      base: 'djinnSpirits',
      upgrades: [
        { ability: 'djinnSpirits2', card: { icon: '1f300', name: '三灵', desc: '每次放出 3 个沙灵' } },
        { ability: 'djinnSpirits3', card: { icon: '26a1', name: '雷灵', desc: '沙灵带上电：撞中的敌人被打断出手，电流再跳给 2.5 格内另一个敌人吃一半；带电的沙灵每只 10 点，不再撞开' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
