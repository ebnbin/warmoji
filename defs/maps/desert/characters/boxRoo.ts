import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🦘 拳击袋鼠：左右勾拳连着打，两轮之后一记上勾拳把人打飞；技能朝一个方向飞踢
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

const boxRooHook3 = {
  ...boxRooHook,
  cycle: [boxRooHook, { ...boxRooUppercut, onHit: [{ kind: 'knockup', durationMs: 500, height: 1.2, onLand: [{ kind: 'shove', distance: 2, ms: 240 }] }] }],
} satisfies AbilityDef

const boxRooKick = {
  trigger: 'manual',
  aim: 'stick',
  damage: 45,
  knockback: 5,
  fireSfx: 'jump',
  shape: { kind: 'leap', distance: 5, ms: 450, height: 1.4, radius: 1.4 },
} satisfies AbilityDef

export const abilities = { boxRooHook, boxRooHook2, boxRooHook3, boxRooKick } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f998',
  name: '拳击袋鼠',
  element: 'earth',
  desc: '戴着拳套的袋鼠：左右勾拳一下接一下，打完两轮再补一记上勾拳把人打飞；技能朝一个方向飞踢过去，落地踹开一圈',
  role: 'bruiser',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 1.2 },
  stats: { moveSpeed: 6.2, maxStamina: 120, staminaRegen: 70, exertion: 1 },
  skill: { name: '飞踢', icon: '1f9b6', desc: '朝摇杆方向跃出 5 格，落地时 1.4 格内的敌人挨一记重踢并被踹开', cdMs: 10_000, ability: 'boxRooKick', aim: true },
  weapons: [],
  innate: [
    {
      name: '左右勾拳',
      icon: '1f94a',
      base: 'boxRooHook',
      upgrades: [
        { ability: 'boxRooHook2', card: { icon: '1f4a5', name: '上勾拳', desc: '每打完两轮勾拳接一记上勾拳，把人打飞 0.5 秒' } },
        { ability: 'boxRooHook3', card: { icon: '1f998', name: '尾撑踢', desc: '被上勾拳打飞的敌人一落地，再被尾巴撑着一脚踹出 2 格' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
