import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🪼 水母：触须放电，在敌人之间连跳；技能把身边一片敌人连上电丝，撑到最后的被电晕，身边 3 格同时一直通着电
const medusaZap = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6,
  damage: 15,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'chain', hops: 3, hopRange: 2.5, decay: 0.8 },
} satisfies AbilityDef

const medusaZap2 = { ...medusaZap, shape: { ...medusaZap.shape, hops: 5 } } satisfies AbilityDef

const medusaZap3 = { ...medusaZap2, onHit: [{ kind: 'slow', factor: 0.7, durationMs: 1000 }] } satisfies AbilityDef

// 跟随的场一条能力只放得出一次，要能再放又跟着自己走，只能写成每半秒在身边炸一圈的连发
const medusaField = {
  trigger: 'manual',
  aim: 'self',
  damage: 8,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 3, at: 'self' },
  repeat: { count: 8, delayMs: 500 },
} satisfies AbilityDef

const medusaNet = {
  trigger: 'manual',
  aim: 'self',
  damage: 10,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [
    {
      kind: 'tether',
      ms: 2000,
      range: 6.5,
      onHold: [{ kind: 'stun', durationMs: 1500 }, { kind: 'damage', amount: 30 }],
      onBreak: [{ kind: 'slow', factor: 0.5, durationMs: 1500 }],
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
  desc: '漂在水里的水母：触须放电，一道电流在敌人之间连跳三次、一跳弱一点；技能把身边 5 格内的敌人都连上电丝，撑到最后还没挣断的被电晕，跑远挣断的只吃减速，身边 3 格同时一直通着电',
  role: 'area',
  tags: ['damage', 'control', 'area', 'ranged'],
  body: { drag: 5, mass: 0.6 },
  stats: { moveSpeed: 5.2, maxStamina: 90, staminaRegen: 70, exertion: 0.9 },
  skill: {
    name: '电网',
    icon: '1f578',
    desc: '5 格内的敌人各挨 10 点，都连上电丝 2 秒：撑到最后还在 6.5 格内的电晕 1.5 秒、再挨 30 点，跑远挣断的只减速 50% 1.5 秒；同时 4 秒里身边 3 格每半秒电一下，每下 8 点',
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
        { ability: 'medusaZap2', card: { icon: '1f517', name: '连锁', desc: '电流在敌人之间连跳五次' } },
        { ability: 'medusaZap3', card: { icon: '26a1', name: '麻痹', desc: '电到的敌人减速 30%，持续 1 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
