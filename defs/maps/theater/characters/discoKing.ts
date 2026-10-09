import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { zoneLook } from '../../../kit.ts'

// 🕺 舞王：本身是冰；原地一转两圈扫开身边的敌人，这两下是物理，敲得碎冻住的；技能在脚下铺开冒着干冰白雾的舞池，把池里的敌人一层层冻住
const discoKingSpin = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 2.2,
  damage: 8,
  element: 'physical',
  fireSfx: 'whoosh',
  color: 0xb388ff,
  shape: { kind: 'disc', radius: 1.7, at: 'self' },
  repeat: { count: 2, delayMs: 250 },
} satisfies AbilityDef

const discoKingSpin2 = { ...discoKingSpin, onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'charm', durationMs: 1200 }] }] } satisfies AbilityDef

const discoKingSpin3 = { ...discoKingSpin2, reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'status', status: 'speed', ms: 1000, value: 1.2 }] }] } satisfies AbilityDef

const discoKingFloor = {
  trigger: 'manual',
  aim: 'self',
  damage: 4,
  fireSfx: 'upgrade',
  shape: { kind: 'zone', radius: 3.5, durationMs: 5000, tickMs: 500, pull: 1, visual: zoneLook(0x80deea) },
} satisfies AbilityDef

export const abilities = { discoKingSpin, discoKingSpin2, discoKingSpin3, discoKingFloor } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f57a',
  name: '舞王',
  element: 'ice',
  desc: '一进敌群就停不下来的舞王，本身是冰、冻不住：原地一转两圈，扫开身边的敌人，这两下是物理，打在冻住的身上敲碎冰、伤害翻倍；技能在脚下铺开冒着干冰白雾的舞池，池里的敌人一层层发冷、冻住，还被一点点卷到中间；靠吸血撑着，中了毒就回不了血',
  role: 'bruiser',
  tags: ['damage', 'melee', 'area'],
  body: { drag: 4.5, mass: 1.1 },
  stats: { moveSpeed: 6.2, maxStamina: 120, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '干冰舞池', icon: '1faa9', desc: '在脚下铺开 3.5 格的干冰舞池 5 秒：池里的敌人每半秒挨一下冰、冷一层，叠满三层冻住 1.5 秒，湿的当场冻住；每秒被往中间卷 1 格', cdMs: 14_000, ability: 'discoKingFloor' },
  weapons: [],
  innate: [
    {
      name: '旋转舞步',
      icon: '1f57a',
      base: 'discoKingSpin',
      upgrades: [
        { ability: 'discoKingSpin2', card: { icon: '1f483', name: '魅力四射', desc: '同一个敌人挨满三下就被魅惑 1.2 秒' } },
        { ability: 'discoKingSpin3', card: { icon: '1f319', name: '太空步', desc: '每次出手后 1 秒内移速 ×1.2' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
