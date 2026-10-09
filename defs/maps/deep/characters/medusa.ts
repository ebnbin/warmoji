import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🪼 水母：本身是雷，近身打它的被蜇；触须放电在扎堆的敌人之间连跳，挨电的都被打断；技能把身边一片敌人连上电丝，撑到最后的被电晕，身边 3 格同时每秒通一下电
const medusaZap = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 6,
  damage: 13,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'chain', hops: 2, hopRange: 2.5, decay: 0.75 },
} satisfies AbilityDef

const medusaZap2 = { ...medusaZap, shape: { ...medusaZap.shape, hops: 4 } } satisfies AbilityDef

const medusaZap3 = { ...medusaZap2, onHit: [{ kind: 'attackSlow', mul: 1.3, durationMs: 1500 }] } satisfies AbilityDef

// 跟随的场一条能力只放得出一次，要能再放又跟着自己走，只能写成每秒在身边炸一圈的连发
const medusaField = {
  trigger: 'manual',
  aim: 'self',
  damage: 12,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 3, at: 'self' },
  repeat: { count: 4, delayMs: 1000 },
} satisfies AbilityDef

const medusaNet = {
  trigger: 'manual',
  aim: 'self',
  damage: 8,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [
    {
      kind: 'tether',
      ms: 2000,
      range: 6.5,
      onHold: [{ kind: 'stun', durationMs: 1500 }, { kind: 'damage', amount: 24 }],
      onBreak: [{ kind: 'damage', amount: 10 }],
      color: 0xffd54f,
    },
  ],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'cast', ability: medusaField }] }],
} satisfies AbilityDef

export const abilities = { medusaZap, medusaZap2, medusaZap3, medusaNet } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1fabc',
  name: '水母',
  element: 'thunder',
  desc: '漂在水里的水母，本身是雷，近身打它的反被蜇 5 点、被打断：触须放电，一道电流从 6 格内最近的敌人起，在 2.5 格内的敌人之间连跳两次、一跳弱四分之一，挨电的都被打断，电流还各分一半跳给身边另一个敌人，湿的连成一片一起挨；技能把身边 5 格内的敌人都连上电丝，撑到最后还没挣断的被电晕，身边 3 格同时每秒通一下电',
  role: 'area',
  tags: ['damage', 'control', 'area', 'ranged'],
  body: { drag: 5, mass: 0.6 },
  stats: { moveSpeed: 5.2, maxStamina: 90, staminaRegen: 70, exertion: 0.9, thorns: 5 },
  skill: {
    name: '电网',
    icon: '1f578',
    desc: '5 格内的敌人各挨 8 点，都连上电丝 2 秒：撑到最后还在 6.5 格内的电晕 1.5 秒、再挨 24 点，跑远挣断的挨 10 点；同时身边 3 格每秒电一下，共四下，每下 12 点',
    cdMs: 15_000,
    ability: 'medusaNet',
  },
  weapons: [],
  innate: [
    {
      name: '触须电',
      icon: '1fabc',
      base: 'medusaZap',
      upgrades: [
        { ability: 'medusaZap2', card: { icon: '1f517', name: '连锁', desc: '电流在敌人之间连跳四次' } },
        { ability: 'medusaZap3', card: { icon: '26a1', name: '麻痹', desc: '电到的敌人 1.5 秒内出手冷却 ×1.3' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
