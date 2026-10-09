import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🥳 派对王：本身是火；礼炮给身边最伤的队友回血，彩带甩到敌人身上点着火、火再烧到贴着的敌人，两样轮着来；技能让全队开起狂欢、出手都点火

// 礼炮与彩带用不用得上都算放过，免得轮换卡在其中一式
const salute = (then: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 1300,
    aim: 'self',
    fireSfx: 'chirp',
    shape: { kind: 'world' },
    onHit: [{ kind: 'to', who: { side: 'allies', radius: 4.5, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 }, then }],
  }) satisfies AbilityDef

const streamerThrow = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6,
  damage: 9,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f38a', 9, 0.42), lifeMs: 1200 },
} satisfies AbilityDef

const streamer = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'cast', ability: streamerThrow }],
} satisfies AbilityDef

const HEAL = { kind: 'heal', amount: 12 } as const satisfies Effect
const HYPE = { kind: 'status', status: 'speed', ms: 2000, value: 1.15 } as const satisfies Effect
const CAKE = { kind: 'mend', amount: 3, tickMs: 500, durationMs: 3000 } as const satisfies Effect

const partyHostParty = { ...salute([HEAL]), cycle: [streamer] } satisfies AbilityDef
const partyHostParty2 = { ...salute([HEAL, HYPE]), cycle: [streamer] } satisfies AbilityDef
const partyHostParty3 = { ...salute([HEAL, HYPE, CAKE]), cycle: [streamer] } satisfies AbilityDef

const partyHostFiesta = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xffab40,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'healRatio', ratio: 0.2 }, { kind: 'status', status: 'dmg', ms: 6000, value: 1.25 }, { kind: 'imbue', element: 'fire', ms: 6000 }],
} satisfies AbilityDef

export const abilities = { partyHostParty, partyHostParty2, partyHostParty3, partyHostFiesta } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f973',
  name: '派对王',
  element: 'fire',
  desc: '走到哪热闹到哪的派对王，本身是火、点不着：礼炮与彩带每 1.3 秒轮着放，礼炮给 4.5 格内最伤的队友回血，中了毒的回不了；彩带甩向 6 格内最近的敌人、把它点着，火会烧到贴着它的敌人；轮到的那样用不上就空过；技能让全队回血、加伤、出手都点火，打进毒云就炸开',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 6, maxStamina: 90, staminaRegen: 80, exertion: 0.8 },
  skill: { name: '狂欢', icon: '1f389', desc: '全队回复 20% 生命，6 秒内伤害 ×1.25、出手都带上火：打中的敌人都点着，打在毒云里的把毒云引爆', cdMs: 16_000, ability: 'partyHostFiesta' },
  weapons: [],
  innate: [
    {
      name: '派对',
      icon: '1f973',
      base: 'partyHostParty',
      upgrades: [
        { ability: 'partyHostParty2', card: { icon: '1f3b6', name: '嗨起来', desc: '礼炮治到的队友 2 秒内移速 ×1.15' } },
        { ability: 'partyHostParty3', card: { icon: '1f382', name: '蛋糕', desc: '礼炮治到的队友再挂上回春：3 秒里每半秒回 3 点' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
