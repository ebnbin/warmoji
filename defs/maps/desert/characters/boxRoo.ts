import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🦘 拳击袋鼠：左右勾拳连着打，两轮之后一记上勾拳把人打飞，落地再一脚踹到墙上撞晕；技能霸体硬吃一阵，记下挨的打加倍震回去，再按一次提前震开并飞踢出去
const boxRooHook = {
  trigger: 'auto',
  cooldownMs: 850,
  aim: 'nearest',
  range: 2,
  damage: 12,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 1.8, radius: 0.45, ms: 120 },
  repeat: { count: 2, delayMs: 150 },
} satisfies AbilityDef

const boxRooUppercut = {
  trigger: 'auto',
  cooldownMs: 850,
  aim: 'nearest',
  range: 2,
  damage: 22,
  fireSfx: 'whoosh',
  shape: { kind: 'segment', reach: 1.6, radius: 0.55, ms: 160 },
  onHit: [{ kind: 'knockup', durationMs: 500, height: 1.2 }],
} satisfies AbilityDef

const boxRooHook2 = { ...boxRooHook, cycle: [boxRooHook, boxRooUppercut] } satisfies AbilityDef

const tailKick = { kind: 'shove', distance: 2, ms: 240, onWall: [{ kind: 'stun', durationMs: 800 }] } as const

const boxRooHook3 = {
  ...boxRooHook,
  cycle: [boxRooHook, { ...boxRooUppercut, onHit: [{ kind: 'knockup', durationMs: 500, height: 1.2, onLand: [tailKick] }] }],
} satisfies AbilityDef

// 飞踢起跳时把还没到期的记伤当场引爆，炸在起跳处
const boxRooKick = {
  trigger: 'manual',
  aim: 'stick',
  damage: 45,
  knockback: 5,
  breach: 0.5,
  fireSfx: 'jump',
  shape: { kind: 'leap', distance: 5, ms: 450, height: 1.4, radius: 1.4 },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'detonate', mark: 'store' }] }],
} satisfies AbilityDef

const boxRooGrit = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'thud',
  shape: { kind: 'world' },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'store', ms: 2500, ratio: 1.6, then: [{ kind: 'blast', radius: 3, ratio: 1, knockback: 10, breach: 1, ring: ring(0xff7043) }] },
        { kind: 'guard', mul: 0.5, durationMs: 2500 },
        { kind: 'unstoppable', durationMs: 2500 },
      ],
    },
  ],
  recast: { windowMs: 2500, ability: boxRooKick },
} satisfies AbilityDef

export const abilities = { boxRooHook, boxRooHook2, boxRooHook3, boxRooGrit } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f998',
  name: '拳击袋鼠',
  desc: '戴着拳套的袋鼠：左右勾拳一下接一下，打完两轮再补一记上勾拳把人打飞；拳拳吸血，中了毒就吸不回来；技能霸体硬吃 2.5 秒，把挨的打记下来加倍震回去，再按一次就当场震开、朝一个方向飞踢出去',
  role: 'bruiser',
  tags: ['damage', 'defense', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 1.2 },
  stats: { moveSpeed: 6.2, maxStamina: 120, staminaRegen: 70, exertion: 1 },
  skill: {
    name: '以牙还牙',
    icon: '1f4a2',
    desc: '2.5 秒内霸体，受到的伤害减半并记下，到时以记下的 1.6 倍为伤害震开身周 3 格，墙也震得裂；2.5 秒内再按一次，立刻在原地震开，并朝摇杆方向跃出 5 格，落地时 1.4 格内的敌人挨一记重踢并被踹开',
    cdMs: 13_000,
    ability: 'boxRooGrit',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '左右勾拳',
      icon: '1f94a',
      base: 'boxRooHook',
      upgrades: [
        { ability: 'boxRooHook2', card: { icon: '1f4a5', name: '上勾拳', desc: '每打完两轮勾拳接一记上勾拳，把人打飞 0.5 秒' } },
        { ability: 'boxRooHook3', card: { icon: '1f998', name: '尾撑踢', desc: '被上勾拳打飞的敌人一落地，再被尾巴撑着一脚踹出 2 格，撞上墙或标志物的晕 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
