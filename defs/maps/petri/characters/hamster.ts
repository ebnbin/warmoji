import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐹 仓鼠：鼓着腮帮子贴身一次挥两拳，越打跑得越快；技能钻进仓鼠球朝一个方向滚出去
const hamsterJab = {
  trigger: 'auto',
  cooldownMs: 750,
  aim: 'nearest',
  range: 1.7,
  damage: 11,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 1.6, radius: 0.5, ms: 120 },
  repeat: { count: 2, delayMs: 150 },
} satisfies AbilityDef

const hamsterJab2 = {
  ...hamsterJab,
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'status', status: 'speed', ms: 1500, value: 1.15 }] }],
} satisfies AbilityDef

const hamsterJab3 = {
  ...hamsterJab2,
  reactions: [...hamsterJab2.reactions, { on: 'kill', to: 'self', effects: [{ kind: 'chance', p: 0.25, then: [{ kind: 'coins', count: 1 }] }] }],
} satisfies AbilityDef

const hamsterBall = {
  trigger: 'manual',
  aim: 'stick',
  damage: 36,
  knockback: 4,
  fireSfx: 'charge',
  shape: { kind: 'sprint', distance: 6, ms: 450, radius: 1 },
  reactions: [{ on: 'cast', to: 'self', effects: [{ kind: 'unstoppable', durationMs: 500 }] }],
} satisfies AbilityDef

export const abilities = { hamsterJab, hamsterJab2, hamsterJab3, hamsterBall } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.02 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.04 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f439',
  name: '仓鼠',
  element: 'earth',
  desc: '鼓着腮帮子贴身连挥两拳；技能钻进仓鼠球朝摇杆方向滚出一大段，撞开沿路的敌人，滚的时候什么控制都不吃',
  role: 'bruiser',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 0.8 },
  stats: { moveSpeed: 6.4, maxStamina: 120, staminaRegen: 80, exertion: 1 },
  skill: { name: '仓鼠球', icon: '1f6de', desc: '钻进球里朝摇杆方向滚出 6 格，沿路的敌人挨一下、被撞开；滚的时候霸体', cdMs: 10_000, ability: 'hamsterBall', aim: true },
  weapons: [],
  innate: [
    {
      name: '颊囊拳',
      icon: '1f439',
      base: 'hamsterJab',
      upgrades: [
        { ability: 'hamsterJab2', card: { icon: '1f3a1', name: '跑轮', desc: '每次出拳后 1.5 秒内移速 ×1.15' } },
        { ability: 'hamsterJab3', card: { icon: '1f330', name: '囤积', desc: '打死敌人时有 25% 的几率在脚下多掉 1 枚金币' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
