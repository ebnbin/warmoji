import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🧞 灯神：放出绕身打转的沙灵，见到敌人就扑上去撞散；技能一连许下三个愿望
const sandSpirit = { look: { emoji: '1f300', size: 0.55 }, speed: 7, orbit: { radius: 0.8, spinRadPerSec: 3 } } as const

const djinnSpirits = {
  trigger: 'auto',
  cooldownMs: 1600,
  aim: 'self',
  damage: 12,
  knockback: 1,
  fireSfx: 'warp',
  shape: { kind: 'summon', count: 2, minion: sandSpirit, lifeMs: 4500 },
} satisfies AbilityDef

const djinnSpirits2 = { ...djinnSpirits, shape: { ...djinnSpirits.shape, count: 3 } } satisfies AbilityDef

const djinnSpirits3 = { ...djinnSpirits2, onHit: [{ kind: 'stun', durationMs: 300 }] } satisfies AbilityDef

const thirdWish = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xffd54f,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'imbue', element: 'thunder', ms: 6000 },
    { kind: 'status', status: 'speed', ms: 6000, value: 1.2 },
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
  damage: 25,
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
  desc: '神灯里飘出来的灯神：放出绕身打转的沙灵，见到敌人就扑上去撞一下散掉；技能一连许下三个愿望：降雷、回血、带电疾行',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.4, maxStamina: 100, staminaRegen: 70, exertion: 0.6 },
  skill: {
    name: '三个愿望',
    icon: '1f320',
    desc: '按一下许一个愿，5 秒内再按许下一个：一愿全场敌人各挨一道雷；二愿全队回三成生命；三愿全队 6 秒内出手都带雷、移速 ×1.2。三个许完或过了时限才开始冷却',
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
        { ability: 'djinnSpirits3', card: { icon: '26a1', name: '雷灵', desc: '沙灵撞中的敌人麻 0.3 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
