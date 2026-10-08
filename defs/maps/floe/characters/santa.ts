import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { ring, shot } from '../../../kit.ts'

// 🎅 圣诞老人：朝敌人抛礼物，砸中就炸开一片，大礼包还会裂成三个；平安夜从天上砸下一堆礼物
const gift = { ...shot('1f381', 9, 0.55), flight: { kind: 'arc', peakM: 1.8 } } as const

const giftBurst = { kind: 'blast', radius: 1.6, ratio: 1, knockback: 2, ring: ring(0xfff59d) } as const

const santaGift = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 6.5,
  damage: 18,
  knockback: 2,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: gift, lifeMs: 1000 },
  onHit: [giftBurst],
} satisfies AbilityDef

const santaGift2 = { ...santaGift, shape: { ...santaGift.shape, projectile: { ...gift, split: { count: 3, spreadDeg: 90, ratio: 0.5 } } } } satisfies AbilityDef

const santaGift3 = { ...santaGift2, onHit: [giftBurst, { kind: 'to', who: { side: 'foes', radius: 1.6 }, then: [{ kind: 'stun', durationMs: 300 }] }] } satisfies AbilityDef

const santaSilentNight = {
  trigger: 'manual',
  aim: 'nearest',
  range: 9,
  damage: 20,
  fireSfx: 'boom',
  shape: { kind: 'drop', targets: 8, look: { emoji: '1f381', size: 0.9 }, fromAbove: 4, dropMs: 600, staggerMs: 120 },
  onHit: [{ kind: 'blast', radius: 1, ratio: 0.5, knockback: 1, ring: ring(0xfff59d) }],
} satisfies AbilityDef

export const abilities = { santaGift, santaGift2, santaGift3, santaSilentNight } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f385',
  name: '圣诞老人',
  element: 'light',
  desc: '扛着一大袋礼物：朝敌人抛礼物，砸中就在 1.6 格内炸开一片；技能平安夜从天上砸下一堆礼物',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 1.4 },
  stats: { moveSpeed: 5, maxStamina: 110, staminaRegen: 60, exertion: 1.1 },
  skill: { name: '平安夜', icon: '1f514', desc: '在最近的八个敌人头上各砸下一个礼物，每个 20 点伤害，再在落点炸开 1 格，周围的敌人吃一半', cdMs: 14_000, ability: 'santaSilentNight' },
  weapons: [],
  innate: [
    {
      name: '礼物炸弹',
      icon: '1f381',
      base: 'santaGift',
      upgrades: [
        { ability: 'santaGift2', card: { icon: '1f4e6', name: '大礼包', desc: '礼物砸中或落地后再裂成三个小礼物往前飞，每个五成伤害，砸中照样炸开' } },
        { ability: 'santaGift3', card: { icon: '1f389', name: '惊喜', desc: '礼物炸开时 1.6 格内的敌人都麻 0.3 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
