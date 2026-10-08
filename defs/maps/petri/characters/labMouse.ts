import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🐭 小白鼠：闪到敌人身后咬一口、留下药毒再溜回来，咬死了立刻再扑；技能抄迷宫近路隐身穿出一段
const labMouseBite = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 5,
  damage: 22,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.5, strikeMs: 250 },
  onHit: [{ kind: 'poison', damage: 0, ratio: 0.1, tickMs: 500, durationMs: 3000 }],
} satisfies AbilityDef

const labMouseBite2 = {
  ...labMouseBite,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'healRatio', ratio: 0.06 }, { kind: 'refresh', what: 'this' }] }],
} satisfies AbilityDef

const labMouseBite3 = { ...labMouseBite2, shape: { ...labMouseBite2.shape, execute: { hpRatio: 0.35, mul: 1.7 } } } satisfies AbilityDef

const labMouseShortcut = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'warp',
  shape: { kind: 'world' },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'warp', distance: 6 },
        { kind: 'empower', hits: 1, then: [{ kind: 'damage', amount: 40 }, { kind: 'stun', durationMs: 600 }] },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { labMouseBite, labMouseBite2, labMouseBite3, labMouseShortcut } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f42d',
  name: '小白鼠',
  element: 'dark',
  desc: '从实验室里逃出来的小白鼠：闪到敌人身后咬一口就溜回来，咬过的慢慢中毒；技能抄迷宫的近路隐身穿出一段，下一口咬得格外狠',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.5 },
  stats: { moveSpeed: 7.4, maxStamina: 85, staminaRegen: 95, exertion: 0.7 },
  skill: { name: '迷宫捷径', icon: '1f9c0', desc: '朝摇杆方向隐身穿行 6 格；下一口多造成 40 点伤害并眩晕 0.6 秒', cdMs: 10_000, ability: 'labMouseShortcut', aim: true },
  weapons: [],
  innate: [
    {
      name: '实验品',
      icon: '1f42d',
      base: 'labMouseBite',
      upgrades: [
        { ability: 'labMouseBite2', card: { icon: '1f48a', name: '抗药性', desc: '咬死敌人回 6% 生命，并立刻可以再扑' } },
        { ability: 'labMouseBite3', card: { icon: '1f52c', name: '变异', desc: '对生命不高于 35% 的敌人伤害 ×1.7' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
